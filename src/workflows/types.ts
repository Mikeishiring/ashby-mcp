/**
 * Interactive Workflow Types
 *
 * Types for emoji-driven recruiting workflows in Slack.
 */

/**
 * All supported workflow types
 */
export type WorkflowType =
  | "quick_feedback"
  | "daily_digest"
  | "batch_decision"
  | "offer_approval"
  | "interview_prep"
  | "feedback_nudge"
  | "scheduling_confirm"
  | "debrief_kickoff"
  | "weekly_pulse"
  | "rejection_options";

/**
 * Reaction mappings for different workflow contexts
 */
export interface ReactionMapping {
  emoji: string;
  slackName: string; // Slack's internal name (e.g., "thumbsup" not "👍")
  action: string;
  label: string;
}

/**
 * Quick Feedback workflow state
 */
export interface QuickFeedbackWorkflow {
  type: "quick_feedback";
  candidateId: string;
  candidateName: string;
  applicationId: string;
  jobTitle: string;
  interviewerId: string;
  interviewId?: string; // Link to the actual interview
  interviewType: string;
  interviewDate: string;
  reactions: ReactionMapping[];
  // Captured feedback from reaction
  quickFeedback?: "strong_yes" | "maybe" | "pass" | "thinking";
}

/**
 * Daily Digest workflow state
 */
export interface DailyDigestWorkflow {
  type: "daily_digest";
  needsAttention: Array<{
    candidateId: string;
    applicationId?: string;
    candidateName: string;
    issue: string;
    blockerType?: string;
  }>;
  readyToMove: Array<{
    candidateId: string;
    applicationId?: string;
    candidateName: string;
    reason: string;
    scores?: string;
  }>;
  onTrack: number;
  interviewsToday?: number;
  reactions: ReactionMapping[];
}

/**
 * Batch Decision workflow state
 */
export interface BatchDecisionWorkflow {
  type: "batch_decision";
  jobId: string;
  jobTitle: string;
  stage: string;
  candidates: Array<{
    index: number;
    candidateId: string;
    applicationId: string;
    candidateName: string;
    scores: string;
    summary: string;
  }>;
  selectedIndices: number[];
  targetAction: "advance" | "reject";
  targetStageId?: string;
  archiveReasonId?: string;
}

/**
 * Offer Approval workflow state
 */
export interface OfferApprovalWorkflow {
  type: "offer_approval";
  offerId: string;
  applicationId: string;
  candidateId: string;
  candidateName: string;
  jobTitle: string;
  salary: number;
  salaryFrequency: "Annual" | "Hourly";
  currency: string;
  equity: number; // 0 if not applicable
  signingBonus: number; // 0 if not applicable
  startDate: string;
  approvers: Array<{
    userId: string;
    name?: string;
    approved?: boolean;
    approvedAt?: string;
  }>;
  currentApproverId: string;
  phase: "approval" | "send"; // Track whether we're in approval or send phase
  reactions: ReactionMapping[];
}

/**
 * Interview Prep workflow state
 */
export interface InterviewPrepWorkflow {
  type: "interview_prep";
  interviewerId: string;
  candidateId: string;
  candidateName: string;
  applicationId: string;
  jobTitle: string;
  interviewTime: string;
  prepSummary: string;
  previousScores: string; // Empty string if no previous scores
  reactions: ReactionMapping[];
}

/**
 * Feedback Nudge workflow state
 */
export interface FeedbackNudgeWorkflow {
  type: "feedback_nudge";
  interviewerId: string;
  candidateId: string;
  candidateName: string;
  applicationId: string;
  interviewType: string;
  daysSinceInterview: number;
  reactions: ReactionMapping[];
}

/**
 * Scheduling Confirmation workflow state
 */
export interface SchedulingConfirmWorkflow {
  type: "scheduling_confirm";
  interviewScheduleId: string;
  interviewerId: string;
  candidateId: string;
  candidateName: string;
  jobTitle: string;
  scheduledTime: string;
  duration: string;
  meetingLink: string; // Empty string if no meeting link
  reactions: ReactionMapping[];
}

/**
 * Debrief Kickoff workflow state
 */
export interface DebriefKickoffWorkflow {
  type: "debrief_kickoff";
  candidateId: string;
  candidateName: string;
  applicationId: string;
  jobTitle: string;
  overallScores: string;
  interviewers: Array<{
    userId: string;
    name: string;
    vote?: "yes" | "no" | "maybe";
  }>;
  reactions: ReactionMapping[];
}

/**
 * Weekly Pulse workflow state
 */
export interface WeeklyPulseWorkflow {
  type: "weekly_pulse";
  jobId: string; // Empty string if not job-specific
  jobTitle: string; // Empty string if not job-specific
  activelyInterviewing: Array<{
    candidateId: string;
    candidateName: string;
    status: string;
  }>;
  waitingOn: Array<{
    candidateId: string;
    candidateName: string;
    waitingFor: string;
  }>;
  reactions: ReactionMapping[];
}

/**
 * Rejection Options workflow state
 */
export interface RejectionOptionsWorkflow {
  type: "rejection_options";
  candidateId: string;
  candidateName: string;
  applicationId: string;
  jobTitle: string;
  archiveReasonId: string;
  reactions: ReactionMapping[];
}

/**
 * Union of all workflow states
 */
export type WorkflowState =
  | QuickFeedbackWorkflow
  | DailyDigestWorkflow
  | BatchDecisionWorkflow
  | OfferApprovalWorkflow
  | InterviewPrepWorkflow
  | FeedbackNudgeWorkflow
  | SchedulingConfirmWorkflow
  | DebriefKickoffWorkflow
  | WeeklyPulseWorkflow
  | RejectionOptionsWorkflow;

/**
 * Active workflow session
 */
export interface WorkflowSession {
  id: string;
  type: WorkflowType;
  state: WorkflowState;
  channelId: string;
  messageTs: string;
  userId: string;
  createdAt: Date;
  expiresAt: Date;
}

/**
 * Workflow reaction result
 */
export interface WorkflowReactionResult {
  handled: boolean;
  message?: string;
  followUp?: {
    text: string;
    reactions?: string[];
  };
  completed?: boolean;
  error?: string;
  /**
   * Action to execute via Ashby API
   */
  apiAction?: {
    type: "approve_offer" | "send_offer" | "archive_candidate" | "submit_feedback" | "reschedule_interview";
    params: Record<string, unknown>;
  };
}

/**
 * Standard reaction sets for common patterns
 */
export const REACTION_SETS = {
  YES_NO_MAYBE: [
    { emoji: "👍", slackName: "thumbsup", action: "yes", label: "Yes" },
    { emoji: "🤔", slackName: "thinking_face", action: "maybe", label: "Maybe" },
    { emoji: "👎", slackName: "thumbsdown", action: "no", label: "No" },
  ],
  CONFIRM_CANCEL: [
    { emoji: "✅", slackName: "white_check_mark", action: "confirm", label: "Confirm" },
    { emoji: "❌", slackName: "x", action: "cancel", label: "Cancel" },
  ],
  FEEDBACK_QUICK: [
    { emoji: "👍", slackName: "thumbsup", action: "strong_yes", label: "Strong yes" },
    { emoji: "🤔", slackName: "thinking_face", action: "maybe", label: "Maybe" },
    { emoji: "👎", slackName: "thumbsdown", action: "pass", label: "Pass" },
    { emoji: "⏸️", slackName: "double_vertical_bar", action: "thinking", label: "Need to think" },
  ],
  PREP_ACTIONS: [
    { emoji: "👀", slackName: "eyes", action: "reviewed", label: "I've reviewed this" },
    { emoji: "❓", slackName: "question", action: "more_detail", label: "Show me more detail" },
    { emoji: "📝", slackName: "memo", action: "show_notes", label: "Show previous notes" },
  ],
  DIGEST_ACTIONS: [
    { emoji: "✅", slackName: "white_check_mark", action: "show_decisions", label: "Show who needs decisions" },
    { emoji: "📅", slackName: "date", action: "show_interviews", label: "Show today's interviews" },
    { emoji: "🔔", slackName: "bell", action: "remind_feedback", label: "Remind about feedback" },
  ],
  OFFER_APPROVAL: [
    { emoji: "✅", slackName: "white_check_mark", action: "approve", label: "Approve as-is" },
    { emoji: "💬", slackName: "speech_balloon", action: "comment", label: "I have comments" },
    { emoji: "❌", slackName: "x", action: "reject", label: "Do not approve" },
  ],
  OFFER_SEND: [
    { emoji: "📤", slackName: "outbox_tray", action: "send_now", label: "Send offer now" },
    { emoji: "✏️", slackName: "pencil2", action: "edit", label: "Edit something first" },
    { emoji: "⏰", slackName: "alarm_clock", action: "schedule", label: "Schedule send" },
  ],
  SCHEDULING: [
    { emoji: "✅", slackName: "white_check_mark", action: "confirmed", label: "Confirmed" },
    { emoji: "🔄", slackName: "arrows_counterclockwise", action: "reschedule", label: "Need to reschedule" },
    { emoji: "📋", slackName: "clipboard", action: "send_prep", label: "Send prep materials" },
  ],
  REJECTION: [
    { emoji: "📧", slackName: "email", action: "standard_email", label: "Standard rejection" },
    { emoji: "✍️", slackName: "writing_hand", action: "personalize", label: "Personalize message" },
    { emoji: "🤫", slackName: "shushing_face", action: "no_email", label: "No email" },
    { emoji: "⏸️", slackName: "double_vertical_bar", action: "reconsider", label: "Wait—reconsider" },
  ],
  PULSE_ACTIONS: [
    { emoji: "🚀", slackName: "rocket", action: "fast_track", label: "Show who to fast-track" },
    { emoji: "🐢", slackName: "turtle", action: "waiting_longest", label: "Show who's been waiting" },
    { emoji: "📊", slackName: "bar_chart", action: "full_breakdown", label: "Full pipeline breakdown" },
  ],
  NUMBER_SELECT: [
    { emoji: "1️⃣", slackName: "one", action: "select_1", label: "1" },
    { emoji: "2️⃣", slackName: "two", action: "select_2", label: "2" },
    { emoji: "3️⃣", slackName: "three", action: "select_3", label: "3" },
    { emoji: "4️⃣", slackName: "four", action: "select_4", label: "4" },
    { emoji: "5️⃣", slackName: "five", action: "select_5", label: "5" },
  ],
} as const;
