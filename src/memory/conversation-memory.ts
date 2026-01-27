/**
 * Conversation Memory
 *
 * Retains conversation history and candidate context across messages.
 * Provides context injection for the Claude agent to enable multi-turn conversations.
 */

import type { Candidate, ApplicationWithContext } from "../types/index.js";

/**
 * A single memory entry representing a past interaction
 */
export interface MemoryEntry {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  /** Candidates mentioned or discussed in this message */
  candidateIds?: string[];
  /** Key facts extracted from the conversation */
  facts?: string[];
}

/**
 * Context about a candidate that was discussed
 */
export interface CandidateContext {
  candidateId: string;
  candidateName: string;
  lastMentioned: Date;
  /** Key notes about this candidate from conversation */
  notes: string[];
  /** Last known application context */
  lastApplication?: {
    applicationId: string;
    jobTitle: string;
    stage: string;
    fetchedAt: Date;
  };
}

/**
 * Full conversation context for a user/channel
 */
export interface ConversationContext {
  /** Recent message history */
  messages: MemoryEntry[];
  /** Candidates discussed in this conversation */
  candidates: Map<string, CandidateContext>;
  /** Session start time */
  startedAt: Date;
  /** Last activity time */
  lastActivityAt: Date;
}

// Configuration
const MAX_MESSAGES_PER_CONTEXT = 20;
const MAX_CANDIDATES_PER_CONTEXT = 10;
const CONTEXT_EXPIRY_MS = 4 * 60 * 60 * 1000; // 4 hours
const CLEANUP_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Manages conversation memory across users and channels
 */
export class ConversationMemory {
  /** Map of contextKey (userId:channelId) to conversation context */
  private readonly contexts: Map<string, ConversationContext> = new Map();
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredContexts();
    }, CLEANUP_INTERVAL_MS);
  }

  /**
   * Get or create a conversation context for a user/channel pair
   */
  getContext(userId: string, channelId: string): ConversationContext {
    const key = this.makeKey(userId, channelId);
    let context = this.contexts.get(key);

    if (!context) {
      context = {
        messages: [],
        candidates: new Map(),
        startedAt: new Date(),
        lastActivityAt: new Date(),
      };
      this.contexts.set(key, context);
    }

    return context;
  }

  /**
   * Add a user message to the conversation history
   */
  addUserMessage(
    userId: string,
    channelId: string,
    content: string,
    candidateIds?: string[]
  ): void {
    const context = this.getContext(userId, channelId);

    const entry: MemoryEntry = {
      role: "user",
      content,
      timestamp: new Date(),
    };
    if (candidateIds !== undefined) {
      entry.candidateIds = candidateIds;
    }
    context.messages.push(entry);

    // Trim to max messages
    if (context.messages.length > MAX_MESSAGES_PER_CONTEXT) {
      context.messages = context.messages.slice(-MAX_MESSAGES_PER_CONTEXT);
    }

    context.lastActivityAt = new Date();
  }

  /**
   * Add an assistant response to the conversation history
   */
  addAssistantMessage(
    userId: string,
    channelId: string,
    content: string,
    candidateIds?: string[],
    facts?: string[]
  ): void {
    const context = this.getContext(userId, channelId);

    const entry: MemoryEntry = {
      role: "assistant",
      content,
      timestamp: new Date(),
    };
    if (candidateIds !== undefined) {
      entry.candidateIds = candidateIds;
    }
    if (facts !== undefined) {
      entry.facts = facts;
    }
    context.messages.push(entry);

    // Trim to max messages
    if (context.messages.length > MAX_MESSAGES_PER_CONTEXT) {
      context.messages = context.messages.slice(-MAX_MESSAGES_PER_CONTEXT);
    }

    context.lastActivityAt = new Date();
  }

  /**
   * Record that a candidate was discussed, with optional context
   */
  recordCandidateContext(
    userId: string,
    channelId: string,
    candidate: Candidate,
    application?: ApplicationWithContext,
    notes?: string[]
  ): void {
    const context = this.getContext(userId, channelId);

    const existing = context.candidates.get(candidate.id);
    const candidateContext: CandidateContext = {
      candidateId: candidate.id,
      candidateName: candidate.name,
      lastMentioned: new Date(),
      notes: [...(existing?.notes ?? []), ...(notes ?? [])].slice(-10), // Keep last 10 notes
      ...(application && {
        lastApplication: {
          applicationId: application.id,
          jobTitle: application.job?.title ?? "Unknown",
          stage: application.currentInterviewStage?.title ?? "Unknown",
          fetchedAt: new Date(),
        },
      }),
    };

    context.candidates.set(candidate.id, candidateContext);

    // Trim to max candidates (remove least recently mentioned)
    if (context.candidates.size > MAX_CANDIDATES_PER_CONTEXT) {
      const sortedEntries = [...context.candidates.entries()]
        .sort((a, b) => b[1].lastMentioned.getTime() - a[1].lastMentioned.getTime())
        .slice(0, MAX_CANDIDATES_PER_CONTEXT);
      context.candidates = new Map(sortedEntries);
    }

    context.lastActivityAt = new Date();
  }

  /**
   * Add a note about a candidate from the conversation
   */
  addCandidateNote(
    userId: string,
    channelId: string,
    candidateId: string,
    note: string
  ): void {
    const context = this.getContext(userId, channelId);
    const candidateContext = context.candidates.get(candidateId);

    if (candidateContext) {
      candidateContext.notes.push(note);
      candidateContext.lastMentioned = new Date();
      // Keep only last 10 notes
      if (candidateContext.notes.length > 10) {
        candidateContext.notes = candidateContext.notes.slice(-10);
      }
    }
  }

  /**
   * Build a context summary string to inject into the Claude prompt
   */
  buildContextSummary(userId: string, channelId: string): string | null {
    const context = this.contexts.get(this.makeKey(userId, channelId));
    if (!context || (context.messages.length === 0 && context.candidates.size === 0)) {
      return null;
    }

    const lines: string[] = [];

    // Add candidate context if any
    if (context.candidates.size > 0) {
      lines.push("CANDIDATES DISCUSSED IN THIS CONVERSATION:");
      for (const [, candidate] of context.candidates) {
        const app = candidate.lastApplication;
        const appInfo = app
          ? ` - ${app.jobTitle} (${app.stage})`
          : "";
        lines.push(`• ${candidate.candidateName} (ID: ${candidate.candidateId})${appInfo}`);
        if (candidate.notes.length > 0) {
          lines.push(`  Notes: ${candidate.notes.slice(-3).join("; ")}`);
        }
      }
      lines.push("");
    }

    // Add recent conversation summary
    if (context.messages.length > 0) {
      lines.push("RECENT CONVERSATION:");
      // Only include last 5 messages for context injection
      const recentMessages = context.messages.slice(-5);
      for (const msg of recentMessages) {
        const role = msg.role === "user" ? "User" : "You";
        // Truncate long messages
        const content = msg.content.length > 200
          ? msg.content.slice(0, 200) + "..."
          : msg.content;
        lines.push(`${role}: ${content}`);
      }
    }

    return lines.join("\n");
  }

  /**
   * Get recently discussed candidate IDs for quick reference
   */
  getRecentCandidateIds(userId: string, channelId: string): string[] {
    const context = this.contexts.get(this.makeKey(userId, channelId));
    if (!context) return [];

    return [...context.candidates.entries()]
      .sort((a, b) => b[1].lastMentioned.getTime() - a[1].lastMentioned.getTime())
      .slice(0, 5)
      .map(([id]) => id);
  }

  /**
   * Check if a candidate was recently discussed
   */
  wasRecentlyDiscussed(
    userId: string,
    channelId: string,
    candidateId: string,
    withinMs: number = 30 * 60 * 1000 // 30 minutes default
  ): boolean {
    const context = this.contexts.get(this.makeKey(userId, channelId));
    if (!context) return false;

    const candidateContext = context.candidates.get(candidateId);
    if (!candidateContext) return false;

    return Date.now() - candidateContext.lastMentioned.getTime() < withinMs;
  }

  /**
   * Clear context for a user/channel (e.g., when user says "start fresh")
   */
  clearContext(userId: string, channelId: string): void {
    this.contexts.delete(this.makeKey(userId, channelId));
  }

  /**
   * Cleanup expired contexts
   */
  private cleanupExpiredContexts(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, context] of this.contexts) {
      if (now - context.lastActivityAt.getTime() > CONTEXT_EXPIRY_MS) {
        this.contexts.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`[Memory] Cleaned up ${cleaned} expired conversation contexts`);
    }
  }

  /**
   * Shutdown the memory manager
   */
  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Get stats for monitoring
   */
  getStats(): { activeContexts: number; totalMessages: number; totalCandidates: number } {
    let totalMessages = 0;
    let totalCandidates = 0;

    for (const context of this.contexts.values()) {
      totalMessages += context.messages.length;
      totalCandidates += context.candidates.size;
    }

    return {
      activeContexts: this.contexts.size,
      totalMessages,
      totalCandidates,
    };
  }

  private makeKey(userId: string, channelId: string): string {
    return `${userId}:${channelId}`;
  }
}
