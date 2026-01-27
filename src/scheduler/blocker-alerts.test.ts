/**
 * Tests for BlockerAlertScheduler
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { BlockerAlertScheduler, type BlockerAlertConfig } from "./blocker-alerts.js";
import type { AshbyService } from "../ashby/service.js";
import type { WebClient } from "@slack/web-api";
import type { BatchBlockerAnalysis, Candidate, CandidateBlocker, BlockerType } from "../types/index.js";
import { createMockCandidate } from "../utils/test-factories.js";

describe("BlockerAlertScheduler", () => {
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

  function createBlockerAnalysis(
    blockers: Array<{
      candidate: Candidate;
      blocker: CandidateBlocker;
      daysInStage: number;
    }>
  ): BatchBlockerAnalysis {
    // Initialize all blocker types with empty arrays
    const byBlockerType: Record<BlockerType, Array<{
      candidate: Candidate;
      blocker: CandidateBlocker;
      daysInStage: number;
    }>> = {
      no_interview_scheduled: [],
      awaiting_feedback: [],
      ready_to_move: [],
      offer_pending: [],
      offer_not_sent: [],
      interview_completed_no_feedback: [],
      no_blocker: [],
    };

    for (const item of blockers) {
      const type = item.blocker.type;
      byBlockerType[type].push(item);
    }

    const summary = {
      critical: blockers.filter((b) => b.blocker.severity === "critical").length,
      warning: blockers.filter((b) => b.blocker.severity === "warning").length,
      info: blockers.filter((b) => b.blocker.severity === "info").length,
    };

    return {
      analyzed: blockers.length,
      byBlockerType,
      summary,
      urgentCandidates: blockers
        .filter((b) => b.blocker.severity === "critical")
        .map((b) => ({
          candidate: b.candidate,
          blocker: b.blocker,
          priority: "urgent" as const,
        })),
    };
  }

  describe("start", () => {
    it("should not start if disabled", () => {
      const config = { ...defaultConfig, enabled: false };
      const scheduler = new BlockerAlertScheduler(mockAshby as AshbyService, config);

      scheduler.start(mockSlackClient as WebClient);

      // Should not have scheduled anything
      vi.advanceTimersByTime(4 * 60 * 60 * 1000); // 4 hours
      expect(mockAshby.analyzeCandidateBlockers).not.toHaveBeenCalled();

      scheduler.stop();
    });

    it("should not start if channel not configured", () => {
      const config = { ...defaultConfig, channelId: "" };
      const scheduler = new BlockerAlertScheduler(mockAshby as AshbyService, config);

      scheduler.start(mockSlackClient as WebClient);

      vi.advanceTimersByTime(4 * 60 * 60 * 1000);
      expect(mockAshby.analyzeCandidateBlockers).not.toHaveBeenCalled();

      scheduler.stop();
    });
  });

  describe("checkAndAlert", () => {
    it("should post alert for warning blockers", async () => {
      const candidate = createMockCandidate({ id: "c-1", name: "John Doe" });
      const blocker: CandidateBlocker = {
        type: "no_interview_scheduled",
        severity: "warning",
        message: "No interview scheduled",
        suggestedAction: "Schedule an interview",
      };

      vi.mocked(mockAshby.analyzeCandidateBlockers!).mockResolvedValue(
        createBlockerAnalysis([{ candidate, blocker, daysInStage: 5 }])
      );

      const scheduler = new BlockerAlertScheduler(mockAshby as AshbyService, defaultConfig);
      scheduler.start(mockSlackClient as WebClient);

      await scheduler.triggerNow();

      expect(mockSlackClient.chat?.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: "C123456",
          text: expect.stringContaining("John Doe"),
        })
      );

      scheduler.stop();
    });

    it("should post alert for critical blockers", async () => {
      const candidate = createMockCandidate({ id: "c-1", name: "Jane Smith" });
      const blocker: CandidateBlocker = {
        type: "offer_pending",
        severity: "critical",
        message: "In offer stage but no offer created",
        suggestedAction: "Create an offer",
      };

      vi.mocked(mockAshby.analyzeCandidateBlockers!).mockResolvedValue(
        createBlockerAnalysis([{ candidate, blocker, daysInStage: 3 }])
      );

      const scheduler = new BlockerAlertScheduler(mockAshby as AshbyService, defaultConfig);
      scheduler.start(mockSlackClient as WebClient);

      await scheduler.triggerNow();

      expect(mockSlackClient.chat?.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining("🚨"),
        })
      );

      scheduler.stop();
    });

    it("should filter blockers by severity threshold", async () => {
      const candidate = createMockCandidate({ id: "c-1", name: "Low Priority" });
      const blocker: CandidateBlocker = {
        type: "no_interview_scheduled",
        severity: "info",
        message: "FYI: No interview scheduled",
        suggestedAction: "Consider scheduling",
      };

      vi.mocked(mockAshby.analyzeCandidateBlockers!).mockResolvedValue(
        createBlockerAnalysis([{ candidate, blocker, daysInStage: 2 }])
      );

      const scheduler = new BlockerAlertScheduler(mockAshby as AshbyService, defaultConfig);
      scheduler.start(mockSlackClient as WebClient);

      await scheduler.triggerNow();

      // Info severity should be filtered out when minSeverity is warning
      expect(mockSlackClient.chat?.postMessage).not.toHaveBeenCalled();

      scheduler.stop();
    });

    it("should not alert if no blockers found", async () => {
      vi.mocked(mockAshby.analyzeCandidateBlockers!).mockResolvedValue(
        createBlockerAnalysis([])
      );

      const scheduler = new BlockerAlertScheduler(mockAshby as AshbyService, defaultConfig);
      scheduler.start(mockSlackClient as WebClient);

      await scheduler.triggerNow();

      expect(mockSlackClient.chat?.postMessage).not.toHaveBeenCalled();

      scheduler.stop();
    });

    it("should respect cooldown period", async () => {
      const candidate = createMockCandidate({ id: "c-1", name: "John Doe" });
      const blocker: CandidateBlocker = {
        type: "no_interview_scheduled",
        severity: "warning",
        message: "No interview scheduled",
        suggestedAction: "Schedule an interview",
      };

      vi.mocked(mockAshby.analyzeCandidateBlockers!).mockResolvedValue(
        createBlockerAnalysis([{ candidate, blocker, daysInStage: 5 }])
      );

      // Don't start the scheduler - just test triggerNow directly to avoid cron interference
      const scheduler = new BlockerAlertScheduler(mockAshby as AshbyService, {
        ...defaultConfig,
        enabled: false, // Disable cron, we'll call triggerNow manually
      });
      // Initialize Slack client manually for triggerNow
      scheduler.setSlackClient(mockSlackClient as WebClient);

      // First alert
      await scheduler.triggerNow();
      expect(mockSlackClient.chat?.postMessage).toHaveBeenCalledTimes(1);

      // Immediate second check - should be on cooldown
      await scheduler.triggerNow();
      expect(mockSlackClient.chat?.postMessage).toHaveBeenCalledTimes(1);

      // After cooldown period (8 hours) - just set the time, don't advance
      vi.setSystemTime(new Date("2026-01-15T19:00:00Z")); // 9 hours later
      await scheduler.triggerNow();
      expect(mockSlackClient.chat?.postMessage).toHaveBeenCalledTimes(2);
    });

    it("should group alerts by blocker type", async () => {
      const candidate1 = createMockCandidate({ id: "c-1", name: "John" });
      const candidate2 = createMockCandidate({ id: "c-2", name: "Jane" });

      const blockers: Array<{ candidate: Candidate; blocker: CandidateBlocker; daysInStage: number }> = [
        {
          candidate: candidate1,
          blocker: {
            type: "no_interview_scheduled",
            severity: "warning",
            message: "No interview",
            suggestedAction: "Schedule",
          },
          daysInStage: 5,
        },
        {
          candidate: candidate2,
          blocker: {
            type: "no_interview_scheduled",
            severity: "warning",
            message: "No interview",
            suggestedAction: "Schedule",
          },
          daysInStage: 3,
        },
      ];

      vi.mocked(mockAshby.analyzeCandidateBlockers!).mockResolvedValue(
        createBlockerAnalysis(blockers)
      );

      const scheduler = new BlockerAlertScheduler(mockAshby as AshbyService, defaultConfig);
      scheduler.start(mockSlackClient as WebClient);

      await scheduler.triggerNow();

      expect(mockSlackClient.chat?.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining("No Interview Scheduled"),
        })
      );
      expect(mockSlackClient.chat?.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining("John"),
        })
      );
      expect(mockSlackClient.chat?.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining("Jane"),
        })
      );

      scheduler.stop();
    });

    it("should sort blockers by severity then by days", async () => {
      const candidate1 = createMockCandidate({ id: "c-1", name: "Critical5Days" });
      const candidate2 = createMockCandidate({ id: "c-2", name: "Warning10Days" });
      const candidate3 = createMockCandidate({ id: "c-3", name: "Critical10Days" });

      const blockers: Array<{ candidate: Candidate; blocker: CandidateBlocker; daysInStage: number }> = [
        {
          candidate: candidate2,
          blocker: {
            type: "awaiting_feedback",
            severity: "warning",
            message: "Waiting",
            suggestedAction: "Follow up",
          },
          daysInStage: 10,
        },
        {
          candidate: candidate1,
          blocker: {
            type: "offer_pending",
            severity: "critical",
            message: "Urgent",
            suggestedAction: "Create offer",
          },
          daysInStage: 5,
        },
        {
          candidate: candidate3,
          blocker: {
            type: "offer_pending",
            severity: "critical",
            message: "Urgent",
            suggestedAction: "Create offer",
          },
          daysInStage: 10,
        },
      ];

      vi.mocked(mockAshby.analyzeCandidateBlockers!).mockResolvedValue(
        createBlockerAnalysis(blockers)
      );

      const scheduler = new BlockerAlertScheduler(mockAshby as AshbyService, defaultConfig);
      scheduler.start(mockSlackClient as WebClient);

      await scheduler.triggerNow();

      const postMessageMock = vi.mocked(mockSlackClient.chat!.postMessage);
      const call = postMessageMock.mock.calls[0]?.[0];
      const text = (call as { text?: string })?.text ?? "";

      // Critical should come before warning, and higher days first within severity
      const critical10Pos = text.indexOf("Critical10Days");
      const critical5Pos = text.indexOf("Critical5Days");
      const warning10Pos = text.indexOf("Warning10Days");

      expect(critical10Pos).toBeLessThan(critical5Pos);
      expect(critical5Pos).toBeLessThan(warning10Pos);

      scheduler.stop();
    });

    it("should handle errors gracefully", async () => {
      vi.mocked(mockAshby.analyzeCandidateBlockers!).mockRejectedValue(new Error("API error"));

      const scheduler = new BlockerAlertScheduler(mockAshby as AshbyService, defaultConfig);
      scheduler.start(mockSlackClient as WebClient);

      await expect(scheduler.triggerNow()).rejects.toThrow("API error");

      scheduler.stop();
    });

    it("should throw if Slack client not initialized", async () => {
      const scheduler = new BlockerAlertScheduler(mockAshby as AshbyService, defaultConfig);

      await expect(scheduler.triggerNow()).rejects.toThrow("Slack client not initialized");
    });

    it("should throw if AshbyService not available", async () => {
      const scheduler = new BlockerAlertScheduler(null, defaultConfig);
      scheduler.setSlackClient(mockSlackClient as WebClient);

      await expect(scheduler.triggerNow()).rejects.toThrow("AshbyService not available");
    });
  });

  describe("isReady", () => {
    it("should return false when no dependencies set", () => {
      const scheduler = new BlockerAlertScheduler(null, defaultConfig);
      expect(scheduler.isReady()).toBe(false);
    });

    it("should return false when only Ashby set", () => {
      const scheduler = new BlockerAlertScheduler(mockAshby as AshbyService, defaultConfig);
      expect(scheduler.isReady()).toBe(false);
    });

    it("should return false when only Slack client set", () => {
      const scheduler = new BlockerAlertScheduler(null, defaultConfig);
      scheduler.setSlackClient(mockSlackClient as WebClient);
      expect(scheduler.isReady()).toBe(false);
    });

    it("should return true when both dependencies set", () => {
      const scheduler = new BlockerAlertScheduler(mockAshby as AshbyService, defaultConfig);
      scheduler.setSlackClient(mockSlackClient as WebClient);
      expect(scheduler.isReady()).toBe(true);
    });
  });

  describe("cooldown management", () => {
    it("should track separate cooldowns for different blocker types", async () => {
      const candidate = createMockCandidate({ id: "c-1", name: "John" });

      // First, alert with no_interview_scheduled
      vi.mocked(mockAshby.analyzeCandidateBlockers!).mockResolvedValue(
        createBlockerAnalysis([
          {
            candidate,
            blocker: {
              type: "no_interview_scheduled",
              severity: "warning",
              message: "No interview",
              suggestedAction: "Schedule",
            },
            daysInStage: 5,
          },
        ])
      );

      const scheduler = new BlockerAlertScheduler(mockAshby as AshbyService, defaultConfig);
      scheduler.start(mockSlackClient as WebClient);

      await scheduler.triggerNow();
      expect(mockSlackClient.chat?.postMessage).toHaveBeenCalledTimes(1);

      // Now, same candidate but different blocker type - should alert again
      vi.mocked(mockAshby.analyzeCandidateBlockers!).mockResolvedValue(
        createBlockerAnalysis([
          {
            candidate,
            blocker: {
              type: "awaiting_feedback",
              severity: "warning",
              message: "Awaiting feedback",
              suggestedAction: "Follow up",
            },
            daysInStage: 5,
          },
        ])
      );

      await scheduler.triggerNow();
      expect(mockSlackClient.chat?.postMessage).toHaveBeenCalledTimes(2);

      scheduler.stop();
    });

    it("should clean up old cooldowns after 48 hours", async () => {
      const candidate = createMockCandidate({ id: "c-1", name: "John" });
      const blocker: CandidateBlocker = {
        type: "no_interview_scheduled",
        severity: "warning",
        message: "No interview",
        suggestedAction: "Schedule",
      };

      vi.mocked(mockAshby.analyzeCandidateBlockers!).mockResolvedValue(
        createBlockerAnalysis([{ candidate, blocker, daysInStage: 5 }])
      );

      // Don't start the scheduler - test directly to avoid cron interference
      const scheduler = new BlockerAlertScheduler(mockAshby as AshbyService, {
        ...defaultConfig,
        enabled: false,
      });
      scheduler.setSlackClient(mockSlackClient as WebClient);

      await scheduler.triggerNow();
      expect(mockSlackClient.chat?.postMessage).toHaveBeenCalledTimes(1);

      // Set time 49 hours later - past cooldown cleanup time (48 hours)
      vi.setSystemTime(new Date("2026-01-17T11:00:00Z")); // 49 hours later

      // Now it should alert again since the old cooldown is cleaned up
      await scheduler.triggerNow();
      expect(mockSlackClient.chat?.postMessage).toHaveBeenCalledTimes(2);
    });
  });

  describe("stop", () => {
    it("should stop the scheduled task", () => {
      const scheduler = new BlockerAlertScheduler(mockAshby as AshbyService, defaultConfig);
      scheduler.start(mockSlackClient as WebClient);

      scheduler.stop();

      // Advance time past cron schedule
      vi.advanceTimersByTime(5 * 60 * 60 * 1000);

      // Should not have been called after stop
      expect(mockAshby.analyzeCandidateBlockers).not.toHaveBeenCalled();
    });
  });
});
