/**
 * Type exports
 */

export * from "./ashby.js";

// =============================================================================
// Bot-specific Types
// =============================================================================

/**
 * All write operation types that can be confirmed
 */
export type ConfirmableOperationType =
  | "move_stage"
  | "add_note"
  | "batch_move"
  | "schedule_interview"
  | "reschedule_interview"
  | "cancel_interview"
  | "create_candidate"
  | "apply_to_job"
  | "transfer_application"
  | "reject_candidate"
  | "add_candidate_tag"
  | "create_offer"
  | "update_offer"
  | "approve_offer"
  | "send_offer"
  | "set_reminder";

/**
 * Pending confirmation for write operations
 */
export interface PendingConfirmation {
  id: string;
  type: ConfirmableOperationType;
  description: string;
  candidateIds: string[];
  payload: unknown;
  channelId: string;
  messageTs: string;
  userId: string;
  createdAt: Date;
  expiresAt: Date;
}

/**
 * Result of a write operation
 */
export interface WriteResult {
  success: boolean;
  message: string;
  candidateId?: string;
  error?: string;
}

/**
 * Claude tool definition
 */
export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

/**
 * Tool execution result
 */
export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
  requiresConfirmation?: boolean;
  confirmationId?: string;
}

/**
 * Slack message context
 */
export interface MessageContext {
  channelId: string;
  threadTs?: string;
  userId: string;
  text: string;
  messageTs: string;
}

/**
 * Daily summary data
 */
export interface DailySummaryData {
  staleCandidate: Array<{
    name: string;
    email: string;
    stage: string;
    job: string;
    daysInStage: number;
    profileUrl: string;
  }>;
  needsDecision: Array<{
    name: string;
    email: string;
    stage: string;
    job: string;
    daysWaiting: number;
    profileUrl: string;
  }>;
  stats: {
    totalActive: number;
    openRoles: number;
    newApplications: number;
  };
}
