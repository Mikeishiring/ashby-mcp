/**
 * Triage Session Manager
 *
 * Manages rapid-fire candidate review sessions.
 * Tracks state for emoji-based decisions (✅ advance, ❌ reject, 🤔 skip).
 */

import type { TriageSession, ApplicationWithContext } from "../types/index.js";

// Session timeout: 10 minutes
const SESSION_TIMEOUT_MS = 10 * 60 * 1000;

// Cleanup interval: every 2 minutes
const CLEANUP_INTERVAL_MS = 2 * 60 * 1000;

export class TriageSessionManager {
  private readonly sessions: Map<string, TriageSession> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Start cleanup interval
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredSessions();
    }, CLEANUP_INTERVAL_MS);
  }

  /**
   * Create a new triage session
   */
  create(params: {
    userId: string;
    channelId: string;
    messageTs: string;
    candidates: ApplicationWithContext[];
    targetStageId?: string;
    archiveReasonId?: string;
  }): TriageSession {
    // End any existing session for this user
    this.endSession(params.userId);

    const session: TriageSession = {
      id: `triage-${params.userId}-${Date.now()}`,
      userId: params.userId,
      channelId: params.channelId,
      messageTs: params.messageTs,
      candidates: params.candidates,
      currentIndex: 0,
      decisions: [],
      ...(params.targetStageId !== undefined && { targetStageId: params.targetStageId }),
      ...(params.archiveReasonId !== undefined && { archiveReasonId: params.archiveReasonId }),
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + SESSION_TIMEOUT_MS),
    };

    this.sessions.set(params.userId, session);
    console.log(`[Triage] Session created for user ${params.userId} with ${params.candidates.length} candidates`);

    return session;
  }

  /**
   * Get a session by user ID
   */
  get(userId: string): TriageSession | null {
    const session = this.sessions.get(userId);
    if (!session) return null;

    // Check if expired
    if (new Date() > session.expiresAt) {
      this.sessions.delete(userId);
      return null;
    }

    return session;
  }

  /**
   * Get a session by channel and message timestamp
   */
  findByMessage(channelId: string, messageTs: string): TriageSession | null {
    for (const session of this.sessions.values()) {
      if (session.channelId === channelId && session.messageTs === messageTs) {
        if (new Date() > session.expiresAt) {
          this.sessions.delete(session.userId);
          return null;
        }
        return session;
      }
    }
    return null;
  }

  /**
   * Record a decision for the current candidate
   */
  recordDecision(
    userId: string,
    decision: "advance" | "reject" | "skip"
  ): { candidate: ApplicationWithContext; hasMore: boolean; nextCandidate?: ApplicationWithContext } | null {
    const session = this.get(userId);
    if (!session) return null;

    const currentCandidate = session.candidates[session.currentIndex];
    if (!currentCandidate) return null;

    // Record the decision
    session.decisions.push({
      candidateId: currentCandidate.candidateId,
      applicationId: currentCandidate.id,
      decision,
    });

    // Move to next candidate
    session.currentIndex++;

    // Extend session expiry
    session.expiresAt = new Date(Date.now() + SESSION_TIMEOUT_MS);

    const hasMore = session.currentIndex < session.candidates.length;
    const nextCandidate = hasMore ? session.candidates[session.currentIndex] : undefined;

    if (nextCandidate !== undefined) {
      return {
        candidate: currentCandidate,
        hasMore,
        nextCandidate,
      };
    }

    return {
      candidate: currentCandidate,
      hasMore,
    };
  }

  /**
   * Get current candidate in triage
   */
  getCurrentCandidate(userId: string): ApplicationWithContext | null {
    const session = this.get(userId);
    if (!session) return null;

    return session.candidates[session.currentIndex] ?? null;
  }

  /**
   * Get session progress
   */
  getProgress(userId: string): { current: number; total: number; decisions: TriageSession["decisions"] } | null {
    const session = this.get(userId);
    if (!session) return null;

    return {
      current: session.currentIndex + 1,
      total: session.candidates.length,
      decisions: session.decisions,
    };
  }

  /**
   * End a session and return summary
   */
  endSession(userId: string): TriageSession | null {
    const session = this.sessions.get(userId);
    if (!session) return null;

    this.sessions.delete(userId);
    console.log(`[Triage] Session ended for user ${userId}. Decisions: ${session.decisions.length}`);

    return session;
  }

  /**
   * Update the message timestamp (for tracking reactions)
   */
  updateMessageTs(userId: string, messageTs: string): void {
    const session = this.sessions.get(userId);
    if (session) {
      session.messageTs = messageTs;
    }
  }

  /**
   * Clean up expired sessions
   */
  private cleanupExpiredSessions(): void {
    const now = new Date();
    let cleaned = 0;

    for (const [userId, session] of this.sessions.entries()) {
      if (now > session.expiresAt) {
        this.sessions.delete(userId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`[Triage] Cleaned up ${cleaned} expired sessions`);
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
  }

  /**
   * Format a candidate card for display
   */
  formatCandidateCard(
    candidate: ApplicationWithContext,
    index: number,
    total: number
  ): string {
    const lines: string[] = [];

    lines.push(`*Candidate ${index}/${total}*`);
    lines.push("");
    lines.push(`👤 *${candidate.candidate?.name ?? "Unknown"}*`);

    if (candidate.candidate?.primaryEmailAddress?.value) {
      lines.push(`📧 ${candidate.candidate.primaryEmailAddress.value}`);
    }

    lines.push(`📋 *Role:* ${candidate.job?.title ?? "Unknown"}`);
    lines.push(`📍 *Stage:* ${candidate.currentInterviewStage?.title ?? "Unknown"}`);
    lines.push(`⏱️ *Days in stage:* ${candidate.daysInCurrentStage}`);

    if (candidate.candidate?.source?.title) {
      lines.push(`🔗 *Source:* ${candidate.candidate.source.title}`);
    }

    lines.push("");
    lines.push("React: ✅ = Advance | ❌ = Reject | 🤔 = Skip");

    return lines.join("\n");
  }

  /**
   * Format session summary
   */
  formatSummary(session: TriageSession): string {
    const lines: string[] = [];

    const advanced = session.decisions.filter((d) => d.decision === "advance").length;
    const rejected = session.decisions.filter((d) => d.decision === "reject").length;
    const skipped = session.decisions.filter((d) => d.decision === "skip").length;

    lines.push("✅ *Triage Complete!*");
    lines.push("");
    lines.push(`📊 *Results:*`);
    lines.push(`  • ✅ Advanced: ${advanced}`);
    lines.push(`  • ❌ Rejected: ${rejected}`);
    lines.push(`  • 🤔 Skipped: ${skipped}`);
    lines.push("");

    if (advanced > 0 || rejected > 0) {
      lines.push("_Changes have been applied. React ✅ to confirm, or check Ashby for details._");
    }

    return lines.join("\n");
  }
}
