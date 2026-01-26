/**
 * Daily Summary Scheduler Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DailySummaryScheduler } from "./daily-summary.js";
import type { Config } from "../config/index.js";
import type { AshbyService } from "../ashby/service.js";
import type { WebClient } from "@slack/web-api";
import type { DailySummaryData } from "../types/index.js";

// Mock node-cron
vi.mock("node-cron", () => ({
  default: {
    schedule: vi.fn(() => ({
      stop: vi.fn(),
    })),
  },
}));

const createMockConfig = (overrides?: Partial<Config["dailySummary"]>): Config =>
  ({
    dailySummary: {
      enabled: true,
      channelId: "C123456",
      time: "09:00",
      timezone: "America/New_York",
      ...overrides,
    },
  }) as Config;

const createMockAshby = (): Partial<AshbyService> => ({
  getDailySummaryData: vi.fn(),
});

const createMockSlackClient = (): Partial<WebClient> => ({
  chat: {
    postMessage: vi.fn(),
  } as any,
});

const createMockDailySummaryData = (overrides?: Partial<DailySummaryData>): DailySummaryData => ({
  staleCandidate: [],
  needsDecision: [],
  stats: {
    totalActive: 0,
    openRoles: 0,
    newApplications: 0,
  },
  ...overrides,
});

describe("DailySummaryScheduler", () => {
  let scheduler: DailySummaryScheduler;
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
    scheduler = new DailySummaryScheduler(mockConfig, mockAshby as AshbyService);
  });

  afterEach(() => {
    consoleSpy.log.mockRestore();
    consoleSpy.warn.mockRestore();
    consoleSpy.error.mockRestore();
  });

  describe("start", () => {
    it("should not start if daily summary is disabled", async () => {
      const cron = (await import("node-cron")).default;
      mockConfig = createMockConfig({ enabled: false });
      scheduler = new DailySummaryScheduler(mockConfig, mockAshby as AshbyService);

      scheduler.start(mockSlack as WebClient);

      expect(cron.schedule).not.toHaveBeenCalled();
      expect(consoleSpy.log).toHaveBeenCalledWith("Daily summary is disabled");
    });

    it("should not start if channel is not configured", async () => {
      const cron = (await import("node-cron")).default;
      mockConfig = createMockConfig({ channelId: "" });
      scheduler = new DailySummaryScheduler(mockConfig, mockAshby as AshbyService);

      scheduler.start(mockSlack as WebClient);

      expect(cron.schedule).not.toHaveBeenCalled();
      expect(consoleSpy.warn).toHaveBeenCalledWith(
        "Daily summary channel not configured - skipping scheduler"
      );
    });

    it("should schedule cron job with correct expression", async () => {
      const cron = (await import("node-cron")).default;

      scheduler.start(mockSlack as WebClient);

      expect(cron.schedule).toHaveBeenCalledWith(
        "00 09 * * 1-5", // Minutes hours * * weekdays
        expect.any(Function),
        { timezone: "America/New_York" }
      );
    });

    it("should parse different time formats correctly", async () => {
      const cron = (await import("node-cron")).default;
      mockConfig = createMockConfig({ time: "14:30" });
      scheduler = new DailySummaryScheduler(mockConfig, mockAshby as AshbyService);

      scheduler.start(mockSlack as WebClient);

      expect(cron.schedule).toHaveBeenCalledWith(
        "30 14 * * 1-5",
        expect.any(Function),
        expect.any(Object)
      );
    });

    it("should log scheduling information", async () => {
      scheduler.start(mockSlack as WebClient);

      expect(consoleSpy.log).toHaveBeenCalledWith(
        "Scheduling daily summary for 09:00 (America/New_York)"
      );
      expect(consoleSpy.log).toHaveBeenCalledWith("Daily summary scheduler started");
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
      expect(consoleSpy.log).toHaveBeenCalledWith("Daily summary scheduler stopped");
    });

    it("should do nothing if no task is running", () => {
      scheduler.stop();

      expect(consoleSpy.log).not.toHaveBeenCalledWith("Daily summary scheduler stopped");
    });

    it("should clear task reference after stopping", async () => {
      const mockTask = { stop: vi.fn() };
      const cron = (await import("node-cron")).default;
      vi.mocked(cron.schedule).mockReturnValue(mockTask as any);

      scheduler.start(mockSlack as WebClient);
      scheduler.stop();
      scheduler.stop(); // Second stop should do nothing

      expect(mockTask.stop).toHaveBeenCalledTimes(1);
    });
  });

  describe("postSummary", () => {
    beforeEach(() => {
      scheduler.start(mockSlack as WebClient);
    });

    it("should throw if Slack client not initialized", async () => {
      const uninitializedScheduler = new DailySummaryScheduler(
        mockConfig,
        mockAshby as AshbyService
      );

      await expect(uninitializedScheduler.postSummary()).rejects.toThrow(
        "Slack client not initialized"
      );
    });

    it("should throw if channel not configured", async () => {
      mockConfig = createMockConfig({ channelId: "" });
      scheduler = new DailySummaryScheduler(mockConfig, mockAshby as AshbyService);
      // Manually set slack client to bypass start() checks
      (scheduler as any).slackClient = mockSlack;

      await expect(scheduler.postSummary()).rejects.toThrow(
        "Daily summary channel not configured"
      );
    });

    it("should fetch data and post formatted message", async () => {
      vi.mocked(mockAshby.getDailySummaryData!).mockResolvedValue(
        createMockDailySummaryData({
          stats: { totalActive: 25, openRoles: 4, newApplications: 3 },
        })
      );

      await scheduler.postSummary();

      expect(mockAshby.getDailySummaryData).toHaveBeenCalled();
      expect(mockSlack.chat?.postMessage).toHaveBeenCalledWith({
        channel: "C123456",
        text: expect.stringContaining("Pipeline Summary"),
        unfurl_links: false,
        unfurl_media: false,
      });
    });

    it("should log success message", async () => {
      vi.mocked(mockAshby.getDailySummaryData!).mockResolvedValue(
        createMockDailySummaryData()
      );

      await scheduler.postSummary();

      expect(consoleSpy.log).toHaveBeenCalledWith("Generating daily summary...");
      expect(consoleSpy.log).toHaveBeenCalledWith("Daily summary posted successfully");
    });

    it("should log and rethrow errors", async () => {
      const error = new Error("API error");
      vi.mocked(mockAshby.getDailySummaryData!).mockRejectedValue(error);

      await expect(scheduler.postSummary()).rejects.toThrow("API error");
      expect(consoleSpy.error).toHaveBeenCalledWith(
        "Failed to post daily summary:",
        error
      );
    });
  });

  describe("triggerNow", () => {
    it("should call postSummary", async () => {
      scheduler.start(mockSlack as WebClient);
      vi.mocked(mockAshby.getDailySummaryData!).mockResolvedValue(
        createMockDailySummaryData()
      );

      await scheduler.triggerNow();

      expect(mockAshby.getDailySummaryData).toHaveBeenCalled();
      expect(mockSlack.chat?.postMessage).toHaveBeenCalled();
    });
  });

  describe("cron callback", () => {
    it("should call postSummary when cron triggers", async () => {
      const cron = (await import("node-cron")).default;
      let cronCallback: () => void;

      vi.mocked(cron.schedule).mockImplementation((_, callback) => {
        cronCallback = callback as () => void;
        return { stop: vi.fn() } as any;
      });

      vi.mocked(mockAshby.getDailySummaryData!).mockResolvedValue(
        createMockDailySummaryData()
      );

      scheduler.start(mockSlack as WebClient);

      // Simulate cron trigger
      await cronCallback!();

      expect(mockAshby.getDailySummaryData).toHaveBeenCalled();
    });

    it("should catch and log errors from postSummary", async () => {
      const cron = (await import("node-cron")).default;
      let cronCallback: () => void;

      vi.mocked(cron.schedule).mockImplementation((_, callback) => {
        cronCallback = callback as () => void;
        return { stop: vi.fn() } as any;
      });

      vi.mocked(mockAshby.getDailySummaryData!).mockRejectedValue(
        new Error("Cron error")
      );

      scheduler.start(mockSlack as WebClient);

      // Simulate cron trigger - should not throw
      await cronCallback!();

      expect(consoleSpy.error).toHaveBeenCalledWith(
        "Failed to post daily summary:",
        expect.any(Error)
      );
    });
  });
});
