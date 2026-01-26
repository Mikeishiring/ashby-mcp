/**
 * Pipeline Alert Scheduler Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PipelineAlertScheduler } from "./pipeline-alerts.js";
import type { Config } from "../config/index.js";
import type { AshbyService } from "../ashby/service.js";
import type { WebClient } from "@slack/web-api";

// Mock node-cron
vi.mock("node-cron", () => ({
  default: {
    schedule: vi.fn(() => ({
      stop: vi.fn(),
    })),
  },
}));

const createMockConfig = (overrides?: Partial<Config["pipelineAlerts"]>): Config =>
  ({
    pipelineAlerts: {
      enabled: true,
      channelId: "C123456",
      time: "09:00",
      timezone: "America/New_York",
      thresholds: {
        stale: 3,
        needsDecision: 2,
      },
      ...overrides,
    },
  }) as Config;

const createMockAshby = (): Partial<AshbyService> => ({
  getStaleCandidates: vi.fn(),
  getCandidatesNeedingDecision: vi.fn(),
  getPipelineSummary: vi.fn(),
});

const createMockSlackClient = (): Partial<WebClient> => ({
  chat: {
    postMessage: vi.fn(),
  } as any,
});

describe("PipelineAlertScheduler", () => {
  let scheduler: PipelineAlertScheduler;
  let mockConfig: Config;
  let mockAshby: Partial<AshbyService>;
  let mockSlack: Partial<WebClient>;
  let consoleSpy: { log: ReturnType<typeof vi.spyOn>; warn: ReturnType<typeof vi.spyOn>; error: ReturnType<typeof vi.spyOn> };

  beforeEach(() => {
    vi.clearAllMocks();
    mockConfig = createMockConfig();
    mockAshby = createMockAshby();
    mockSlack = createMockSlackClient();
    consoleSpy = {
      log: vi.spyOn(console, "log").mockImplementation(() => {}),
      warn: vi.spyOn(console, "warn").mockImplementation(() => {}),
      error: vi.spyOn(console, "error").mockImplementation(() => {}),
    };
    scheduler = new PipelineAlertScheduler(mockConfig, mockAshby as AshbyService);
  });

  afterEach(() => {
    consoleSpy.log.mockRestore();
    consoleSpy.warn.mockRestore();
    consoleSpy.error.mockRestore();
  });

  describe("start", () => {
    it("should not start if pipeline alerts are disabled", async () => {
      const cron = (await import("node-cron")).default;
      mockConfig = createMockConfig({ enabled: false });
      scheduler = new PipelineAlertScheduler(mockConfig, mockAshby as AshbyService);

      scheduler.start(mockSlack as WebClient);

      expect(cron.schedule).not.toHaveBeenCalled();
      expect(consoleSpy.log).toHaveBeenCalledWith("Pipeline alerts are disabled");
    });

    it("should not start if channel is not configured", async () => {
      const cron = (await import("node-cron")).default;
      mockConfig = createMockConfig({ channelId: "" });
      scheduler = new PipelineAlertScheduler(mockConfig, mockAshby as AshbyService);

      scheduler.start(mockSlack as WebClient);

      expect(cron.schedule).not.toHaveBeenCalled();
      expect(consoleSpy.warn).toHaveBeenCalledWith(
        "Pipeline alerts channel not configured - skipping scheduler"
      );
    });

    it("should schedule cron job with correct expression", async () => {
      const cron = (await import("node-cron")).default;

      scheduler.start(mockSlack as WebClient);

      expect(cron.schedule).toHaveBeenCalledWith(
        "00 09 * * 1-5",
        expect.any(Function),
        { timezone: "America/New_York" }
      );
    });

    it("should use default time when not specified", async () => {
      const cron = (await import("node-cron")).default;
      // Omit 'time' entirely to test default behavior (don't set to undefined with exactOptionalPropertyTypes)
      mockConfig = {
        pipelineAlerts: {
          enabled: true,
          channelId: "C123456",
          timezone: "America/New_York",
          thresholds: {
            stale: 3,
            needsDecision: 2,
          },
        },
      } as Config;
      scheduler = new PipelineAlertScheduler(mockConfig, mockAshby as AshbyService);

      scheduler.start(mockSlack as WebClient);

      expect(cron.schedule).toHaveBeenCalledWith(
        "00 09 * * 1-5", // Default 09:00
        expect.any(Function),
        expect.any(Object)
      );
    });

    it("should use default timezone when not specified", async () => {
      const cron = (await import("node-cron")).default;
      // Omit 'timezone' entirely to test default behavior (don't set to undefined with exactOptionalPropertyTypes)
      mockConfig = {
        pipelineAlerts: {
          enabled: true,
          channelId: "C123456",
          time: "09:00",
          thresholds: {
            stale: 3,
            needsDecision: 2,
          },
        },
      } as Config;
      scheduler = new PipelineAlertScheduler(mockConfig, mockAshby as AshbyService);

      scheduler.start(mockSlack as WebClient);

      expect(cron.schedule).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Function),
        { timezone: "America/New_York" }
      );
    });

    it("should log scheduling information", async () => {
      scheduler.start(mockSlack as WebClient);

      expect(consoleSpy.log).toHaveBeenCalledWith(
        "Scheduling pipeline alerts for 09:00 (America/New_York)"
      );
      expect(consoleSpy.log).toHaveBeenCalledWith("Pipeline alert scheduler started");
    });
  });

  describe("stop", () => {
    it("should stop the scheduled task", async () => {
      const mockTask = { stop: vi.fn() };
      const cron = (await import("node-cron")).default;
      vi.mocked(cron.schedule).mockReturnValue(mockTask as any);

      scheduler.start(mockSlack as WebClient);
      scheduler.stop();

      expect(mockTask.stop).toHaveBeenCalled();
      expect(consoleSpy.log).toHaveBeenCalledWith("Pipeline alert scheduler stopped");
    });

    it("should do nothing if no task is running", () => {
      scheduler.stop();

      expect(consoleSpy.log).not.toHaveBeenCalledWith("Pipeline alert scheduler stopped");
    });
  });

  describe("postAlerts", () => {
    beforeEach(() => {
      scheduler.start(mockSlack as WebClient);
    });

    it("should throw if Slack client not initialized", async () => {
      const uninitializedScheduler = new PipelineAlertScheduler(
        mockConfig,
        mockAshby as AshbyService
      );

      await expect(uninitializedScheduler.postAlerts()).rejects.toThrow(
        "Slack client not initialized"
      );
    });

    it("should throw if channel not configured", async () => {
      mockConfig = createMockConfig({ channelId: "" });
      scheduler = new PipelineAlertScheduler(mockConfig, mockAshby as AshbyService);
      (scheduler as any).slackClient = mockSlack;

      await expect(scheduler.postAlerts()).rejects.toThrow(
        "Pipeline alerts channel not configured"
      );
    });

    it("should not post if no alerts to send", async () => {
      vi.mocked(mockAshby.getStaleCandidates!).mockResolvedValue([]);
      vi.mocked(mockAshby.getCandidatesNeedingDecision!).mockResolvedValue([]);
      vi.mocked(mockAshby.getPipelineSummary!).mockResolvedValue({
        totalCandidates: 10,
        byStage: [],
        byJob: [],
        staleCount: 0,
        needsDecisionCount: 0,
      });

      await scheduler.postAlerts();

      expect(mockSlack.chat?.postMessage).not.toHaveBeenCalled();
      expect(consoleSpy.log).toHaveBeenCalledWith(
        "No alerts to send - pipeline looks healthy!"
      );
    });

    it("should post stale candidates alert", async () => {
      vi.mocked(mockAshby.getStaleCandidates!).mockResolvedValue([
        {
          candidate: { name: "John Doe" },
          job: { title: "Engineer" },
          currentInterviewStage: { title: "Phone Screen" },
          daysInCurrentStage: 20,
        },
        {
          candidate: { name: "Jane Smith" },
          job: { title: "Designer" },
          currentInterviewStage: { title: "On-site" },
          daysInCurrentStage: 15,
        },
        {
          candidate: { name: "Bob Wilson" },
          job: { title: "PM" },
          currentInterviewStage: { title: "Final" },
          daysInCurrentStage: 18,
        },
      ] as any);
      vi.mocked(mockAshby.getCandidatesNeedingDecision!).mockResolvedValue([]);
      vi.mocked(mockAshby.getPipelineSummary!).mockResolvedValue({
        totalCandidates: 25,
        byStage: [],
        byJob: [],
        staleCount: 3,
        needsDecisionCount: 0,
      });

      await scheduler.postAlerts();

      expect(mockSlack.chat?.postMessage).toHaveBeenCalledWith({
        channel: "C123456",
        text: expect.stringContaining("3 stale candidates"),
        unfurl_links: false,
        unfurl_media: false,
      });
      expect(mockSlack.chat?.postMessage).toHaveBeenCalledWith({
        channel: "C123456",
        text: expect.stringContaining("John Doe"),
        unfurl_links: false,
        unfurl_media: false,
      });
    });

    it("should post needs decision alert", async () => {
      vi.mocked(mockAshby.getStaleCandidates!).mockResolvedValue([]);
      vi.mocked(mockAshby.getCandidatesNeedingDecision!).mockResolvedValue([
        {
          candidate: { name: "Alice Brown" },
          job: { title: "Manager" },
          currentInterviewStage: { title: "Decision" },
          daysInCurrentStage: 5,
        },
        {
          candidate: { name: "Charlie Green" },
          job: { title: "Lead" },
          currentInterviewStage: { title: "Decision" },
          daysInCurrentStage: 3,
        },
      ] as any);
      vi.mocked(mockAshby.getPipelineSummary!).mockResolvedValue({
        totalCandidates: 20,
        byStage: [],
        byJob: [],
        staleCount: 0,
        needsDecisionCount: 2,
      });

      await scheduler.postAlerts();

      expect(mockSlack.chat?.postMessage).toHaveBeenCalledWith({
        channel: "C123456",
        text: expect.stringContaining("2 candidates need decisions"),
        unfurl_links: false,
        unfurl_media: false,
      });
    });

    it("should post both alerts when applicable", async () => {
      vi.mocked(mockAshby.getStaleCandidates!).mockResolvedValue([
        { candidate: { name: "S1" }, job: { title: "J1" }, currentInterviewStage: { title: "St1" }, daysInCurrentStage: 15 },
        { candidate: { name: "S2" }, job: { title: "J2" }, currentInterviewStage: { title: "St2" }, daysInCurrentStage: 16 },
        { candidate: { name: "S3" }, job: { title: "J3" }, currentInterviewStage: { title: "St3" }, daysInCurrentStage: 17 },
      ] as any);
      vi.mocked(mockAshby.getCandidatesNeedingDecision!).mockResolvedValue([
        { candidate: { name: "D1" }, job: { title: "J4" }, currentInterviewStage: { title: "Dec" }, daysInCurrentStage: 4 },
        { candidate: { name: "D2" }, job: { title: "J5" }, currentInterviewStage: { title: "Dec" }, daysInCurrentStage: 5 },
      ] as any);
      vi.mocked(mockAshby.getPipelineSummary!).mockResolvedValue({
        totalCandidates: 30,
        byStage: [],
        byJob: [],
        staleCount: 3,
        needsDecisionCount: 2,
      });

      await scheduler.postAlerts();

      const callArg = vi.mocked(mockSlack.chat?.postMessage as any).mock.calls[0][0];
      expect(callArg.text).toContain("stale candidates");
      expect(callArg.text).toContain("need decisions");
    });

    it("should truncate long lists to 5 items", async () => {
      const staleCandidates = [];
      for (let i = 1; i <= 8; i++) {
        staleCandidates.push({
          candidate: { name: `Stale ${i}` },
          job: { title: `Job ${i}` },
          currentInterviewStage: { title: `Stage ${i}` },
          daysInCurrentStage: 15 + i,
        });
      }

      vi.mocked(mockAshby.getStaleCandidates!).mockResolvedValue(staleCandidates as any);
      vi.mocked(mockAshby.getCandidatesNeedingDecision!).mockResolvedValue([]);
      vi.mocked(mockAshby.getPipelineSummary!).mockResolvedValue({
        totalCandidates: 50,
        byStage: [],
        byJob: [],
        staleCount: 8,
        needsDecisionCount: 0,
      });

      await scheduler.postAlerts();

      const callArg = vi.mocked(mockSlack.chat?.postMessage as any).mock.calls[0][0];
      expect(callArg.text).toContain("...and 3 more");
    });

    it("should handle missing candidate/job/stage data", async () => {
      vi.mocked(mockAshby.getStaleCandidates!).mockResolvedValue([
        { daysInCurrentStage: 20 }, // Missing all optional fields
        { candidate: null, job: null, currentInterviewStage: null, daysInCurrentStage: 18 },
        { candidate: { name: "Has Name" }, daysInCurrentStage: 15 },
      ] as any);
      vi.mocked(mockAshby.getCandidatesNeedingDecision!).mockResolvedValue([]);
      vi.mocked(mockAshby.getPipelineSummary!).mockResolvedValue({
        totalCandidates: 30,
        byStage: [],
        byJob: [],
        staleCount: 3,
        needsDecisionCount: 0,
      });

      await scheduler.postAlerts();

      const callArg = vi.mocked(mockSlack.chat?.postMessage as any).mock.calls[0][0];
      expect(callArg.text).toContain("Unknown");
    });

    it("should log success message", async () => {
      vi.mocked(mockAshby.getStaleCandidates!).mockResolvedValue([
        { candidate: { name: "A" }, job: { title: "B" }, currentInterviewStage: { title: "C" }, daysInCurrentStage: 20 },
        { candidate: { name: "A" }, job: { title: "B" }, currentInterviewStage: { title: "C" }, daysInCurrentStage: 20 },
        { candidate: { name: "A" }, job: { title: "B" }, currentInterviewStage: { title: "C" }, daysInCurrentStage: 20 },
      ] as any);
      vi.mocked(mockAshby.getCandidatesNeedingDecision!).mockResolvedValue([]);
      vi.mocked(mockAshby.getPipelineSummary!).mockResolvedValue({
        totalCandidates: 15,
        byStage: [],
        byJob: [],
        staleCount: 3,
        needsDecisionCount: 0,
      });

      await scheduler.postAlerts();

      expect(consoleSpy.log).toHaveBeenCalledWith("Generating pipeline alerts...");
      expect(consoleSpy.log).toHaveBeenCalledWith("Pipeline alerts posted successfully");
    });

    it("should log and rethrow errors", async () => {
      const error = new Error("API error");
      vi.mocked(mockAshby.getStaleCandidates!).mockRejectedValue(error);

      await expect(scheduler.postAlerts()).rejects.toThrow("API error");
      expect(consoleSpy.error).toHaveBeenCalledWith(
        "Failed to post pipeline alerts:",
        error
      );
    });

    it("should use default thresholds when not configured", async () => {
      mockConfig = createMockConfig({ thresholds: undefined });
      scheduler = new PipelineAlertScheduler(mockConfig, mockAshby as AshbyService);
      scheduler.start(mockSlack as WebClient);

      // 2 stale (below default threshold of 3)
      vi.mocked(mockAshby.getStaleCandidates!).mockResolvedValue([
        { candidate: { name: "A" }, job: { title: "B" }, currentInterviewStage: { title: "C" }, daysInCurrentStage: 20 },
        { candidate: { name: "A" }, job: { title: "B" }, currentInterviewStage: { title: "C" }, daysInCurrentStage: 20 },
      ] as any);
      // 1 decision (below default threshold of 2)
      vi.mocked(mockAshby.getCandidatesNeedingDecision!).mockResolvedValue([
        { candidate: { name: "D" }, job: { title: "E" }, currentInterviewStage: { title: "F" }, daysInCurrentStage: 5 },
      ] as any);
      vi.mocked(mockAshby.getPipelineSummary!).mockResolvedValue({
        totalCandidates: 10,
        byStage: [],
        byJob: [],
        staleCount: 2,
        needsDecisionCount: 1,
      });

      await scheduler.postAlerts();

      // Should not post because below thresholds
      expect(mockSlack.chat?.postMessage).not.toHaveBeenCalled();
    });
  });

  describe("triggerNow", () => {
    it("should call postAlerts", async () => {
      scheduler.start(mockSlack as WebClient);
      vi.mocked(mockAshby.getStaleCandidates!).mockResolvedValue([]);
      vi.mocked(mockAshby.getCandidatesNeedingDecision!).mockResolvedValue([]);
      vi.mocked(mockAshby.getPipelineSummary!).mockResolvedValue({
        totalCandidates: 10,
        byStage: [],
        byJob: [],
        staleCount: 0,
        needsDecisionCount: 0,
      });

      await scheduler.triggerNow();

      expect(mockAshby.getStaleCandidates).toHaveBeenCalled();
      expect(mockAshby.getCandidatesNeedingDecision).toHaveBeenCalled();
      expect(mockAshby.getPipelineSummary).toHaveBeenCalled();
    });
  });

  describe("formatAlertMessage", () => {
    it("should include total active candidates count", async () => {
      scheduler.start(mockSlack as WebClient);
      vi.mocked(mockAshby.getStaleCandidates!).mockResolvedValue([
        { candidate: { name: "A" }, job: { title: "B" }, currentInterviewStage: { title: "C" }, daysInCurrentStage: 20 },
        { candidate: { name: "A" }, job: { title: "B" }, currentInterviewStage: { title: "C" }, daysInCurrentStage: 20 },
        { candidate: { name: "A" }, job: { title: "B" }, currentInterviewStage: { title: "C" }, daysInCurrentStage: 20 },
      ] as any);
      vi.mocked(mockAshby.getCandidatesNeedingDecision!).mockResolvedValue([]);
      vi.mocked(mockAshby.getPipelineSummary!).mockResolvedValue({
        totalCandidates: 42,
        byStage: [],
        byJob: [],
        staleCount: 3,
        needsDecisionCount: 0,
      });

      await scheduler.postAlerts();

      const callArg = vi.mocked(mockSlack.chat?.postMessage as any).mock.calls[0][0];
      expect(callArg.text).toContain("Total active candidates: 42");
    });

    it("should include help text", async () => {
      scheduler.start(mockSlack as WebClient);
      vi.mocked(mockAshby.getStaleCandidates!).mockResolvedValue([
        { candidate: { name: "A" }, job: { title: "B" }, currentInterviewStage: { title: "C" }, daysInCurrentStage: 20 },
        { candidate: { name: "A" }, job: { title: "B" }, currentInterviewStage: { title: "C" }, daysInCurrentStage: 20 },
        { candidate: { name: "A" }, job: { title: "B" }, currentInterviewStage: { title: "C" }, daysInCurrentStage: 20 },
      ] as any);
      vi.mocked(mockAshby.getCandidatesNeedingDecision!).mockResolvedValue([]);
      vi.mocked(mockAshby.getPipelineSummary!).mockResolvedValue({
        totalCandidates: 20,
        byStage: [],
        byJob: [],
        staleCount: 3,
        needsDecisionCount: 0,
      });

      await scheduler.postAlerts();

      const callArg = vi.mocked(mockSlack.chat?.postMessage as any).mock.calls[0][0];
      expect(callArg.text).toContain("Reply to this thread");
    });
  });

  describe("cron callback", () => {
    it("should call postAlerts when cron triggers", async () => {
      const cron = (await import("node-cron")).default;
      let cronCallback: () => void;

      vi.mocked(cron.schedule).mockImplementation((_, callback) => {
        cronCallback = callback as () => void;
        return { stop: vi.fn() } as any;
      });

      vi.mocked(mockAshby.getStaleCandidates!).mockResolvedValue([]);
      vi.mocked(mockAshby.getCandidatesNeedingDecision!).mockResolvedValue([]);
      vi.mocked(mockAshby.getPipelineSummary!).mockResolvedValue({
        totalCandidates: 10,
        byStage: [],
        byJob: [],
        staleCount: 0,
        needsDecisionCount: 0,
      });

      scheduler.start(mockSlack as WebClient);

      await cronCallback!();

      expect(mockAshby.getStaleCandidates).toHaveBeenCalled();
    });
  });
});
