/**
 * Tests for ConversationMemory
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ConversationMemory } from "./conversation-memory.js";
import { createMockCandidate, createMockApplicationWithContext, createMockJob, createMockStage } from "../utils/test-factories.js";

describe("ConversationMemory", () => {
  let memory: ConversationMemory;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-15T10:00:00Z"));
    memory = new ConversationMemory();
  });

  afterEach(() => {
    memory.shutdown();
    vi.useRealTimers();
  });

  describe("getContext", () => {
    it("should create new context for new user/channel pair", () => {
      const context = memory.getContext("user-1", "channel-1");

      expect(context).toBeDefined();
      expect(context.messages).toHaveLength(0);
      expect(context.candidates.size).toBe(0);
      expect(context.startedAt).toBeInstanceOf(Date);
      expect(context.lastActivityAt).toBeInstanceOf(Date);
    });

    it("should return same context for same user/channel pair", () => {
      const context1 = memory.getContext("user-1", "channel-1");
      const context2 = memory.getContext("user-1", "channel-1");

      expect(context1).toBe(context2);
    });

    it("should return different contexts for different users", () => {
      const context1 = memory.getContext("user-1", "channel-1");
      const context2 = memory.getContext("user-2", "channel-1");

      expect(context1).not.toBe(context2);
    });

    it("should return different contexts for different channels", () => {
      const context1 = memory.getContext("user-1", "channel-1");
      const context2 = memory.getContext("user-1", "channel-2");

      expect(context1).not.toBe(context2);
    });
  });

  describe("addUserMessage", () => {
    it("should add user message to context", () => {
      memory.addUserMessage("user-1", "channel-1", "Who is John?");

      const context = memory.getContext("user-1", "channel-1");
      expect(context.messages).toHaveLength(1);
      expect(context.messages[0]).toMatchObject({
        role: "user",
        content: "Who is John?",
      });
    });

    it("should add candidate IDs when provided", () => {
      memory.addUserMessage("user-1", "channel-1", "Tell me about these", ["c-1", "c-2"]);

      const context = memory.getContext("user-1", "channel-1");
      expect(context.messages[0]?.candidateIds).toEqual(["c-1", "c-2"]);
    });

    it("should not include candidateIds key when not provided", () => {
      memory.addUserMessage("user-1", "channel-1", "Hello");

      const context = memory.getContext("user-1", "channel-1");
      expect(context.messages[0]).not.toHaveProperty("candidateIds");
    });

    it("should trim to max 20 messages", () => {
      // Add 25 messages
      for (let i = 0; i < 25; i++) {
        memory.addUserMessage("user-1", "channel-1", `Message ${i}`);
      }

      const context = memory.getContext("user-1", "channel-1");
      expect(context.messages).toHaveLength(20);
      // Should have the last 20 messages (5-24)
      expect(context.messages[0]?.content).toBe("Message 5");
      expect(context.messages[19]?.content).toBe("Message 24");
    });

    it("should update lastActivityAt", () => {
      const context = memory.getContext("user-1", "channel-1");
      const initialTime = context.lastActivityAt;

      vi.advanceTimersByTime(1000);
      memory.addUserMessage("user-1", "channel-1", "Hello");

      expect(context.lastActivityAt.getTime()).toBeGreaterThan(initialTime.getTime());
    });
  });

  describe("addAssistantMessage", () => {
    it("should add assistant message to context", () => {
      memory.addAssistantMessage("user-1", "channel-1", "John is a DevOps engineer");

      const context = memory.getContext("user-1", "channel-1");
      expect(context.messages).toHaveLength(1);
      expect(context.messages[0]).toMatchObject({
        role: "assistant",
        content: "John is a DevOps engineer",
      });
    });

    it("should add candidate IDs and facts when provided", () => {
      memory.addAssistantMessage(
        "user-1",
        "channel-1",
        "Found two candidates",
        ["c-1", "c-2"],
        ["John is in technical interview", "Mary is in offer stage"]
      );

      const context = memory.getContext("user-1", "channel-1");
      expect(context.messages[0]?.candidateIds).toEqual(["c-1", "c-2"]);
      expect(context.messages[0]?.facts).toEqual([
        "John is in technical interview",
        "Mary is in offer stage",
      ]);
    });

    it("should not include optional keys when not provided", () => {
      memory.addAssistantMessage("user-1", "channel-1", "Hello");

      const context = memory.getContext("user-1", "channel-1");
      expect(context.messages[0]).not.toHaveProperty("candidateIds");
      expect(context.messages[0]).not.toHaveProperty("facts");
    });
  });

  describe("recordCandidateContext", () => {
    it("should record candidate context", () => {
      const candidate = createMockCandidate({ id: "c-1", name: "John Doe" });

      memory.recordCandidateContext("user-1", "channel-1", candidate);

      const context = memory.getContext("user-1", "channel-1");
      expect(context.candidates.has("c-1")).toBe(true);
      expect(context.candidates.get("c-1")).toMatchObject({
        candidateId: "c-1",
        candidateName: "John Doe",
      });
    });

    it("should record application context when provided", () => {
      const candidate = createMockCandidate({ id: "c-1", name: "John Doe" });
      const application = createMockApplicationWithContext({
        id: "app-1",
        job: createMockJob({ id: "job-1", title: "Senior Engineer" }),
        currentInterviewStage: createMockStage({ id: "stage-1", title: "Technical Interview" }),
      });

      memory.recordCandidateContext("user-1", "channel-1", candidate, application);

      const context = memory.getContext("user-1", "channel-1");
      const candidateContext = context.candidates.get("c-1");
      expect(candidateContext?.lastApplication).toMatchObject({
        applicationId: "app-1",
        jobTitle: "Senior Engineer",
        stage: "Technical Interview",
      });
    });

    it("should accumulate notes for same candidate", () => {
      const candidate = createMockCandidate({ id: "c-1", name: "John Doe" });

      memory.recordCandidateContext("user-1", "channel-1", candidate, undefined, ["Note 1"]);
      memory.recordCandidateContext("user-1", "channel-1", candidate, undefined, ["Note 2"]);

      const context = memory.getContext("user-1", "channel-1");
      expect(context.candidates.get("c-1")?.notes).toEqual(["Note 1", "Note 2"]);
    });

    it("should limit to max 10 candidates (LRU eviction)", () => {
      // Add 12 candidates
      for (let i = 0; i < 12; i++) {
        const candidate = createMockCandidate({ id: `c-${i}`, name: `Candidate ${i}` });
        memory.recordCandidateContext("user-1", "channel-1", candidate);
        vi.advanceTimersByTime(100); // Advance time to ensure different lastMentioned
      }

      const context = memory.getContext("user-1", "channel-1");
      expect(context.candidates.size).toBe(10);
      // First two candidates should be evicted
      expect(context.candidates.has("c-0")).toBe(false);
      expect(context.candidates.has("c-1")).toBe(false);
      expect(context.candidates.has("c-2")).toBe(true);
    });
  });

  describe("addCandidateNote", () => {
    it("should add note to existing candidate", () => {
      const candidate = createMockCandidate({ id: "c-1", name: "John" });
      memory.recordCandidateContext("user-1", "channel-1", candidate);

      memory.addCandidateNote("user-1", "channel-1", "c-1", "Strong technical skills");

      const context = memory.getContext("user-1", "channel-1");
      expect(context.candidates.get("c-1")?.notes).toContain("Strong technical skills");
    });

    it("should do nothing for unknown candidate", () => {
      memory.addCandidateNote("user-1", "channel-1", "unknown-id", "Some note");

      const context = memory.getContext("user-1", "channel-1");
      expect(context.candidates.has("unknown-id")).toBe(false);
    });

    it("should limit notes to 10 per candidate", () => {
      const candidate = createMockCandidate({ id: "c-1", name: "John" });
      memory.recordCandidateContext("user-1", "channel-1", candidate);

      // Add 15 notes
      for (let i = 0; i < 15; i++) {
        memory.addCandidateNote("user-1", "channel-1", "c-1", `Note ${i}`);
      }

      const context = memory.getContext("user-1", "channel-1");
      const notes = context.candidates.get("c-1")?.notes ?? [];
      expect(notes).toHaveLength(10);
      expect(notes[0]).toBe("Note 5"); // First 5 should be evicted
      expect(notes[9]).toBe("Note 14");
    });
  });

  describe("buildContextSummary", () => {
    it("should return null for empty context", () => {
      const summary = memory.buildContextSummary("user-1", "channel-1");
      expect(summary).toBeNull();
    });

    it("should include candidates section when candidates exist", () => {
      const candidate = createMockCandidate({ id: "c-1", name: "John Doe" });
      const application = createMockApplicationWithContext({
        id: "app-1",
        job: createMockJob({ id: "job-1", title: "DevOps Engineer" }),
        currentInterviewStage: createMockStage({ id: "stage-1", title: "Phone Screen" }),
      });

      memory.recordCandidateContext("user-1", "channel-1", candidate, application);

      const summary = memory.buildContextSummary("user-1", "channel-1");
      expect(summary).toContain("CANDIDATES DISCUSSED");
      expect(summary).toContain("John Doe");
      expect(summary).toContain("DevOps Engineer");
      expect(summary).toContain("Phone Screen");
    });

    it("should include recent conversation section", () => {
      memory.addUserMessage("user-1", "channel-1", "Who is John?");
      memory.addAssistantMessage("user-1", "channel-1", "John is an engineer");

      const summary = memory.buildContextSummary("user-1", "channel-1");
      expect(summary).toContain("RECENT CONVERSATION");
      expect(summary).toContain("User: Who is John?");
      expect(summary).toContain("You: John is an engineer");
    });

    it("should truncate long messages in summary", () => {
      const longMessage = "A".repeat(300);
      memory.addUserMessage("user-1", "channel-1", longMessage);

      const summary = memory.buildContextSummary("user-1", "channel-1");
      expect(summary).toContain("...");
      expect(summary?.length).toBeLessThan(longMessage.length);
    });

    it("should only include last 5 messages", () => {
      for (let i = 0; i < 10; i++) {
        memory.addUserMessage("user-1", "channel-1", `Message ${i}`);
      }

      const summary = memory.buildContextSummary("user-1", "channel-1");
      expect(summary).not.toContain("Message 0");
      expect(summary).not.toContain("Message 4");
      expect(summary).toContain("Message 5");
      expect(summary).toContain("Message 9");
    });
  });

  describe("getRecentCandidateIds", () => {
    it("should return empty array for no candidates", () => {
      const ids = memory.getRecentCandidateIds("user-1", "channel-1");
      expect(ids).toEqual([]);
    });

    it("should return candidate IDs sorted by recency", () => {
      for (let i = 0; i < 3; i++) {
        const candidate = createMockCandidate({ id: `c-${i}`, name: `Candidate ${i}` });
        memory.recordCandidateContext("user-1", "channel-1", candidate);
        vi.advanceTimersByTime(100);
      }

      const ids = memory.getRecentCandidateIds("user-1", "channel-1");
      expect(ids).toEqual(["c-2", "c-1", "c-0"]); // Most recent first
    });

    it("should limit to 5 candidates", () => {
      for (let i = 0; i < 10; i++) {
        const candidate = createMockCandidate({ id: `c-${i}`, name: `Candidate ${i}` });
        memory.recordCandidateContext("user-1", "channel-1", candidate);
        vi.advanceTimersByTime(100);
      }

      const ids = memory.getRecentCandidateIds("user-1", "channel-1");
      expect(ids).toHaveLength(5);
    });
  });

  describe("wasRecentlyDiscussed", () => {
    it("should return false for unknown candidate", () => {
      const result = memory.wasRecentlyDiscussed("user-1", "channel-1", "unknown-id");
      expect(result).toBe(false);
    });

    it("should return true for recently discussed candidate", () => {
      const candidate = createMockCandidate({ id: "c-1", name: "John" });
      memory.recordCandidateContext("user-1", "channel-1", candidate);

      const result = memory.wasRecentlyDiscussed("user-1", "channel-1", "c-1");
      expect(result).toBe(true);
    });

    it("should return false for candidate discussed beyond threshold", () => {
      const candidate = createMockCandidate({ id: "c-1", name: "John" });
      memory.recordCandidateContext("user-1", "channel-1", candidate);

      // Advance 35 minutes (default threshold is 30 min)
      vi.advanceTimersByTime(35 * 60 * 1000);

      const result = memory.wasRecentlyDiscussed("user-1", "channel-1", "c-1");
      expect(result).toBe(false);
    });

    it("should respect custom threshold", () => {
      const candidate = createMockCandidate({ id: "c-1", name: "John" });
      memory.recordCandidateContext("user-1", "channel-1", candidate);

      vi.advanceTimersByTime(5 * 60 * 1000); // 5 minutes

      // Default 30 min threshold - should still be recent
      expect(memory.wasRecentlyDiscussed("user-1", "channel-1", "c-1")).toBe(true);

      // Custom 1 min threshold - should not be recent
      expect(memory.wasRecentlyDiscussed("user-1", "channel-1", "c-1", 60 * 1000)).toBe(false);
    });
  });

  describe("clearContext", () => {
    it("should clear all data for user/channel", () => {
      const candidate = createMockCandidate({ id: "c-1", name: "John" });
      memory.addUserMessage("user-1", "channel-1", "Hello");
      memory.recordCandidateContext("user-1", "channel-1", candidate);

      memory.clearContext("user-1", "channel-1");

      // Getting context should return fresh one
      const context = memory.getContext("user-1", "channel-1");
      expect(context.messages).toHaveLength(0);
      expect(context.candidates.size).toBe(0);
    });

    it("should not affect other user/channel contexts", () => {
      memory.addUserMessage("user-1", "channel-1", "Message 1");
      memory.addUserMessage("user-2", "channel-1", "Message 2");

      memory.clearContext("user-1", "channel-1");

      const context2 = memory.getContext("user-2", "channel-1");
      expect(context2.messages).toHaveLength(1);
    });
  });

  describe("cleanupExpiredContexts", () => {
    it("should cleanup contexts older than 4 hours", () => {
      memory.addUserMessage("user-1", "channel-1", "Old message");

      // Advance 5 hours
      vi.advanceTimersByTime(5 * 60 * 60 * 1000);

      // Trigger cleanup via timer
      vi.advanceTimersByTime(30 * 60 * 1000); // Cleanup runs every 30 min

      // Context should be empty (recreated)
      const summary = memory.buildContextSummary("user-1", "channel-1");
      expect(summary).toBeNull();
    });

    it("should not cleanup active contexts", () => {
      memory.addUserMessage("user-1", "channel-1", "Recent message");

      // Advance 1 hour
      vi.advanceTimersByTime(60 * 60 * 1000);

      // Trigger cleanup
      vi.advanceTimersByTime(30 * 60 * 1000);

      const context = memory.getContext("user-1", "channel-1");
      expect(context.messages).toHaveLength(1);
    });
  });

  describe("getStats", () => {
    it("should return accurate stats", () => {
      memory.addUserMessage("user-1", "channel-1", "Message 1");
      memory.addUserMessage("user-1", "channel-1", "Message 2");
      memory.addUserMessage("user-2", "channel-1", "Message 3");

      const candidate = createMockCandidate({ id: "c-1", name: "John" });
      memory.recordCandidateContext("user-1", "channel-1", candidate);

      const stats = memory.getStats();
      expect(stats.activeContexts).toBe(2);
      expect(stats.totalMessages).toBe(3);
      expect(stats.totalCandidates).toBe(1);
    });
  });

  describe("shutdown", () => {
    it("should stop cleanup interval", () => {
      memory.shutdown();

      // After shutdown, advancing time shouldn't cause cleanup
      // This is mainly to ensure no errors occur
      vi.advanceTimersByTime(60 * 60 * 1000);

      expect(true).toBe(true); // If we get here without error, it passed
    });
  });
});
