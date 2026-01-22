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
import type { MessageContext } from "../types/index.js";

export class SlackBot {
  private readonly app: App;
  private readonly agent: ClaudeAgent;
  private readonly confirmations: ConfirmationManager;
  private readonly triageSessions: TriageSessionManager;
  private readonly reminders: ReminderManager | undefined;

  constructor(
    config: Config,
    agent: ClaudeAgent,
    confirmations: ConfirmationManager,
    reminders?: ReminderManager,
    triageSessions?: TriageSessionManager
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

    // Handle reaction additions (for confirmations and triage)
    this.app.event("reaction_added", async ({ event }) => {
      // Check for triage reactions first
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

      await say({
        text: "Sorry, I encountered an error processing your request. Please try again.",
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
        type: op.toolName === "add_note" ? "add_note" : "move_stage",
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

  private formatConfirmationDescription(op: PendingWriteOperation): string {
    const input = op.input as {
      name_or_email?: string;
      candidate_name?: string;
      candidate_email?: string;
      name?: string;
      email?: string;
      offer_id?: string;
      interview_schedule_id?: string;
    };
    const candidateLabel =
      input?.name_or_email ??
      input?.candidate_email ??
      input?.candidate_name ??
      input?.email ??
      input?.name ??
      op.candidateId;
    if (candidateLabel) {
      return `${op.toolName} for ${candidateLabel}`;
    }
    if (input?.offer_id) {
      return `${op.toolName} for offer ${input.offer_id}`;
    }
    if (input?.interview_schedule_id) {
      return `${op.toolName} for interview schedule ${input.interview_schedule_id}`;
    }
    return op.toolName;
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
      this.triageSessions.create({
        userId: context.userId,
        channelId: context.channelId,
        messageTs: message.ts,
        candidates: triage.candidates,
      });

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
}
