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
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // Start cleanup interval
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredSessions();
    }, CLEANUP_INTERVAL_MS);
  }

  /**
   * Check if a user has an active session with unfinished work
   */
  hasActiveSession(userId: string): { active: boolean; session?: TriageSession; decisionsCount?: number } {
    const session = this.sessions.get(userId);
    if (!session) return { active: false };

    // Check if expired
    if (new Date() > session.expiresAt) {
      this.sessions.delete(userId);
      return { active: false };
    }

    return {
      active: true,
      session,
      decisionsCount: session.decisions.length,
    };
  }

  /**
   * Create a new triage session
   * Returns the previous session if one was replaced (caller should warn user)
   */
  create(params: {
    userId: string;
    channelId: string;
    messageTs: string;
    candidates: ApplicationWithContext[];
    targetStageId?: string;
    archiveReasonId?: string;
  }): { session: TriageSession; replacedSession?: TriageSession } {
    // Check for existing session and preserve it for warning
    const existingSession = this.sessions.get(params.userId);
    const replacedSession = existingSession && new Date() <= existingSession.expiresAt
      ? existingSession
      : undefined;

    // End any existing session for this user
    if (existingSession) {
      this.sessions.delete(params.userId);
      console.log(`[Triage] Replaced existing session for user ${params.userId} (had ${existingSession.decisions.length} decisions)`);
    }

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

    return replacedSession ? { session, replacedSession } : { session };
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
    lines.push("_React: ✅ advance | ❌ reject | 🤔 skip (review only—no changes until you confirm)_");

    return lines.join("\n");
  }

  /**
   * Format session summary
   */
  formatSummary(session: TriageSession): string {
    const lines: string[] = [];

    const advanceDecisions = session.decisions.filter((d) => d.decision === "advance");
    const rejectDecisions = session.decisions.filter((d) => d.decision === "reject");
    const skipped = session.decisions.filter((d) => d.decision === "skip").length;

    lines.push("✅ *Triage Review Complete!*");
    lines.push("");
    lines.push(`📊 *Your decisions:*`);
    lines.push(`  • ✅ Ready to advance: ${advanceDecisions.length}`);
    lines.push(`  • ❌ Ready to reject: ${rejectDecisions.length}`);
    lines.push(`  • 🤔 Skipped: ${skipped}`);
    lines.push("");

    // Make it clear this is review mode and explain what happens next
    if (advanceDecisions.length > 0 || rejectDecisions.length > 0) {
      lines.push("*What's next?*");
      lines.push("This was a quick review—no changes have been made to Ashby yet.");
      lines.push("");

      if (advanceDecisions.length > 0) {
        lines.push(`To move the ${advanceDecisions.length} candidate(s) you marked ✅, tell me which stage to advance them to.`);
      }
      if (rejectDecisions.length > 0) {
        lines.push(`To reject the ${rejectDecisions.length} candidate(s) you marked ❌, just say "reject them" and I'll confirm before proceeding.`);
      }

      lines.push("");
      lines.push("_Or just ask me about specific candidates to take action one at a time._");
    } else {
      lines.push("_No candidates were marked for action. Need to triage more candidates?_");
    }

    return lines.join("\n");
  }
}
