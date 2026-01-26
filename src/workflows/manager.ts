/**
 * Workflow Manager
 *
 * Manages interactive emoji-driven workflows for recruiting tasks.
 */

import type {
  WorkflowSession,
  WorkflowState,
  WorkflowType,
  WorkflowReactionResult,
  ReactionMapping,
  QuickFeedbackWorkflow,
  BatchDecisionWorkflow,
  OfferApprovalWorkflow,
  FeedbackNudgeWorkflow,
  SchedulingConfirmWorkflow,
  DebriefKickoffWorkflow,
  RejectionOptionsWorkflow,
  InterviewPrepWorkflow,
  DailyDigestWorkflow,
  WeeklyPulseWorkflow,
} from "./types.js";
import { REACTION_SETS } from "./types.js";

// Session timeout: 30 minutes for most workflows
const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;
// Cleanup interval: every 5 minutes
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

export class WorkflowManager {
  private readonly sessions: Map<string, WorkflowSession> = new Map();
  private readonly messageIndex: Map<string, string> = new Map(); // channelId:messageTs -> sessionId
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredSessions();
    }, CLEANUP_INTERVAL_MS);
  }

  /**
   * Create a new workflow session
   */
  create(params: {
    type: WorkflowType;
    state: WorkflowState;
    channelId: string;
    messageTs: string;
    userId: string;
    timeoutMs?: number;
  }): WorkflowSession {
    const id = `wf_${params.type}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date();
    const timeoutMs = params.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    const session: WorkflowSession = {
      id,
      type: params.type,
      state: params.state,
      channelId: params.channelId,
      messageTs: params.messageTs,
      userId: params.userId,
      createdAt: now,
      expiresAt: new Date(now.getTime() + timeoutMs),
    };

    this.sessions.set(id, session);
    this.messageIndex.set(`${params.channelId}:${params.messageTs}`, id);

    console.log(`[Workflow] Created ${params.type} session ${id} for user ${params.userId}`);
    return session;
  }

  /**
   * Find a session by message location
   */
  findByMessage(channelId: string, messageTs: string): WorkflowSession | null {
    const key = `${channelId}:${messageTs}`;
    const sessionId = this.messageIndex.get(key);
    if (!sessionId) return null;

    const session = this.sessions.get(sessionId);
    if (!session) {
      this.messageIndex.delete(key);
      return null;
    }

    // Check expiry
    if (new Date() > session.expiresAt) {
      this.deleteSession(sessionId);
      return null;
    }

    return session;
  }

  /**
   * Get a session by ID
   */
  get(sessionId: string): WorkflowSession | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    if (new Date() > session.expiresAt) {
      this.deleteSession(sessionId);
      return null;
    }

    return session;
  }

  /**
   * Update a session's state
   */
  updateState(sessionId: string, state: WorkflowState): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    session.state = state;
    // Extend expiry on activity
    session.expiresAt = new Date(Date.now() + DEFAULT_TIMEOUT_MS);
    return true;
  }

  /**
   * Update message timestamp (for workflows that post new messages)
   */
  updateMessageTs(sessionId: string, newMessageTs: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    // Remove old index
    this.messageIndex.delete(`${session.channelId}:${session.messageTs}`);

    // Update and create new index
    session.messageTs = newMessageTs;
    this.messageIndex.set(`${session.channelId}:${newMessageTs}`, sessionId);

    return true;
  }

  /**
   * Complete and remove a session
   */
  complete(sessionId: string): WorkflowSession | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    this.deleteSession(sessionId);
    console.log(`[Workflow] Completed ${session.type} session ${sessionId}`);
    return session;
  }

  /**
   * Delete a session
   */
  private deleteSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      this.messageIndex.delete(`${session.channelId}:${session.messageTs}`);
      this.sessions.delete(sessionId);
    }
  }

  /**
   * Handle a reaction on a workflow message
   */
  async handleReaction(
    session: WorkflowSession,
    reaction: string,
    userId: string
  ): Promise<WorkflowReactionResult> {
    // Verify user matches (except for multi-user workflows like debrief)
    const multiUserWorkflows: WorkflowType[] = ["debrief_kickoff", "offer_approval"];
    if (!multiUserWorkflows.includes(session.type) && userId !== session.userId) {
      return { handled: false };
    }

    switch (session.type) {
      case "quick_feedback":
        return this.handleQuickFeedbackReaction(session, reaction, userId);
      case "daily_digest":
        return this.handleDailyDigestReaction(session, reaction, userId);
      case "batch_decision":
        return this.handleBatchDecisionReaction(session, reaction, userId);
      case "offer_approval":
        return this.handleOfferApprovalReaction(session, reaction, userId);
      case "interview_prep":
        return this.handleInterviewPrepReaction(session, reaction, userId);
      case "feedback_nudge":
        return this.handleFeedbackNudgeReaction(session, reaction, userId);
      case "scheduling_confirm":
        return this.handleSchedulingConfirmReaction(session, reaction, userId);
      case "debrief_kickoff":
        return this.handleDebriefKickoffReaction(session, reaction, userId);
      case "weekly_pulse":
        return this.handleWeeklyPulseReaction(session, reaction, userId);
      case "rejection_options":
        return this.handleRejectionOptionsReaction(session, reaction, userId);
      default:
        return { handled: false };
    }
  }

  /**
   * Handle quick feedback reaction
   */
  private handleQuickFeedbackReaction(
    session: WorkflowSession,
    reaction: string,
    _userId: string
  ): WorkflowReactionResult {
    const state = session.state as QuickFeedbackWorkflow;
    const mapping = this.findReactionMapping(state.reactions, reaction);
    if (!mapping) return { handled: false };

    switch (mapping.action) {
      case "strong_yes":
        return {
          handled: true,
          message: `Great! What stood out about *${state.candidateName}*? I'll add it as feedback.`,
          completed: false,
        };
      case "maybe":
        return {
          handled: true,
          message: `What's giving you pause about *${state.candidateName}*? Technical skills, culture fit, or something else?`,
          completed: false,
        };
      case "pass":
        return {
          handled: true,
          message: `Got it. Any specific concerns about *${state.candidateName}* I should flag for the hiring manager?`,
          completed: false,
        };
      case "thinking":
        return {
          handled: true,
          message: `No rush! I'll check back tomorrow if you haven't submitted feedback for *${state.candidateName}* yet.`,
          completed: true,
        };
      default:
        return { handled: false };
    }
  }

  /**
   * Handle daily digest reaction
   */
  private handleDailyDigestReaction(
    session: WorkflowSession,
    reaction: string,
    _userId: string
  ): WorkflowReactionResult {
    const state = session.state as DailyDigestWorkflow;
    const mapping = this.findReactionMapping(state.reactions, reaction);
    if (!mapping) return { handled: false };

    switch (mapping.action) {
      case "show_decisions":
        return {
          handled: true,
          message: "_Fetching candidates who need decisions..._",
          completed: false,
        };
      case "show_interviews":
        return {
          handled: true,
          message: "_Fetching today's interview schedule..._",
          completed: false,
        };
      case "remind_feedback":
        return {
          handled: true,
          message: "_Sending feedback reminders to interviewers..._",
          completed: false,
        };
      default:
        return { handled: false };
    }
  }

  /**
   * Handle batch decision reaction
   */
  private handleBatchDecisionReaction(
    session: WorkflowSession,
    reaction: string,
    _userId: string
  ): WorkflowReactionResult {
    const state = session.state as BatchDecisionWorkflow;

    // Check for number selections (1-5)
    const numberMatch = reaction.match(/^(one|two|three|four|five)$/);
    if (numberMatch && numberMatch[1]) {
      const numberMap: Record<string, number> = {
        one: 1, two: 2, three: 3, four: 4, five: 5,
      };
      const index = numberMap[numberMatch[1]];
      if (index !== undefined && index <= state.candidates.length) {
        // Toggle selection
        const selectedSet = new Set(state.selectedIndices);
        if (selectedSet.has(index)) {
          selectedSet.delete(index);
        } else {
          selectedSet.add(index);
        }
        state.selectedIndices = Array.from(selectedSet).sort((a, b) => a - b);

        const selectedNames = state.selectedIndices
          .map((i) => state.candidates[i - 1]?.candidateName)
          .filter(Boolean);

        return {
          handled: true,
          message: selectedNames.length > 0
            ? `Selected: ${selectedNames.join(", ")}. React ✅ when ready to proceed, or select more candidates.`
            : `No candidates selected. React with numbers (1️⃣-5️⃣) to select candidates.`,
          completed: false,
        };
      }
    }

    // Check for confirm/cancel
    if (reaction === "white_check_mark") {
      if (state.selectedIndices.length === 0) {
        return {
          handled: true,
          message: "No candidates selected. React with numbers first (1️⃣-5️⃣) to select who to advance.",
          completed: false,
        };
      }
      const selectedNames = state.selectedIndices
        .map((i) => state.candidates[i - 1]?.candidateName)
        .filter(Boolean);
      return {
        handled: true,
        message: `Ready to ${state.targetAction} ${selectedNames.length} candidate(s): ${selectedNames.join(", ")}. Which stage should they move to?`,
        completed: false,
      };
    }

    if (reaction === "x") {
      return {
        handled: true,
        message: "Batch decision cancelled.",
        completed: true,
      };
    }

    return { handled: false };
  }

  /**
   * Handle offer approval reaction
   */
  private handleOfferApprovalReaction(
    session: WorkflowSession,
    reaction: string,
    userId: string
  ): WorkflowReactionResult {
    const state = session.state as OfferApprovalWorkflow;

    // Only allow current approver to react
    if (userId !== state.currentApproverId) {
      return { handled: false };
    }

    const mapping = this.findReactionMapping(state.reactions, reaction);
    if (!mapping) return { handled: false };

    // Handle based on current phase
    if (state.phase === "approval") {
      switch (mapping.action) {
        case "approve":
          // Transition to send phase and update reactions
          state.phase = "send";
          state.reactions = [...REACTION_SETS.OFFER_SEND];

          return {
            handled: true,
            message: `✅ *Offer approved!*\n\nReady to send to *${state.candidateName}*?`,
            followUp: {
              text: "React to proceed:",
              reactions: REACTION_SETS.OFFER_SEND.map((r) => r.slackName),
            },
            completed: false,
            apiAction: {
              type: "approve_offer",
              params: {
                offerId: state.offerId,
                approverId: userId,
              },
            },
          };
        case "comment":
          return {
            handled: true,
            message: `What comments do you have about the offer for *${state.candidateName}*?`,
            completed: false,
          };
        case "reject":
          return {
            handled: true,
            message: `Offer for *${state.candidateName}* not approved. What's the concern?`,
            completed: true,
          };
        default:
          return { handled: false };
      }
    }

    // Send phase actions
    switch (mapping.action) {
      case "send_now":
        return {
          handled: true,
          message: `📤 Sending offer to *${state.candidateName}*...`,
          completed: true,
          apiAction: {
            type: "send_offer",
            params: {
              offerId: state.offerId,
            },
          },
        };
      case "edit":
        return {
          handled: true,
          message: `What would you like to change about the offer for *${state.candidateName}*?`,
          completed: false,
        };
      case "schedule":
        return {
          handled: true,
          message: `When should I send the offer to *${state.candidateName}*? (e.g., "tomorrow 9am")`,
          completed: false,
        };
      default:
        return { handled: false };
    }
  }

  /**
   * Handle interview prep reaction
   */
  private handleInterviewPrepReaction(
    session: WorkflowSession,
    reaction: string,
    _userId: string
  ): WorkflowReactionResult {
    const state = session.state as InterviewPrepWorkflow;
    const mapping = this.findReactionMapping(state.reactions, reaction);
    if (!mapping) return { handled: false };

    switch (mapping.action) {
      case "reviewed":
        return {
          handled: true,
          message: `Great! Good luck with *${state.candidateName}*'s interview. I'll check in afterward for your feedback.`,
          completed: true,
        };
      case "more_detail":
        return {
          handled: true,
          message: `_Fetching full details for *${state.candidateName}*..._`,
          completed: false,
        };
      case "show_notes":
        return {
          handled: true,
          message: `_Fetching previous interview notes for *${state.candidateName}*..._`,
          completed: false,
        };
      default:
        return { handled: false };
    }
  }

  /**
   * Handle feedback nudge reaction
   */
  private handleFeedbackNudgeReaction(
    session: WorkflowSession,
    reaction: string,
    _userId: string
  ): WorkflowReactionResult {
    const state = session.state as FeedbackNudgeWorkflow;
    const mapping = this.findReactionMapping(state.reactions, reaction);
    if (!mapping) return { handled: false };

    switch (mapping.action) {
      case "strong_yes":
        return {
          handled: true,
          message: `Strong hire for *${state.candidateName}*! Any specific highlights you'd like to note?`,
          completed: false,
        };
      case "pass":
        return {
          handled: true,
          message: `Pass on *${state.candidateName}*. Any feedback for the hiring manager?`,
          completed: false,
        };
      case "maybe":
        return {
          handled: true,
          message: `Mixed feelings on *${state.candidateName}*. What's giving you pause?`,
          completed: false,
        };
      default:
        return { handled: false };
    }
  }

  /**
   * Handle scheduling confirmation reaction
   */
  private handleSchedulingConfirmReaction(
    session: WorkflowSession,
    reaction: string,
    _userId: string
  ): WorkflowReactionResult {
    const state = session.state as SchedulingConfirmWorkflow;
    const mapping = this.findReactionMapping(state.reactions, reaction);
    if (!mapping) return { handled: false };

    switch (mapping.action) {
      case "confirmed":
        return {
          handled: true,
          message: `✅ Interview confirmed for *${state.candidateName}* at ${state.scheduledTime}.`,
          completed: true,
        };
      case "reschedule":
        return {
          handled: true,
          message: `When works better for your interview with *${state.candidateName}*?`,
          completed: false,
        };
      case "send_prep":
        return {
          handled: true,
          message: `_Fetching prep materials for *${state.candidateName}*..._`,
          completed: false,
        };
      default:
        return { handled: false };
    }
  }

  /**
   * Handle debrief kickoff reaction
   */
  private handleDebriefKickoffReaction(
    session: WorkflowSession,
    reaction: string,
    userId: string
  ): WorkflowReactionResult {
    const state = session.state as DebriefKickoffWorkflow;

    // Find the interviewer who reacted
    const interviewer = state.interviewers.find((i) => i.userId === userId);
    if (!interviewer) {
      return { handled: false };
    }

    // Map reaction to vote
    let vote: "yes" | "no" | "maybe" | undefined;
    if (reaction === "thumbsup") vote = "yes";
    else if (reaction === "thumbsdown") vote = "no";
    else if (reaction === "thinking_face") vote = "maybe";

    if (!vote) return { handled: false };

    // Record vote
    interviewer.vote = vote;

    // Check if all votes are in
    const allVoted = state.interviewers.every((i) => i.vote);
    const votes = {
      yes: state.interviewers.filter((i) => i.vote === "yes").length,
      no: state.interviewers.filter((i) => i.vote === "no").length,
      maybe: state.interviewers.filter((i) => i.vote === "maybe").length,
    };

    if (allVoted) {
      const summary = `*Debrief votes for ${state.candidateName}:*\n` +
        `👍 Strong yes: ${votes.yes}\n` +
        `👎 Pass: ${votes.no}\n` +
        `🤔 Mixed: ${votes.maybe}`;

      return {
        handled: true,
        message: summary + "\n\nReady to make a decision?",
        completed: false,
      };
    }

    const pending = state.interviewers.filter((i) => !i.vote).map((i) => i.name);
    return {
      handled: true,
      message: `Vote recorded. Waiting on: ${pending.join(", ")}`,
      completed: false,
    };
  }

  /**
   * Handle weekly pulse reaction
   */
  private handleWeeklyPulseReaction(
    session: WorkflowSession,
    reaction: string,
    _userId: string
  ): WorkflowReactionResult {
    const state = session.state as WeeklyPulseWorkflow;
    const mapping = this.findReactionMapping(state.reactions, reaction);
    if (!mapping) return { handled: false };

    switch (mapping.action) {
      case "fast_track":
        return {
          handled: true,
          message: "_Identifying candidates to fast-track..._",
          completed: false,
        };
      case "waiting_longest":
        return {
          handled: true,
          message: "_Finding candidates who've been waiting longest..._",
          completed: false,
        };
      case "full_breakdown":
        return {
          handled: true,
          message: "_Generating full pipeline breakdown..._",
          completed: false,
        };
      default:
        return { handled: false };
    }
  }

  /**
   * Handle rejection options reaction
   */
  private handleRejectionOptionsReaction(
    session: WorkflowSession,
    reaction: string,
    _userId: string
  ): WorkflowReactionResult {
    const state = session.state as RejectionOptionsWorkflow;
    const mapping = this.findReactionMapping(state.reactions, reaction);
    if (!mapping) return { handled: false };

    switch (mapping.action) {
      case "standard_email":
        return {
          handled: true,
          message: `📧 Sending standard rejection email to *${state.candidateName}* and archiving...`,
          completed: true,
          apiAction: {
            type: "archive_candidate",
            params: {
              candidateId: state.candidateId,
              applicationId: state.applicationId,
              archiveReasonId: state.archiveReasonId,
              sendEmail: true,
            },
          },
        };
      case "personalize":
        return {
          handled: true,
          message: `What would you like to say to *${state.candidateName}*?`,
          completed: false,
        };
      case "no_email":
        return {
          handled: true,
          message: `🤫 Archiving *${state.candidateName}* without sending an email...`,
          completed: true,
          apiAction: {
            type: "archive_candidate",
            params: {
              candidateId: state.candidateId,
              applicationId: state.applicationId,
              archiveReasonId: state.archiveReasonId,
              sendEmail: false,
            },
          },
        };
      case "reconsider":
        return {
          handled: true,
          message: `Rejection cancelled. What would you like to do with *${state.candidateName}*?`,
          completed: true,
        };
      default:
        return { handled: false };
    }
  }

  /**
   * Find a reaction mapping by Slack reaction name
   */
  private findReactionMapping(
    reactions: ReactionMapping[],
    slackReaction: string
  ): ReactionMapping | undefined {
    return reactions.find((r) => r.slackName === slackReaction);
  }

  /**
   * Clean up expired sessions
   */
  private cleanupExpiredSessions(): void {
    const now = new Date();
    let cleaned = 0;

    for (const [sessionId, session] of this.sessions.entries()) {
      if (now > session.expiresAt) {
        this.deleteSession(sessionId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`[Workflow] Cleaned up ${cleaned} expired sessions`);
    }
  }

  /**
   * Shutdown the manager
   */
  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.sessions.clear();
    this.messageIndex.clear();
  }

  /**
   * Get active session count (for monitoring)
   */
  getActiveSessionCount(): number {
    return this.sessions.size;
  }

  /**
   * Get sessions by type (for monitoring)
   */
  getSessionsByType(): Record<WorkflowType, number> {
    const counts: Record<string, number> = {};
    for (const session of this.sessions.values()) {
      counts[session.type] = (counts[session.type] || 0) + 1;
    }
    return counts as Record<WorkflowType, number>;
  }
}
