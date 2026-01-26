/**
 * Slack Bot
 *
 * Handles Slack interactions using Socket Mode.
 */

import { App, LogLevel } from "@slack/bolt";
import type { Config } from "../config/index.js";
import type { ClaudeAgent, PendingWriteOperation, TriageSessionData } from "../ai/agent.js";
import type { ConfirmationManager } from "../safety/confirmations.js";
import type { ReminderManager } from "../reminders/index.js";
import type { TriageSessionManager } from "../triage/index.js";
import type { MessageContext, ConfirmableOperationType } from "../types/index.js";
import { getSlackErrorMessage } from "../utils/errors.js";
import type { WorkflowManager, WorkflowSession } from "../workflows/index.js";
import type { AshbyService } from "../ashby/index.js";

export class SlackBot {
  private readonly app: App;
  private readonly agent: ClaudeAgent;
  private readonly confirmations: ConfirmationManager;
  private readonly triageSessions: TriageSessionManager;
  private readonly reminders: ReminderManager | undefined;
  private readonly workflows: WorkflowManager | undefined;
  private readonly ashby: AshbyService | undefined;

  constructor(
    config: Config,
    agent: ClaudeAgent,
    confirmations: ConfirmationManager,
    reminders?: ReminderManager,
    triageSessions?: TriageSessionManager,
    workflows?: WorkflowManager,
    ashby?: AshbyService
  ) {
    this.app = new App({
      token: config.slack.botToken,
      appToken: config.slack.appToken,
      socketMode: true,
      logLevel: LogLevel.INFO,
    });

    this.agent = agent;
    this.confirmations = confirmations;
    this.reminders = reminders;
    this.triageSessions = triageSessions!;
    this.workflows = workflows;
    this.ashby = ashby;

    this.setupEventHandlers();
  }

  /**
   * Start the bot
   */
  async start(): Promise<void> {
    await this.app.start();
    console.log("⚡ Ashby Slack Bot is running!");
  }

  /**
   * Stop the bot
   */
  async stop(): Promise<void> {
    await this.app.stop();
    console.log("Ashby Slack Bot stopped.");
  }

  /**
   * Get the Slack client for external use (e.g., scheduled messages)
   */
  getClient(): App["client"] {
    return this.app.client;
  }

  /**
   * Setup all event handlers
   */
  private setupEventHandlers(): void {
    // Handle @mentions
    this.app.event("app_mention", async ({ event, say }) => {
      // Skip if we can't identify the user
      if (!event.user) return;

      const cleanedText = this.cleanMentionText(event.text);

      // Skip if the message is empty (just an @mention with no text)
      if (!cleanedText.trim()) {
        await say({
          text: "Hi! How can I help you with Ashby today? Try asking about open jobs, candidates, or the hiring pipeline.",
          thread_ts: event.thread_ts ?? event.ts,
        });
        return;
      }

      const context: MessageContext = {
        channelId: event.channel,
        threadTs: event.thread_ts ?? event.ts,
        userId: event.user,
        text: cleanedText,
        messageTs: event.ts,
      };

      await this.handleMessage(context, say as (message: string | object) => Promise<unknown>);
    });

    // Handle reaction additions (for confirmations, triage, and workflows)
    this.app.event("reaction_added", async ({ event }) => {
      // Check for workflow reactions first
      if (this.workflows) {
        const workflowSession = this.workflows.findByMessage(
          event.item.channel,
          event.item.ts
        );

        if (workflowSession) {
          await this.handleWorkflowReaction(workflowSession, event.reaction, event.user);
          return;
        }
      }

      // Check for triage reactions
      if (this.triageSessions) {
        const triageSession = this.triageSessions.findByMessage(
          event.item.channel,
          event.item.ts
        );

        if (triageSession && event.user === triageSession.userId) {
          if (event.reaction === "white_check_mark") {
            await this.handleTriageDecision(triageSession, "advance");
            return;
          } else if (event.reaction === "x") {
            await this.handleTriageDecision(triageSession, "reject");
            return;
          } else if (event.reaction === "thinking_face") {
            await this.handleTriageDecision(triageSession, "skip");
            return;
          }
        }
      }

      // Standard confirmation handling
      if (event.reaction !== "white_check_mark" && event.reaction !== "x") {
        return;
      }

      const confirmation = this.confirmations.findByMessageTs(
        event.item.channel,
        event.item.ts
      );

      if (!confirmation) return;

      // Verify the user who reacted is the one who requested the action
      if (event.user !== confirmation.userId) {
        return;
      }

      if (event.reaction === "white_check_mark") {
        await this.handleConfirmation(confirmation, true);
      } else if (event.reaction === "x") {
        await this.handleConfirmation(confirmation, false);
      }
    });

    // Handle direct messages (disabled for MVP per spec)
    this.app.event("message", async ({ event }) => {
      // Skip bot messages and messages in threads
      if ("bot_id" in event || "thread_ts" in event) return;

      // DMs are out of scope for MVP
      if (event.channel_type === "im") {
        await this.app.client.chat.postMessage({
          channel: event.channel,
          text: "I'm currently only available in channels. Please @mention me in a channel instead!",
        });
      }
    });

    // Error handling
    this.app.error(async (error) => {
      console.error("Slack app error:", error);
    });
  }

  /**
   * Handle an incoming message
   */
  private async handleMessage(
    context: MessageContext,
    say: (message: string | object) => Promise<unknown>
  ): Promise<void> {
    try {
      // Show typing indicator
      await this.addReactionSafe(context.channelId, context.messageTs, "eyes");

      // Process with Claude
      const response = await this.agent.processMessage(context.text);

      // Remove typing indicator
      await this.removeReactionSafe(context.channelId, context.messageTs, "eyes");

      // Send response in thread
      const message = await say({
        text: response.text,
        thread_ts: context.threadTs,
      });

      const msgResponse = message as { ts?: string };
      const responseTs = msgResponse.ts ?? context.threadTs ?? context.messageTs;

      if (response.triage) {
        await this.startTriageSession(response.triage, context, responseTs);
      }

      // If there are pending confirmations, set them up
      if (response.pendingConfirmations.length > 0) {
        if (msgResponse.ts) {
          this.setupPendingConfirmations(
            response.pendingConfirmations,
            context,
            msgResponse.ts
          );
        }
      }
    } catch (error) {
      console.error("Error handling message:", error);

      // Remove typing indicator on error
      await this.removeReactionSafe(context.channelId, context.messageTs, "eyes");

      // Get a user-friendly error message based on the error type
      const userMessage = getSlackErrorMessage(error);

      await say({
        text: userMessage,
        thread_ts: context.threadTs,
      });
    }
  }

  /**
   * Setup pending confirmations from agent response
   */
  private setupPendingConfirmations(
    operations: PendingWriteOperation[],
    context: MessageContext,
    responseTs: string
  ): void {
    for (const op of operations) {
      const description = this.formatConfirmationDescription(op);
      this.confirmations.create({
        type: this.mapToolNameToConfirmationType(op.toolName),
        description,
        candidateIds: op.candidateId ? [op.candidateId] : [],
        payload: op,
        channelId: context.channelId,
        messageTs: responseTs,
        userId: context.userId,
      });
    }

    // Add reaction prompt to the message
    this.addReactionSafe(context.channelId, responseTs, "white_check_mark");
    this.addReactionSafe(context.channelId, responseTs, "x");
  }

  /**
   * Handle a confirmation response
   */
  private async handleConfirmation(
    confirmation: ReturnType<ConfirmationManager["get"]>,
    approved: boolean
  ): Promise<void> {
    if (!confirmation) return;

    const operation = confirmation.payload as PendingWriteOperation;

    if (approved) {
      if (operation.toolName === "set_reminder") {
        if (!this.reminders) {
          await this.app.client.chat.postMessage({
            channel: confirmation.channelId,
            thread_ts: confirmation.messageTs,
            text: "❌ Reminder service is not available. Please try again later.",
          });
          this.confirmations.complete(confirmation.id);
          return;
        }

        const input = operation.input as { remind_in?: string; note?: string };
        if (!operation.candidateId || !input.remind_in) {
          await this.app.client.chat.postMessage({
            channel: confirmation.channelId,
            thread_ts: confirmation.messageTs,
            text: "❌ Missing reminder details. Please provide a candidate and reminder time.",
          });
          this.confirmations.complete(confirmation.id);
          return;
        }

        try {
          const scheduleParams: {
            userId: string;
            candidateId: string;
            remindIn: string;
            note?: string;
          } = {
            userId: confirmation.userId,
            candidateId: operation.candidateId,
            remindIn: input.remind_in,
          };
          if (input.note !== undefined) {
            scheduleParams.note = input.note;
          }
          const scheduled = await this.reminders.scheduleReminder(scheduleParams);

          await this.app.client.chat.postMessage({
            channel: confirmation.channelId,
            thread_ts: confirmation.messageTs,
            text: `✅ Done! ${scheduled.message}`,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Failed to schedule reminder.";
          await this.app.client.chat.postMessage({
            channel: confirmation.channelId,
            thread_ts: confirmation.messageTs,
            text: `❌ Failed: ${message}`,
          });
        }

        this.confirmations.complete(confirmation.id);
        return;
      }

      const result = await this.agent.executeConfirmed(operation);

      await this.app.client.chat.postMessage({
        channel: confirmation.channelId,
        thread_ts: confirmation.messageTs,
        text: result.success
          ? `✅ Done! ${result.message}`
          : `❌ Failed: ${result.message}`,
      });
    } else {
      await this.app.client.chat.postMessage({
        channel: confirmation.channelId,
        thread_ts: confirmation.messageTs,
        text: "❌ Action cancelled.",
      });
    }

    // Remove the confirmation
    this.confirmations.complete(confirmation.id);
  }

  /**
   * Clean the @mention text to extract the actual message
   */
  private cleanMentionText(text: string): string {
    // Remove the @mention at the start
    return text.replace(/<@[A-Z0-9]+>/g, "").trim();
  }

  /**
   * Handle a triage decision from reaction
   */
  private async handleTriageDecision(
    session: ReturnType<TriageSessionManager["get"]>,
    decision: "advance" | "reject" | "skip"
  ): Promise<void> {
    if (!session) return;

    const result = this.triageSessions.recordDecision(session.userId, decision);
    if (!result) return;

    const { candidate, hasMore, nextCandidate } = result;

    // Log the decision
    console.log(
      `[Triage] User ${session.userId} ${decision}ed ${candidate.candidate?.name ?? "Unknown"}`
    );

    if (hasMore && nextCandidate) {
      // Show next candidate
      const progress = this.triageSessions.getProgress(session.userId);
      const cardText = this.triageSessions.formatCandidateCard(
        nextCandidate,
        progress?.current ?? 1,
        progress?.total ?? 1
      );

      const message = await this.app.client.chat.postMessage({
        channel: session.channelId,
        thread_ts: session.messageTs,
        text: cardText,
      });

      // Update session with new message timestamp for reactions
        if (message.ts) {
          this.triageSessions.updateMessageTs(session.userId, message.ts);

          // Add reaction prompts to new message
          await Promise.all([
            this.addReactionSafe(session.channelId, message.ts, "white_check_mark"),
            this.addReactionSafe(session.channelId, message.ts, "x"),
            this.addReactionSafe(session.channelId, message.ts, "thinking_face"),
          ]);
        }
    } else {
      // Triage complete - show summary
      const completedSession = this.triageSessions.endSession(session.userId);
      if (completedSession) {
        const summaryText = this.triageSessions.formatSummary(completedSession);

        await this.app.client.chat.postMessage({
          channel: session.channelId,
          thread_ts: session.messageTs,
          text: summaryText,
        });
      }
    }
  }

  /**
   * Map tool names to confirmable operation types
   */
  private mapToolNameToConfirmationType(toolName: string): ConfirmableOperationType {
    const mapping: Record<string, ConfirmableOperationType> = {
      move_candidate_stage: "move_stage",
      add_note: "add_note",
      schedule_interview: "schedule_interview",
      reschedule_interview: "reschedule_interview",
      cancel_interview: "cancel_interview",
      create_candidate: "create_candidate",
      apply_to_job: "apply_to_job",
      transfer_application: "transfer_application",
      reject_candidate: "reject_candidate",
      add_candidate_tag: "add_candidate_tag",
      create_offer: "create_offer",
      update_offer: "update_offer",
      approve_offer: "approve_offer",
      send_offer: "send_offer",
      set_reminder: "set_reminder",
    };
    return mapping[toolName] ?? "move_stage";
  }

  private formatConfirmationDescription(op: PendingWriteOperation): string {
    const input = op.input as {
      name_or_email?: string;
      candidate_name?: string;
      candidate_email?: string;
      name?: string;
      email?: string;
      offer_id?: string;
      interview_schedule_id?: string;
      target_stage?: string;
      content?: string;
      job_title?: string;
      job_id?: string;
      tag_id?: string;
      start_time?: string;
      remind_in?: string;
      note?: string;
      salary?: number;
      start_date?: string;
    };

    // Get candidate identifier
    const candidateLabel =
      input?.name_or_email ??
      input?.candidate_email ??
      input?.candidate_name ??
      input?.email ??
      input?.name ??
      op.candidateId;

    // Build human-readable descriptions for each operation type
    switch (op.toolName) {
      case "move_candidate_stage":
        if (candidateLabel && input?.target_stage) {
          return `Move *${candidateLabel}* to *${input.target_stage}*`;
        }
        if (candidateLabel) {
          return `Move *${candidateLabel}* to a new stage`;
        }
        return "Move candidate to a new stage";

      case "add_note":
        if (candidateLabel) {
          const preview = input?.content?.substring(0, 50) ?? "";
          return `Add note to *${candidateLabel}*${preview ? `: "${preview}..."` : ""}`;
        }
        return "Add note to candidate";

      case "schedule_interview":
        if (candidateLabel && input?.start_time) {
          return `Schedule interview for *${candidateLabel}* at ${input.start_time}`;
        }
        if (candidateLabel) {
          return `Schedule interview for *${candidateLabel}*`;
        }
        return "Schedule interview";

      case "reschedule_interview":
        if (input?.interview_schedule_id && input?.start_time) {
          return `Reschedule interview to ${input.start_time}`;
        }
        return "Reschedule interview";

      case "cancel_interview":
        return input?.interview_schedule_id
          ? `Cancel interview (schedule: ${input.interview_schedule_id.substring(0, 8)}...)`
          : "Cancel interview";

      case "reject_candidate":
        return candidateLabel
          ? `Archive/reject *${candidateLabel}*`
          : "Archive/reject candidate";

      case "create_candidate":
        if (input?.name && input?.email) {
          return `Create new candidate: *${input.name}* (${input.email})`;
        }
        return "Create new candidate";

      case "apply_to_job":
        if (candidateLabel && input?.job_title) {
          return `Apply *${candidateLabel}* to *${input.job_title}*`;
        }
        if (candidateLabel) {
          return `Apply *${candidateLabel}* to job`;
        }
        return "Apply candidate to job";

      case "transfer_application":
        if (candidateLabel && input?.job_title) {
          return `Transfer *${candidateLabel}* to *${input.job_title}*`;
        }
        return "Transfer application to new job";

      case "add_candidate_tag":
        return candidateLabel
          ? `Add tag to *${candidateLabel}*`
          : "Add tag to candidate";

      case "create_offer":
        if (candidateLabel && input?.salary) {
          return `Create offer for *${candidateLabel}* ($${input.salary.toLocaleString()})`;
        }
        if (candidateLabel) {
          return `Create offer for *${candidateLabel}*`;
        }
        return "Create offer";

      case "update_offer":
        return input?.offer_id
          ? `Update offer ${input.offer_id.substring(0, 8)}...`
          : "Update offer";

      case "approve_offer":
        return input?.offer_id
          ? `Approve offer ${input.offer_id.substring(0, 8)}...`
          : "Approve offer";

      case "send_offer":
        return input?.offer_id
          ? `Send offer ${input.offer_id.substring(0, 8)}... to candidate`
          : "Send offer to candidate";

      case "set_reminder":
        if (candidateLabel && input?.remind_in) {
          const notePreview = input?.note ? `: "${input.note.substring(0, 30)}..."` : "";
          return `Set reminder for *${candidateLabel}* in ${input.remind_in}${notePreview}`;
        }
        if (candidateLabel) {
          return `Set reminder for *${candidateLabel}*`;
        }
        return "Set reminder";

      default:
        // Fallback: format tool name nicely
        const readableName = op.toolName.replace(/_/g, " ");
        if (candidateLabel) {
          return `${readableName} for *${candidateLabel}*`;
        }
        return readableName;
    }
  }

  private async startTriageSession(
    triage: TriageSessionData,
    context: MessageContext,
    responseTs: string
  ): Promise<void> {
    if (!triage.candidates || triage.candidates.length === 0) {
      const message = triage.message || "No candidates found for triage.";
      await this.app.client.chat.postMessage({
        channel: context.channelId,
        thread_ts: responseTs,
        text: message,
      });
      return;
    }

    const first = triage.candidates[0];
    if (!first) {
      return;
    }
    const cardText = this.triageSessions.formatCandidateCard(
      first,
      1,
      triage.candidates.length
    );

    const message = await this.app.client.chat.postMessage({
      channel: context.channelId,
      thread_ts: responseTs,
      text: cardText,
    });

    if (message.ts) {
      const { replacedSession } = this.triageSessions.create({
        userId: context.userId,
        channelId: context.channelId,
        messageTs: message.ts,
        candidates: triage.candidates,
      });

      // Warn user if we replaced an existing session with unfinished decisions
      if (replacedSession && replacedSession.decisions.length > 0) {
        await this.app.client.chat.postMessage({
          channel: context.channelId,
          thread_ts: responseTs,
          text: `⚠️ _Note: Your previous triage session had ${replacedSession.decisions.length} decision(s) that weren't applied. Starting fresh with this new batch._`,
        });
      }

      await Promise.all([
        this.addReactionSafe(context.channelId, message.ts, "white_check_mark"),
        this.addReactionSafe(context.channelId, message.ts, "x"),
        this.addReactionSafe(context.channelId, message.ts, "thinking_face"),
      ]);
    }
  }

  private async addReactionSafe(
    channelId: string,
    timestamp: string,
    name: string
  ): Promise<void> {
    try {
      await this.app.client.reactions.add({
        channel: channelId,
        timestamp,
        name,
      });
    } catch (error) {
      console.warn("Failed to add reaction:", error);
    }
  }

  private async removeReactionSafe(
    channelId: string,
    timestamp: string,
    name: string
  ): Promise<void> {
    try {
      await this.app.client.reactions.remove({
        channel: channelId,
        timestamp,
        name,
      });
    } catch (error) {
      console.warn("Failed to remove reaction:", error);
    }
  }

  /**
   * Handle a workflow reaction
   */
  private async handleWorkflowReaction(
    session: WorkflowSession,
    reaction: string,
    userId: string
  ): Promise<void> {
    if (!this.workflows) return;

    const result = await this.workflows.handleReaction(session, reaction, userId);

    if (!result.handled) return;

    // Execute API action if present
    if (result.apiAction && this.ashby) {
      try {
        await this.executeWorkflowApiAction(result.apiAction);
      } catch (error) {
        console.error("[Workflow] API action failed:", error);
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        await this.app.client.chat.postMessage({
          channel: session.channelId,
          thread_ts: session.messageTs,
          text: `❌ Action failed: ${errorMessage}`,
        });
        return;
      }
    }

    // Post the response message
    if (result.message) {
      const message = await this.app.client.chat.postMessage({
        channel: session.channelId,
        thread_ts: session.messageTs,
        text: result.message,
      });

      // If there's a follow-up with reactions, add them
      if (result.followUp?.reactions && message.ts) {
        // Update session to track the new message
        this.workflows.updateMessageTs(session.id, message.ts);

        for (const reactionName of result.followUp.reactions) {
          await this.addReactionSafe(session.channelId, message.ts, reactionName);
        }
      }
    }

    // Complete the workflow if done
    if (result.completed) {
      this.workflows.complete(session.id);
    }
  }

  /**
   * Execute an API action from a workflow reaction
   */
  private async executeWorkflowApiAction(action: {
    type: string;
    params: Record<string, unknown>;
  }): Promise<void> {
    if (!this.ashby) {
      throw new Error("Ashby service not available");
    }

    switch (action.type) {
      case "approve_offer": {
        const { offerId, approverId } = action.params as {
          offerId: string;
          approverId: string;
        };
        await this.ashby.approveOffer(offerId, approverId);
        break;
      }

      case "send_offer": {
        const { offerId } = action.params as { offerId: string };
        await this.ashby.sendOffer(offerId);
        break;
      }

      case "archive_candidate": {
        const { candidateId, archiveReasonId, applicationId } = action.params as {
          candidateId: string;
          archiveReasonId: string;
          applicationId?: string;
        };
        await this.ashby.rejectCandidate(candidateId, archiveReasonId, applicationId);
        break;
      }

      case "submit_feedback": {
        // Note: Feedback submission may require scorecard form creation
        // which is complex - log for now, could implement later
        console.log("[Workflow] Feedback submission requested:", action.params);
        break;
      }

      case "reschedule_interview": {
        const { interviewScheduleId, newStartTime, newEndTime, interviewerIds } =
          action.params as {
            interviewScheduleId: string;
            newStartTime: string;
            newEndTime: string;
            interviewerIds: string[];
          };
        await this.ashby.rescheduleInterview(
          interviewScheduleId,
          newStartTime,
          newEndTime,
          interviewerIds
        );
        break;
      }

      default:
        console.warn(`[Workflow] Unknown API action type: ${action.type}`);
    }
  }

  /**
   * Get the workflow manager (for external workflow triggers)
   */
  getWorkflowManager(): WorkflowManager | undefined {
    return this.workflows;
  }

  /**
   * Post a workflow message and set up reactions
   */
  async postWorkflowMessage(params: {
    channelId: string;
    threadTs?: string;
    text: string;
    reactions: string[];
  }): Promise<string | undefined> {
    const messageArgs: { channel: string; text: string; thread_ts?: string } = {
      channel: params.channelId,
      text: params.text,
    };
    if (params.threadTs !== undefined) {
      messageArgs.thread_ts = params.threadTs;
    }
    const message = await this.app.client.chat.postMessage(messageArgs);

    if (message.ts) {
      for (const reaction of params.reactions) {
        await this.addReactionSafe(params.channelId, message.ts, reaction);
      }
      return message.ts;
    }

    return undefined;
  }
}
