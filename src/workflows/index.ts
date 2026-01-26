/**
 * Workflows Module
 *
 * Emoji-driven interactive workflows for recruiting tasks in Slack.
 */

export { WorkflowManager } from "./manager.js";
export { WorkflowTriggerService } from "./trigger-service.js";

export type {
  WorkflowType,
  WorkflowState,
  WorkflowSession,
  WorkflowReactionResult,
  ReactionMapping,
  QuickFeedbackWorkflow,
  DailyDigestWorkflow,
  BatchDecisionWorkflow,
  OfferApprovalWorkflow,
  InterviewPrepWorkflow,
  FeedbackNudgeWorkflow,
  SchedulingConfirmWorkflow,
  DebriefKickoffWorkflow,
  WeeklyPulseWorkflow,
  RejectionOptionsWorkflow,
} from "./types.js";

export { REACTION_SETS } from "./types.js";

export {
  formatQuickFeedback,
  formatDailyDigest,
  formatBatchDecision,
  formatOfferApproval,
  formatOfferSend,
  formatInterviewPrep,
  formatFeedbackNudge,
  formatSchedulingConfirm,
  formatDebriefKickoff,
  formatWeeklyPulse,
  formatRejectionOptions,
  formatWorkflowComplete,
  formatWorkflowError,
} from "./formatters.js";
