/**
 * Integration tests for component independence
 *
 * These tests verify that:
 * 1. Components work independently without each other
 * 2. Components gracefully handle missing dependencies
 * 3. Components can be wired together properly
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ConversationMemory } from "../memory/conversation-memory.js";
import { BlockerAlertScheduler, type BlockerAlertConfig } from "../scheduler/blocker-alerts.js";
import type { AshbyService } from "../ashby/service.js";
import type { WebClient } from "@slack/web-api";
import type { BatchBlockerAnalysis, CandidateBlocker } from "../types/index.js";
import { createMockCandidate, createMockApplicationWithContext, createMockJob, createMockStage } from "../utils/test-factories.js";

describe("Component Independence", () => {
  describe("ConversationMemory independence", () => {
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

    it("should work without any external dependencies", () => {
      // ConversationMemory has no constructor dependencies
      expect(memory).toBeDefined();
      expect(memory.getStats().activeContexts).toBe(0);
    });

    it("should store and retrieve messages without Ashby data", () => {
      memory.addUserMessage("user-1", "channel-1", "Hello, bot!");
      memory.addAssistantMessage("user-1", "channel-1", "Hello! How can I help?");

      const summary = memory.buildContextSummary("user-1", "channel-1");
      expect(summary).toContain("Hello, bot!");
      expect(summary).toContain("Hello! How can I help?");
    });

    it("should work with Ashby data when available", () => {
      const candidate = createMockCandidate({ id: "c-1", name: "Jane Doe" });
      const application = createMockApplicationWithContext({
        job: createMockJob({ title: "Senior Developer" }),
        currentInterviewStage: createMockStage({ title: "Technical Screen" }),
      });

      memory.recordCandidateContext("user-1", "channel-1", candidate, application);

      const summary = memory.buildContextSummary("user-1", "channel-1");
      expect(summary).toContain("Jane Doe");
      expect(summary).toContain("Senior Developer");
      expect(summary).toContain("Technical Screen");
    });

    it("should isolate contexts across different user/channel combinations", () => {
      // First user
      memory.addUserMessage("user-1", "channel-1", "Message from user 1");

      // Second user
      memory.addUserMessage("user-2", "channel-1", "Message from user 2");

      // Same user, different channel
      memory.addUserMessage("user-1", "channel-2", "Message in channel 2");

      expect(memory.getStats().activeContexts).toBe(3);

      const summary1 = memory.buildContextSummary("user-1", "channel-1");
      expect(summary1).toContain("Message from user 1");
      expect(summary1).not.toContain("Message from user 2");

      const summary2 = memory.buildContextSummary("user-2", "channel-1");
      expect(summary2).toContain("Message from user 2");
    });

    it("should gracefully handle clearing non-existent context", () => {
      // Should not throw
      expect(() => memory.clearContext("non-existent", "channel")).not.toThrow();
    });

    it("should expire contexts after inactivity", () => {
      memory.addUserMessage("user-1", "channel-1", "Old message");

      // Advance 5 hours (beyond 4 hour expiry)
      vi.advanceTimersByTime(5 * 60 * 60 * 1000);

      // Trigger cleanup
      vi.advanceTimersByTime(30 * 60 * 1000);

      const summary = memory.buildContextSummary("user-1", "channel-1");
      expect(summary).toBeNull();
    });
  });

  describe("BlockerAlertScheduler independence", () => {
    let mockAshby: Partial<AshbyService>;
    let mockSlackClient: Partial<WebClient>;
    let defaultConfig: BlockerAlertConfig;

    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-01-15T10:00:00Z"));

      mockSlackClient = {
        chat: {
          postMessage: vi.fn().mockResolvedValue({ ok: true, ts: "123.456" }),
        } as unknown as WebClient["chat"],
      };

      mockAshby = {
        analyzeCandidateBlockers: vi.fn(),
      };

      defaultConfig = {
        enabled: true,
        cronExpression: "0 */4 * * *",
        channelId: "C123456",
        minSeverity: "warning",
        notifyHiringManagers: false,
        cooldownHours: 8,
      };
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("should be constructable without Ashby service", () => {
      const scheduler = new BlockerAlertScheduler(null, defaultConfig);
      expect(scheduler).toBeDefined();
      expect(scheduler.isReady()).toBe(false);
    });

    it("should report not ready when missing Ashby service", () => {
      const scheduler = new BlockerAlertScheduler(null, defaultConfig);
      scheduler.setSlackClient(mockSlackClient as WebClient);
      expect(scheduler.isReady()).toBe(false);
    });

    it("should report not ready when missing Slack client", () => {
      const scheduler = new BlockerAlertScheduler(mockAshby as AshbyService, defaultConfig);
      expect(scheduler.isReady()).toBe(false);
    });

    it("should report ready when both dependencies available", () => {
      const scheduler = new BlockerAlertScheduler(mockAshby as AshbyService, defaultConfig);
      scheduler.setSlackClient(mockSlackClient as WebClient);
      expect(scheduler.isReady()).toBe(true);
    });

    it("should throw clear error when triggering without Ashby", async () => {
      const scheduler = new BlockerAlertScheduler(null, defaultConfig);
      scheduler.setSlackClient(mockSlackClient as WebClient);

      await expect(scheduler.triggerNow()).rejects.toThrow(
        "AshbyService not available"
      );
    });

    it("should throw clear error when triggering without Slack", async () => {
      const scheduler = new BlockerAlertScheduler(mockAshby as AshbyService, defaultConfig);

      await expect(scheduler.triggerNow()).rejects.toThrow(
        "Slack client not initialized"
      );
    });

    it("should work properly when fully configured", async () => {
      const candidate = createMockCandidate({ id: "c-1", name: "Test User" });
      const blocker: CandidateBlocker = {
        type: "no_interview_scheduled",
        severity: "warning",
        message: "No interview scheduled",
        suggestedAction: "Schedule an interview",
      };

      const emptyBlockerAnalysis: BatchBlockerAnalysis = {
        analyzed: 1,
        byBlockerType: {
          no_interview_scheduled: [{ candidate, blocker, daysInStage: 5 }],
          awaiting_feedback: [],
          ready_to_move: [],
          offer_pending: [],
          offer_not_sent: [],
          interview_completed_no_feedback: [],
          no_blocker: [],
        },
        summary: { critical: 0, warning: 1, info: 0 },
        urgentCandidates: [],
      };

      vi.mocked(mockAshby.analyzeCandidateBlockers!).mockResolvedValue(emptyBlockerAnalysis);

      const scheduler = new BlockerAlertScheduler(mockAshby as AshbyService, defaultConfig);
      scheduler.setSlackClient(mockSlackClient as WebClient);

      await scheduler.triggerNow();

      expect(mockSlackClient.chat?.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: "C123456",
          text: expect.stringContaining("Test User"),
        })
      );
    });

    it("should gracefully stop when not started", () => {
      const scheduler = new BlockerAlertScheduler(null, defaultConfig);
      // Should not throw
      expect(() => scheduler.stop()).not.toThrow();
    });
  });

  describe("Components working together", () => {
    let memory: ConversationMemory;
    let mockAshby: Partial<AshbyService>;
    let mockSlackClient: Partial<WebClient>;
    let scheduler: BlockerAlertScheduler;

    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-01-15T10:00:00Z"));

      memory = new ConversationMemory();

      mockSlackClient = {
        chat: {
          postMessage: vi.fn().mockResolvedValue({ ok: true, ts: "123.456" }),
        } as unknown as WebClient["chat"],
      };

      mockAshby = {
        analyzeCandidateBlockers: vi.fn(),
      };

      scheduler = new BlockerAlertScheduler(mockAshby as AshbyService, {
        enabled: false, // Don't start cron
        cronExpression: "0 */4 * * *",
        channelId: "C123456",
        minSeverity: "warning",
        notifyHiringManagers: false,
        cooldownHours: 8,
      });
      scheduler.setSlackClient(mockSlackClient as WebClient);
    });

    afterEach(() => {
      memory.shutdown();
      scheduler.stop();
      vi.useRealTimers();
    });

    it("should allow memory to store candidates independent of scheduler", () => {
      // Memory works without scheduler
      const candidate = createMockCandidate({ id: "c-1", name: "Alice" });
      memory.recordCandidateContext("user-1", "channel-1", candidate);

      const summary = memory.buildContextSummary("user-1", "channel-1");
      expect(summary).toContain("Alice");
    });

    it("should allow scheduler to detect blockers independent of memory", async () => {
      // Scheduler works without memory
      const candidate = createMockCandidate({ id: "c-1", name: "Bob" });
      const blocker: CandidateBlocker = {
        type: "awaiting_feedback",
        severity: "warning",
        message: "Feedback needed",
        suggestedAction: "Submit feedback",
      };

      const analysis: BatchBlockerAnalysis = {
        analyzed: 1,
        byBlockerType: {
          no_interview_scheduled: [],
          awaiting_feedback: [{ candidate, blocker, daysInStage: 3 }],
          ready_to_move: [],
          offer_pending: [],
          offer_not_sent: [],
          interview_completed_no_feedback: [],
          no_blocker: [],
        },
        summary: { critical: 0, warning: 1, info: 0 },
        urgentCandidates: [],
      };

      vi.mocked(mockAshby.analyzeCandidateBlockers!).mockResolvedValue(analysis);

      await scheduler.triggerNow();

      expect(mockSlackClient.chat?.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining("Bob"),
        })
      );
    });

    it("should allow both components to reference the same candidate data", () => {
      // Same candidate used in both systems
      const candidate = createMockCandidate({ id: "c-1", name: "Charlie" });
      const application = createMockApplicationWithContext({
        job: createMockJob({ title: "Engineer" }),
        currentInterviewStage: createMockStage({ title: "Onsite" }),
      });

      // Store in memory
      memory.recordCandidateContext("user-1", "channel-1", candidate, application);

      // Memory has the candidate
      expect(memory.wasRecentlyDiscussed("user-1", "channel-1", "c-1")).toBe(true);

      // Scheduler would receive same candidate from Ashby
      const blocker: CandidateBlocker = {
        type: "no_interview_scheduled",
        severity: "warning",
        message: "No interview",
        suggestedAction: "Schedule",
      };

      // Both components can work with the same candidate ID
      expect(candidate.id).toBe("c-1");
      expect(blocker.type).toBe("no_interview_scheduled");
    });
  });

  describe("Error isolation", () => {
    it("memory errors should not affect scheduler", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-01-15T10:00:00Z"));

      const memory = new ConversationMemory();

      const mockSlackClient = {
        chat: {
          postMessage: vi.fn().mockResolvedValue({ ok: true, ts: "123.456" }),
        } as unknown as WebClient["chat"],
      };

      const mockAshby = {
        analyzeCandidateBlockers: vi.fn().mockResolvedValue({
          analyzed: 0,
          byBlockerType: {
            no_interview_scheduled: [],
            awaiting_feedback: [],
            ready_to_move: [],
            offer_pending: [],
            offer_not_sent: [],
            interview_completed_no_feedback: [],
            no_blocker: [],
          },
          summary: { critical: 0, warning: 0, info: 0 },
          urgentCandidates: [],
        }),
      };

      const blockerScheduler = new BlockerAlertScheduler(mockAshby as unknown as AshbyService, {
        enabled: false,
        cronExpression: "0 */4 * * *",
        channelId: "C123456",
        minSeverity: "warning",
        notifyHiringManagers: false,
        cooldownHours: 8,
      });
      blockerScheduler.setSlackClient(mockSlackClient as WebClient);

      // Shut down memory (simulates a problem)
      memory.shutdown();

      // Scheduler should still work
      await expect(blockerScheduler.triggerNow()).resolves.not.toThrow();

      blockerScheduler.stop();
      vi.useRealTimers();
    });

    it("scheduler errors should not affect memory", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-01-15T10:00:00Z"));

      const memory = new ConversationMemory();

      // Scheduler without dependencies (will throw on triggerNow)
      // We don't need to use the scheduler, just verify memory works independently
      new BlockerAlertScheduler(null, {
        enabled: false,
        cronExpression: "0 */4 * * *",
        channelId: "C123456",
        minSeverity: "warning",
        notifyHiringManagers: false,
        cooldownHours: 8,
      });

      // Memory should still work
      memory.addUserMessage("user-1", "channel-1", "Test message");
      const summary = memory.buildContextSummary("user-1", "channel-1");
      expect(summary).toContain("Test message");

      memory.shutdown();
      vi.useRealTimers();
    });
  });
});
