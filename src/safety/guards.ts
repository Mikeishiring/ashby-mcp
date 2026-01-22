/**
 * Safety Guards
 *
 * Provides protection against unsafe operations.
 */

import type { SafetyMode, Config } from "../config/index.js";
import type { AshbyService } from "../ashby/service.js";

export interface SafetyCheckResult {
  allowed: boolean;
  reason?: string;
  requiresConfirmation?: boolean;
}

export class SafetyGuards {
  private readonly mode: SafetyMode;
  private readonly batchLimit: number;
  private readonly ashby: AshbyService;

  constructor(config: Config, ashby: AshbyService) {
    this.mode = config.safety.mode;
    this.batchLimit = config.safety.batchLimit;
    this.ashby = ashby;
  }

  /**
   * Check if a write operation is allowed
   */
  async checkWriteOperation(params: {
    type: "move_stage" | "add_note" | "batch_move";
    candidateIds: string[];
  }): Promise<SafetyCheckResult> {
    // Check batch limit
    if (params.candidateIds.length > this.batchLimit) {
      return {
        allowed: false,
        reason: `Batch size ${params.candidateIds.length} exceeds limit of ${this.batchLimit}. Please process candidates in smaller batches.`,
      };
    }

    // Check for hired candidates
    for (const candidateId of params.candidateIds) {
      const isHired = await this.ashby.isHiredCandidate(candidateId);
      if (isHired) {
        return {
          allowed: false,
          reason: `Candidate ${candidateId} is marked as hired and cannot be modified for privacy reasons.`,
        };
      }
    }

    // Check if confirmation is required based on safety mode
    if (this.mode === "CONFIRM_ALL") {
      return {
        allowed: true,
        requiresConfirmation: true,
      };
    }

    // BATCH_LIMIT mode - allow without confirmation if under limit
    return {
      allowed: true,
      requiresConfirmation: false,
    };
  }

  /**
   * Check if reading a candidate's information is allowed
   */
  async checkReadOperation(candidateId: string): Promise<SafetyCheckResult> {
    // Block access to hired candidates for privacy
    const isHired = await this.ashby.isHiredCandidate(candidateId);
    if (isHired) {
      return {
        allowed: false,
        reason: "hired_candidate",
      };
    }

    return { allowed: true };
  }

  /**
   * Validate that a stage move is sensible
   */
  validateStageMove(params: {
    currentStage: string;
    targetStage: string;
  }): SafetyCheckResult {
    const current = params.currentStage.toLowerCase();
    const target = params.targetStage.toLowerCase();

    // Prevent moving backwards from hired
    if (current.includes("hired") && !target.includes("hired")) {
      return {
        allowed: false,
        reason: "Cannot move a hired candidate out of the hired stage.",
      };
    }

    // Warn about skipping stages (but allow with confirmation)
    // This would need more context about stage order in a real implementation

    return { allowed: true };
  }

  /**
   * Get the current safety mode
   */
  getMode(): SafetyMode {
    return this.mode;
  }

  /**
   * Get the batch limit
   */
  getBatchLimit(): number {
    return this.batchLimit;
  }
}
