/**
 * Confirmation Management
 *
 * Handles pending write operation confirmations with emoji reactions.
 */

import type { PendingConfirmation } from "../types/index.js";

export class ConfirmationManager {
  private readonly pending: Map<string, PendingConfirmation> = new Map();
  private readonly timeoutMs: number;

  constructor(timeoutMs: number = 300000) {
    this.timeoutMs = timeoutMs;
    // Start cleanup interval
    setInterval(() => this.cleanupExpired(), 60000);
  }

  /**
   * Create a pending confirmation for a write operation
   */
  create(params: {
    type: PendingConfirmation["type"];
    description: string;
    candidateIds: string[];
    payload: unknown;
    channelId: string;
    messageTs: string;
    userId: string;
  }): PendingConfirmation {
    const id = this.generateId();
    const now = new Date();

    const confirmation: PendingConfirmation = {
      id,
      type: params.type,
      description: params.description,
      candidateIds: params.candidateIds,
      payload: params.payload,
      channelId: params.channelId,
      messageTs: params.messageTs,
      userId: params.userId,
      createdAt: now,
      expiresAt: new Date(now.getTime() + this.timeoutMs),
    };

    this.pending.set(id, confirmation);
    return confirmation;
  }

  /**
   * Find a confirmation by message timestamp (used when reaction is added)
   */
  findByMessageTs(
    channelId: string,
    messageTs: string
  ): PendingConfirmation | null {
    for (const confirmation of this.pending.values()) {
      if (
        confirmation.channelId === channelId &&
        confirmation.messageTs === messageTs
      ) {
        return confirmation;
      }
    }
    return null;
  }

  /**
   * Get a confirmation by ID
   */
  get(id: string): PendingConfirmation | null {
    return this.pending.get(id) ?? null;
  }

  /**
   * Complete and remove a confirmation
   */
  complete(id: string): PendingConfirmation | null {
    const confirmation = this.pending.get(id);
    if (confirmation) {
      this.pending.delete(id);
    }
    return confirmation ?? null;
  }

  /**
   * Cancel a confirmation
   */
  cancel(id: string): boolean {
    return this.pending.delete(id);
  }

  /**
   * Check if a confirmation is still valid (not expired)
   */
  isValid(confirmation: PendingConfirmation): boolean {
    return new Date() < confirmation.expiresAt;
  }

  /**
   * Get all pending confirmations for a channel
   */
  getForChannel(channelId: string): PendingConfirmation[] {
    return Array.from(this.pending.values()).filter(
      (c) => c.channelId === channelId && this.isValid(c)
    );
  }

  /**
   * Cleanup expired confirmations
   */
  private cleanupExpired(): void {
    const now = new Date();
    for (const [id, confirmation] of this.pending.entries()) {
      if (now > confirmation.expiresAt) {
        this.pending.delete(id);
      }
    }
  }

  private generateId(): string {
    return `conf_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }
}
