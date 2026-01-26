/**
 * Triage Session Manager Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TriageSessionManager } from "./session-manager.js";
import type { ApplicationWithContext } from "../types/index.js";

const createMockCandidate = (id: string): ApplicationWithContext => ({
  id: `app-${id}`,
  candidateId: `c-${id}`,
  status: "Active",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  currentInterviewStageId: "stage-1",
  jobId: "job-1",
  candidate: {
    id: `c-${id}`,
    name: `Candidate ${id}`,
    primaryEmailAddress: { value: `candidate${id}@example.com`, type: "Primary", isPrimary: true },
  } as any,
  currentInterviewStage: { id: "s-1", title: "Phone Screen" } as any,
  job: { id: "j-1", title: "Software Engineer", status: "Open" } as any,
  daysInCurrentStage: 5,
  isStale: false,
});

describe("TriageSessionManager", () => {
  let manager: TriageSessionManager;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-24T10:00:00Z"));
    manager = new TriageSessionManager();
  });

  afterEach(() => {
    manager.shutdown();
    vi.useRealTimers();
  });

  describe("create", () => {
    it("should create a new triage session", () => {
      const candidates = [createMockCandidate("1"), createMockCandidate("2")];

      const { session } = manager.create({
        userId: "user-1",
        channelId: "channel-1",
        messageTs: "1234567890.123456",
        candidates,
      });

      expect(session.id).toMatch(/^triage-user-1-/);
      expect(session.userId).toBe("user-1");
      expect(session.channelId).toBe("channel-1");
      expect(session.messageTs).toBe("1234567890.123456");
      expect(session.candidates).toHaveLength(2);
      expect(session.currentIndex).toBe(0);
      expect(session.decisions).toEqual([]);
    });

    it("should set expiration 10 minutes from creation", () => {
      const { session } = manager.create({
        userId: "user-1",
        channelId: "channel-1",
        messageTs: "ts-1",
        candidates: [createMockCandidate("1")],
      });

      const expectedExpiry = new Date("2026-01-24T10:10:00Z").getTime();
      expect(session.expiresAt.getTime()).toBe(expectedExpiry);
    });

    it("should store optional targetStageId and archiveReasonId", () => {
      const { session } = manager.create({
        userId: "user-1",
        channelId: "channel-1",
        messageTs: "ts-1",
        candidates: [createMockCandidate("1")],
        targetStageId: "stage-2",
        archiveReasonId: "reason-1",
      });

      expect(session.targetStageId).toBe("stage-2");
      expect(session.archiveReasonId).toBe("reason-1");
    });

    it("should end existing session for same user", () => {
      const candidates1 = [createMockCandidate("1")];
      const candidates2 = [createMockCandidate("2"), createMockCandidate("3")];

      manager.create({
        userId: "user-1",
        channelId: "channel-1",
        messageTs: "ts-1",
        candidates: candidates1,
      });

      const { session: session2 } = manager.create({
        userId: "user-1",
        channelId: "channel-2",
        messageTs: "ts-2",
        candidates: candidates2,
      });

      // Old session should be replaced
      const retrieved = manager.get("user-1");
      expect(retrieved?.id).toBe(session2.id);
      expect(retrieved?.candidates).toHaveLength(2);
    });
  });

  describe("get", () => {
    it("should return session by user ID", () => {
      const candidates = [createMockCandidate("1")];
      manager.create({
        userId: "user-1",
        channelId: "channel-1",
        messageTs: "ts-1",
        candidates,
      });

      const session = manager.get("user-1");

      expect(session).not.toBeNull();
      expect(session?.userId).toBe("user-1");
    });

    it("should return null for non-existent user", () => {
      const session = manager.get("nonexistent");

      expect(session).toBeNull();
    });

    it("should return null for expired session", () => {
      manager.create({
        userId: "user-1",
        channelId: "channel-1",
        messageTs: "ts-1",
        candidates: [createMockCandidate("1")],
      });

      // Advance time past expiration
      vi.advanceTimersByTime(11 * 60 * 1000); // 11 minutes

      const session = manager.get("user-1");

      expect(session).toBeNull();
    });
  });

  describe("findByMessage", () => {
    it("should find session by channel and message timestamp", () => {
      manager.create({
        userId: "user-1",
        channelId: "channel-1",
        messageTs: "1234567890.123456",
        candidates: [createMockCandidate("1")],
      });

      const session = manager.findByMessage("channel-1", "1234567890.123456");

      expect(session).not.toBeNull();
      expect(session?.userId).toBe("user-1");
    });

    it("should return null for wrong channel", () => {
      manager.create({
        userId: "user-1",
        channelId: "channel-1",
        messageTs: "ts-1",
        candidates: [createMockCandidate("1")],
      });

      const session = manager.findByMessage("channel-2", "ts-1");

      expect(session).toBeNull();
    });

    it("should return null for wrong messageTs", () => {
      manager.create({
        userId: "user-1",
        channelId: "channel-1",
        messageTs: "ts-1",
        candidates: [createMockCandidate("1")],
      });

      const session = manager.findByMessage("channel-1", "ts-wrong");

      expect(session).toBeNull();
    });

    it("should return null for expired session", () => {
      manager.create({
        userId: "user-1",
        channelId: "channel-1",
        messageTs: "ts-1",
        candidates: [createMockCandidate("1")],
      });

      vi.advanceTimersByTime(11 * 60 * 1000);

      const session = manager.findByMessage("channel-1", "ts-1");

      expect(session).toBeNull();
    });
  });

  describe("recordDecision", () => {
    it("should record advance decision", () => {
      const candidates = [createMockCandidate("1"), createMockCandidate("2")];
      manager.create({
        userId: "user-1",
        channelId: "channel-1",
        messageTs: "ts-1",
        candidates,
      });

      const result = manager.recordDecision("user-1", "advance");

      expect(result).not.toBeNull();
      expect(result?.candidate.candidateId).toBe("c-1");
      expect(result?.hasMore).toBe(true);
      expect(result?.nextCandidate?.candidateId).toBe("c-2");

      const session = manager.get("user-1");
      expect(session?.decisions).toHaveLength(1);
      expect(session?.decisions[0]?.decision).toBe("advance");
    });

    it("should record reject decision", () => {
      manager.create({
        userId: "user-1",
        channelId: "channel-1",
        messageTs: "ts-1",
        candidates: [createMockCandidate("1")],
      });

      const result = manager.recordDecision("user-1", "reject");

      expect(result).not.toBeNull();
      const session = manager.get("user-1");
      expect(session?.decisions[0]?.decision).toBe("reject");
    });

    it("should record skip decision", () => {
      manager.create({
        userId: "user-1",
        channelId: "channel-1",
        messageTs: "ts-1",
        candidates: [createMockCandidate("1")],
      });

      const result = manager.recordDecision("user-1", "skip");

      expect(result).not.toBeNull();
      const session = manager.get("user-1");
      expect(session?.decisions[0]?.decision).toBe("skip");
    });

    it("should return hasMore=false on last candidate", () => {
      manager.create({
        userId: "user-1",
        channelId: "channel-1",
        messageTs: "ts-1",
        candidates: [createMockCandidate("1")],
      });

      const result = manager.recordDecision("user-1", "advance");

      expect(result?.hasMore).toBe(false);
      expect(result?.nextCandidate).toBeUndefined();
    });

    it("should extend session expiry after decision", () => {
      manager.create({
        userId: "user-1",
        channelId: "channel-1",
        messageTs: "ts-1",
        candidates: [createMockCandidate("1"), createMockCandidate("2")],
      });

      vi.advanceTimersByTime(5 * 60 * 1000); // 5 minutes
      manager.recordDecision("user-1", "advance");

      const session = manager.get("user-1");
      // Should expire 10 minutes from now (5 min already passed + 10 more)
      const expectedExpiry = new Date("2026-01-24T10:15:00Z").getTime();
      expect(session?.expiresAt.getTime()).toBe(expectedExpiry);
    });

    it("should return null for non-existent session", () => {
      const result = manager.recordDecision("nonexistent", "advance");

      expect(result).toBeNull();
    });

    it("should advance currentIndex after decision", () => {
      manager.create({
        userId: "user-1",
        channelId: "channel-1",
        messageTs: "ts-1",
        candidates: [createMockCandidate("1"), createMockCandidate("2")],
      });

      manager.recordDecision("user-1", "advance");

      const session = manager.get("user-1");
      expect(session?.currentIndex).toBe(1);
    });
  });

  describe("getCurrentCandidate", () => {
    it("should return current candidate", () => {
      manager.create({
        userId: "user-1",
        channelId: "channel-1",
        messageTs: "ts-1",
        candidates: [createMockCandidate("1"), createMockCandidate("2")],
      });

      const candidate = manager.getCurrentCandidate("user-1");

      expect(candidate?.candidateId).toBe("c-1");
    });

    it("should return next candidate after decision", () => {
      manager.create({
        userId: "user-1",
        channelId: "channel-1",
        messageTs: "ts-1",
        candidates: [createMockCandidate("1"), createMockCandidate("2")],
      });

      manager.recordDecision("user-1", "advance");
      const candidate = manager.getCurrentCandidate("user-1");

      expect(candidate?.candidateId).toBe("c-2");
    });

    it("should return null when all candidates reviewed", () => {
      manager.create({
        userId: "user-1",
        channelId: "channel-1",
        messageTs: "ts-1",
        candidates: [createMockCandidate("1")],
      });

      manager.recordDecision("user-1", "advance");
      const candidate = manager.getCurrentCandidate("user-1");

      expect(candidate).toBeNull();
    });

    it("should return null for non-existent session", () => {
      const candidate = manager.getCurrentCandidate("nonexistent");

      expect(candidate).toBeNull();
    });
  });

  describe("getProgress", () => {
    it("should return progress info", () => {
      manager.create({
        userId: "user-1",
        channelId: "channel-1",
        messageTs: "ts-1",
        candidates: [createMockCandidate("1"), createMockCandidate("2"), createMockCandidate("3")],
      });

      const progress = manager.getProgress("user-1");

      expect(progress?.current).toBe(1);
      expect(progress?.total).toBe(3);
      expect(progress?.decisions).toEqual([]);
    });

    it("should update progress after decisions", () => {
      manager.create({
        userId: "user-1",
        channelId: "channel-1",
        messageTs: "ts-1",
        candidates: [createMockCandidate("1"), createMockCandidate("2")],
      });

      manager.recordDecision("user-1", "advance");
      const progress = manager.getProgress("user-1");

      expect(progress?.current).toBe(2);
      expect(progress?.decisions).toHaveLength(1);
    });

    it("should return null for non-existent session", () => {
      const progress = manager.getProgress("nonexistent");

      expect(progress).toBeNull();
    });
  });

  describe("endSession", () => {
    it("should end session and return it", () => {
      manager.create({
        userId: "user-1",
        channelId: "channel-1",
        messageTs: "ts-1",
        candidates: [createMockCandidate("1")],
      });

      const session = manager.endSession("user-1");

      expect(session).not.toBeNull();
      expect(session?.userId).toBe("user-1");
    });

    it("should remove session from manager", () => {
      manager.create({
        userId: "user-1",
        channelId: "channel-1",
        messageTs: "ts-1",
        candidates: [createMockCandidate("1")],
      });

      manager.endSession("user-1");
      const retrieved = manager.get("user-1");

      expect(retrieved).toBeNull();
    });

    it("should return null for non-existent session", () => {
      const session = manager.endSession("nonexistent");

      expect(session).toBeNull();
    });

    it("should preserve decisions when ending", () => {
      manager.create({
        userId: "user-1",
        channelId: "channel-1",
        messageTs: "ts-1",
        candidates: [createMockCandidate("1"), createMockCandidate("2")],
      });

      manager.recordDecision("user-1", "advance");
      manager.recordDecision("user-1", "reject");

      const session = manager.endSession("user-1");

      expect(session?.decisions).toHaveLength(2);
    });
  });

  describe("updateMessageTs", () => {
    it("should update message timestamp", () => {
      manager.create({
        userId: "user-1",
        channelId: "channel-1",
        messageTs: "ts-1",
        candidates: [createMockCandidate("1")],
      });

      manager.updateMessageTs("user-1", "ts-new");

      const session = manager.get("user-1");
      expect(session?.messageTs).toBe("ts-new");
    });

    it("should not throw for non-existent session", () => {
      // Should silently do nothing
      expect(() => {
        manager.updateMessageTs("nonexistent", "ts-new");
      }).not.toThrow();
    });
  });

  describe("cleanup", () => {
    it("should cleanup expired sessions periodically", () => {
      manager.create({
        userId: "user-1",
        channelId: "channel-1",
        messageTs: "ts-1",
        candidates: [createMockCandidate("1")],
      });

      // Advance past expiration
      vi.advanceTimersByTime(11 * 60 * 1000);
      // Advance to trigger cleanup interval (every 2 minutes)
      vi.advanceTimersByTime(2 * 60 * 1000);

      const session = manager.get("user-1");
      expect(session).toBeNull();
    });

    it("should not cleanup non-expired sessions", () => {
      manager.create({
        userId: "user-1",
        channelId: "channel-1",
        messageTs: "ts-1",
        candidates: [createMockCandidate("1")],
      });

      // Advance but stay within expiration
      vi.advanceTimersByTime(5 * 60 * 1000);

      const session = manager.get("user-1");
      expect(session).not.toBeNull();
    });
  });

  describe("shutdown", () => {
    it("should clear all sessions", () => {
      manager.create({
        userId: "user-1",
        channelId: "channel-1",
        messageTs: "ts-1",
        candidates: [createMockCandidate("1")],
      });
      manager.create({
        userId: "user-2",
        channelId: "channel-2",
        messageTs: "ts-2",
        candidates: [createMockCandidate("2")],
      });

      manager.shutdown();

      expect(manager.get("user-1")).toBeNull();
      expect(manager.get("user-2")).toBeNull();
    });
  });

  describe("formatCandidateCard", () => {
    it("should format candidate card with all details", () => {
      const candidate = createMockCandidate("1");
      candidate.candidate!.source = { id: "s-1", title: "LinkedIn", type: "referral" };

      const card = manager.formatCandidateCard(candidate, 1, 5);

      expect(card).toContain("Candidate 1/5");
      expect(card).toContain("Candidate 1");
      expect(card).toContain("candidate1@example.com");
      expect(card).toContain("Software Engineer");
      expect(card).toContain("Phone Screen");
      expect(card).toContain("Days in stage:* 5");
      expect(card).toContain("LinkedIn");
      expect(card).toContain("✅ advance");
      expect(card).toContain("❌ reject");
      expect(card).toContain("🤔 skip");
    });

    it("should handle missing candidate data gracefully", () => {
      const candidate: ApplicationWithContext = {
        id: "app-1",
        candidateId: "c-1",
        status: "Active",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        currentInterviewStageId: "stage-1",
        jobId: "job-1",
        daysInCurrentStage: 5,
        isStale: false,
        job: { id: "j-1", title: "Software Engineer", status: "Open" } as any,
        candidate: undefined as any,
        currentInterviewStage: null,
      };

      const card = manager.formatCandidateCard(candidate, 1, 1);

      expect(card).toContain("Unknown");
    });
  });

  describe("formatSummary", () => {
    it("should format summary with all decision types", () => {
      manager.create({
        userId: "user-1",
        channelId: "channel-1",
        messageTs: "ts-1",
        candidates: [
          createMockCandidate("1"),
          createMockCandidate("2"),
          createMockCandidate("3"),
        ],
      });

      manager.recordDecision("user-1", "advance");
      manager.recordDecision("user-1", "reject");
      manager.recordDecision("user-1", "skip");

      const session = manager.endSession("user-1");
      const summary = manager.formatSummary(session!);

      expect(summary).toContain("Triage Review Complete!");
      expect(summary).toContain("Ready to advance: 1");
      expect(summary).toContain("Ready to reject: 1");
      expect(summary).toContain("Skipped: 1");
      expect(summary).toContain("no changes have been made to Ashby yet");
    });

    it("should handle empty decisions", () => {
      manager.create({
        userId: "user-1",
        channelId: "channel-1",
        messageTs: "ts-1",
        candidates: [],
      });

      const session = manager.endSession("user-1");
      const summary = manager.formatSummary(session!);

      expect(summary).toContain("Ready to advance: 0");
      expect(summary).toContain("Ready to reject: 0");
      expect(summary).toContain("Skipped: 0");
    });
  });
});
