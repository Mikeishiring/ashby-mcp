/**
 * Usage Tracker Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { UsageTracker } from "./usage-tracker.js";

describe("UsageTracker", () => {
  let tracker: UsageTracker;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-27T10:00:00Z"));
    tracker = new UsageTracker();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("message tracking", () => {
    it("should track total message count", () => {
      tracker.recordMessage("user-1");
      tracker.recordMessage("user-1");
      tracker.recordMessage("user-2");

      const stats = tracker.getStats();
      expect(stats.totalMessages).toBe(3);
    });

    it("should track unique users", () => {
      tracker.recordMessage("user-1");
      tracker.recordMessage("user-1");
      tracker.recordMessage("user-2");
      tracker.recordMessage("user-3");

      const stats = tracker.getStats();
      expect(stats.uniqueUsers).toBe(3);
    });

    it("should track user message counts", () => {
      tracker.recordMessage("user-1");
      tracker.recordMessage("user-1");
      tracker.recordMessage("user-1");
      tracker.recordMessage("user-2");

      const stats = tracker.getStats();
      const user1 = stats.activeUsers.find((u) => u.userId === "user-1");
      const user2 = stats.activeUsers.find((u) => u.userId === "user-2");

      expect(user1?.messageCount).toBe(3);
      expect(user2?.messageCount).toBe(1);
    });

    it("should track last active time for users", () => {
      tracker.recordMessage("user-1");

      vi.advanceTimersByTime(60 * 1000); // 1 minute
      tracker.recordMessage("user-1");

      const stats = tracker.getStats();
      const user1 = stats.activeUsers.find((u) => u.userId === "user-1");
      expect(user1?.lastActive.toISOString()).toBe("2026-01-27T10:01:00.000Z");
    });
  });

  describe("tool call tracking", () => {
    it("should track tool call counts", () => {
      tracker.recordMessage("user-1");
      tracker.recordToolCall("search_candidates", "user-1", { success: true, durationMs: 100 });
      tracker.recordToolCall("search_candidates", "user-1", { success: true, durationMs: 150 });
      tracker.recordToolCall("get_candidate", "user-1", { success: true, durationMs: 80 });

      const stats = tracker.getStats();
      expect(stats.totalToolCalls).toBe(3);

      const searchTool = stats.topTools.find((t) => t.name === "search_candidates");
      expect(searchTool?.count).toBe(2);
    });

    it("should track success and error rates", () => {
      tracker.recordMessage("user-1");
      tracker.recordToolCall("risky_tool", "user-1", { success: true, durationMs: 100 });
      tracker.recordToolCall("risky_tool", "user-1", { success: true, durationMs: 100 });
      tracker.recordToolCall("risky_tool", "user-1", { success: false, durationMs: 50 });
      tracker.recordToolCall("risky_tool", "user-1", { success: false, durationMs: 50 });

      const stats = tracker.getStats();
      const tool = stats.topTools.find((t) => t.name === "risky_tool");
      expect(tool?.count).toBe(4);
      expect(tool?.successRate).toBe(50);
    });

    it("should track which tools each user has used", () => {
      tracker.recordMessage("user-1");
      tracker.recordToolCall("search_candidates", "user-1", { success: true, durationMs: 100 });
      tracker.recordToolCall("get_candidate", "user-1", { success: true, durationMs: 100 });

      // Internal check - tools used is tracked per user
      const stats = tracker.getStats();
      expect(stats.topTools.length).toBe(2);
    });

    it("should sort tools by usage count", () => {
      tracker.recordMessage("user-1");
      tracker.recordToolCall("tool_a", "user-1", { success: true, durationMs: 100 });
      tracker.recordToolCall("tool_b", "user-1", { success: true, durationMs: 100 });
      tracker.recordToolCall("tool_b", "user-1", { success: true, durationMs: 100 });
      tracker.recordToolCall("tool_c", "user-1", { success: true, durationMs: 100 });
      tracker.recordToolCall("tool_c", "user-1", { success: true, durationMs: 100 });
      tracker.recordToolCall("tool_c", "user-1", { success: true, durationMs: 100 });

      const stats = tracker.getStats();
      expect(stats.topTools[0]?.name).toBe("tool_c");
      expect(stats.topTools[1]?.name).toBe("tool_b");
      expect(stats.topTools[2]?.name).toBe("tool_a");
    });
  });

  describe("response time tracking", () => {
    it("should track average response time", () => {
      tracker.recordMessage("user-1");
      tracker.recordResponseTime(100);
      tracker.recordMessage("user-1");
      tracker.recordResponseTime(200);
      tracker.recordMessage("user-1");
      tracker.recordResponseTime(300);

      const stats = tracker.getStats();
      expect(stats.avgResponseTimeMs).toBe(200);
    });

    it("should limit response time samples", () => {
      const smallTracker = new UsageTracker({ maxResponseTimeSamples: 3 });

      for (let i = 0; i < 10; i++) {
        smallTracker.recordMessage("user-1");
        smallTracker.recordResponseTime(100 * (i + 1));
      }

      // Should only keep last 3: 800, 900, 1000
      const stats = smallTracker.getStats();
      expect(stats.avgResponseTimeMs).toBe(900);
    });
  });

  describe("error tracking", () => {
    it("should track total errors", () => {
      tracker.recordMessage("user-1");
      tracker.recordToolCall("tool", "user-1", { success: false, durationMs: 50 });
      tracker.recordError();

      const stats = tracker.getStats();
      expect(stats.totalErrors).toBe(2);
    });
  });

  describe("daily stats", () => {
    it("should track stats per day", () => {
      tracker.recordMessage("user-1");
      tracker.recordToolCall("tool", "user-1", { success: true, durationMs: 100 });

      // Advance to next day
      vi.advanceTimersByTime(24 * 60 * 60 * 1000);

      tracker.recordMessage("user-1");
      tracker.recordMessage("user-2");

      const stats = tracker.getStats();
      expect(stats.dailyStats.length).toBe(2);
      expect(stats.dailyStats[0]?.messageCount).toBe(1);
      expect(stats.dailyStats[1]?.messageCount).toBe(2);
    });

    it("should track unique users per day", () => {
      tracker.recordMessage("user-1");
      tracker.recordMessage("user-2");

      const stats = tracker.getStats();
      expect(stats.dailyStats[0]?.uniqueUsers).toBe(2);
    });

    it("should cleanup old daily stats", () => {
      const smallTracker = new UsageTracker({ maxDailyStatsHistory: 3 });

      // Record on 5 different days
      for (let i = 0; i < 5; i++) {
        smallTracker.recordMessage("user-1");
        vi.advanceTimersByTime(24 * 60 * 60 * 1000);
      }

      const stats = smallTracker.getStats();
      expect(stats.dailyStats.length).toBe(3);
    });
  });

  describe("summary", () => {
    it("should generate a summary string", () => {
      tracker.recordMessage("user-1");
      tracker.recordToolCall("search_candidates", "user-1", { success: true, durationMs: 100 });
      tracker.recordResponseTime(100);

      const summary = tracker.getSummary();

      expect(summary).toContain("Bot Statistics");
      expect(summary).toContain("Messages: 1");
      expect(summary).toContain("Tool Calls: 1");
      expect(summary).toContain("Unique Users: 1");
      expect(summary).toContain("search_candidates");
    });

    it("should show uptime in seconds for short uptime", () => {
      vi.advanceTimersByTime(30 * 1000);
      const summary = tracker.getSummary();
      expect(summary).toContain("30s");
    });

    it("should show uptime in minutes for medium uptime", () => {
      vi.advanceTimersByTime(5 * 60 * 1000);
      const summary = tracker.getSummary();
      expect(summary).toContain("5m 0s");
    });

    it("should show uptime in hours for longer uptime", () => {
      vi.advanceTimersByTime(3 * 60 * 60 * 1000);
      const summary = tracker.getSummary();
      expect(summary).toContain("3h 0m");
    });

    it("should show uptime in days for very long uptime", () => {
      vi.advanceTimersByTime(2 * 24 * 60 * 60 * 1000);
      const summary = tracker.getSummary();
      expect(summary).toContain("2d 0h");
    });
  });

  describe("reset", () => {
    it("should reset all statistics", () => {
      tracker.recordMessage("user-1");
      tracker.recordToolCall("tool", "user-1", { success: true, durationMs: 100 });
      tracker.recordResponseTime(100);
      tracker.recordError();

      tracker.reset();

      const stats = tracker.getStats();
      expect(stats.totalMessages).toBe(0);
      expect(stats.totalToolCalls).toBe(0);
      expect(stats.totalErrors).toBe(0);
      expect(stats.uniqueUsers).toBe(0);
      expect(stats.topTools.length).toBe(0);
      expect(stats.activeUsers.length).toBe(0);
    });
  });

  describe("active users sorting", () => {
    it("should sort users by message count descending", () => {
      tracker.recordMessage("user-a");
      tracker.recordMessage("user-b");
      tracker.recordMessage("user-b");
      tracker.recordMessage("user-c");
      tracker.recordMessage("user-c");
      tracker.recordMessage("user-c");

      const stats = tracker.getStats();
      expect(stats.activeUsers[0]?.userId).toBe("user-c");
      expect(stats.activeUsers[1]?.userId).toBe("user-b");
      expect(stats.activeUsers[2]?.userId).toBe("user-a");
    });

    it("should limit active users to top 10", () => {
      for (let i = 0; i < 15; i++) {
        tracker.recordMessage(`user-${i}`);
      }

      const stats = tracker.getStats();
      expect(stats.activeUsers.length).toBe(10);
    });
  });

  describe("started at", () => {
    it("should record the start time", () => {
      const stats = tracker.getStats();
      expect(stats.startedAt.toISOString()).toBe("2026-01-27T10:00:00.000Z");
    });
  });
});
