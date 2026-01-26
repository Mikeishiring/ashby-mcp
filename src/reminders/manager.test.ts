/**
 * Reminder Manager Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ReminderManager } from "./manager.js";
import type { AshbyService } from "../ashby/service.js";
import type { WebClient } from "@slack/web-api";

const createMockAshbyService = (): Partial<AshbyService> => ({
  getCandidateFullContext: vi.fn(),
});

const createMockSlackClient = (): Partial<WebClient> => ({
  chat: {
    scheduleMessage: vi.fn(),
  } as any,
});

describe("ReminderManager", () => {
  let manager: ReminderManager;
  let mockAshby: Partial<AshbyService>;
  let mockSlack: Partial<WebClient>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-24T10:00:00Z"));
    mockAshby = createMockAshbyService();
    mockSlack = createMockSlackClient();
    manager = new ReminderManager(mockAshby as AshbyService);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("initialize", () => {
    it("should accept and store Slack client", () => {
      manager.initialize(mockSlack as WebClient);
      // The client should be stored internally (no public getter, so we test via scheduleReminder)
    });
  });

  describe("scheduleReminder", () => {
    beforeEach(() => {
      manager.initialize(mockSlack as WebClient);
      vi.mocked(mockAshby.getCandidateFullContext!).mockResolvedValue({
        candidate: {
          id: "c-1",
          name: "John Doe",
          profileUrl: "https://ashby.com/candidate/c-1",
        },
        applications: [
          {
            id: "app-1",
            status: "Active",
            job: { id: "job-1", title: "Engineer" },
            currentInterviewStage: { id: "s-1", title: "Phone Screen" },
            daysInCurrentStage: 5,
          },
        ],
        notes: [],
      } as any);
      vi.mocked(mockSlack.chat?.scheduleMessage as any).mockResolvedValue({
        scheduled_message_id: "msg-123",
      });
    });

    it("should throw if Slack client not initialized", async () => {
      const uninitializedManager = new ReminderManager(mockAshby as AshbyService);

      await expect(
        uninitializedManager.scheduleReminder({
          userId: "user-1",
          candidateId: "c-1",
          remindIn: "3 days",
        })
      ).rejects.toThrow("Slack client not initialized");
    });

    it("should parse and schedule reminder for days", async () => {
      const result = await manager.scheduleReminder({
        userId: "user-1",
        candidateId: "c-1",
        remindIn: "3 days",
      });

      expect(result.success).toBe(true);
      expect(result.scheduledTime.getTime()).toBe(
        new Date("2026-01-27T10:00:00Z").getTime()
      );
      expect(mockSlack.chat?.scheduleMessage).toHaveBeenCalled();
    });

    it("should parse and schedule reminder for weeks", async () => {
      const result = await manager.scheduleReminder({
        userId: "user-1",
        candidateId: "c-1",
        remindIn: "2 weeks",
      });

      expect(result.success).toBe(true);
      expect(result.scheduledTime.getTime()).toBe(
        new Date("2026-02-07T10:00:00Z").getTime()
      );
    });

    it("should parse and schedule reminder for hours", async () => {
      const result = await manager.scheduleReminder({
        userId: "user-1",
        candidateId: "c-1",
        remindIn: "5 hours",
      });

      expect(result.success).toBe(true);
      expect(result.scheduledTime.getTime()).toBe(
        new Date("2026-01-24T15:00:00Z").getTime()
      );
    });

    it("should parse and schedule reminder for minutes", async () => {
      const result = await manager.scheduleReminder({
        userId: "user-1",
        candidateId: "c-1",
        remindIn: "30 minutes",
      });

      expect(result.success).toBe(true);
      expect(result.scheduledTime.getTime()).toBe(
        new Date("2026-01-24T10:30:00Z").getTime()
      );
    });

    it("should parse tomorrow and set to 9 AM", async () => {
      const result = await manager.scheduleReminder({
        userId: "user-1",
        candidateId: "c-1",
        remindIn: "tomorrow",
      });

      expect(result.success).toBe(true);
      expect(result.scheduledTime.getDate()).toBe(25);
      expect(result.scheduledTime.getHours()).toBe(9);
    });

    it("should parse next week", async () => {
      const result = await manager.scheduleReminder({
        userId: "user-1",
        candidateId: "c-1",
        remindIn: "next week",
      });

      expect(result.success).toBe(true);
      expect(result.scheduledTime.getTime()).toBe(
        new Date("2026-01-31T10:00:00Z").getTime()
      );
    });

    it("should parse 'in X days' format", async () => {
      const result = await manager.scheduleReminder({
        userId: "user-1",
        candidateId: "c-1",
        remindIn: "in 5 days",
      });

      expect(result.success).toBe(true);
      expect(result.scheduledTime.getTime()).toBe(
        new Date("2026-01-29T10:00:00Z").getTime()
      );
    });

    it("should throw for invalid time format", async () => {
      await expect(
        manager.scheduleReminder({
          userId: "user-1",
          candidateId: "c-1",
          remindIn: "invalid format",
        })
      ).rejects.toThrow("Could not parse reminder time");
    });

    it("should throw if scheduled time is less than 1 minute in future", async () => {
      await expect(
        manager.scheduleReminder({
          userId: "user-1",
          candidateId: "c-1",
          remindIn: "30 seconds",
        })
      ).rejects.toThrow("Could not parse reminder time");
    });

    it("should include note in reminder message", async () => {
      await manager.scheduleReminder({
        userId: "user-1",
        candidateId: "c-1",
        remindIn: "3 days",
        note: "Follow up on references",
      });

      const call = vi.mocked(mockSlack.chat?.scheduleMessage as any).mock.calls[0];
      expect(call[0].text).toContain("Follow up on references");
    });

    it("should include candidate context in message", async () => {
      await manager.scheduleReminder({
        userId: "user-1",
        candidateId: "c-1",
        remindIn: "3 days",
      });

      const call = vi.mocked(mockSlack.chat?.scheduleMessage as any).mock.calls[0];
      expect(call[0].text).toContain("John Doe");
      expect(call[0].text).toContain("Engineer");
      expect(call[0].text).toContain("Phone Screen");
    });

    it("should return human-readable scheduled time message", async () => {
      const result = await manager.scheduleReminder({
        userId: "user-1",
        candidateId: "c-1",
        remindIn: "3 days",
      });

      expect(result.message).toContain("in 3 days");
    });

    it("should handle Slack API errors", async () => {
      vi.mocked(mockSlack.chat?.scheduleMessage as any).mockRejectedValue(
        new Error("Slack API error")
      );

      await expect(
        manager.scheduleReminder({
          userId: "user-1",
          candidateId: "c-1",
          remindIn: "3 days",
        })
      ).rejects.toThrow("Failed to schedule reminder");
    });

    it("should DM the user", async () => {
      await manager.scheduleReminder({
        userId: "user-123",
        candidateId: "c-1",
        remindIn: "1 day",
      });

      const call = vi.mocked(mockSlack.chat?.scheduleMessage as any).mock.calls[0];
      expect(call[0].channel).toBe("user-123");
    });

    it("should send correct post_at timestamp", async () => {
      await manager.scheduleReminder({
        userId: "user-1",
        candidateId: "c-1",
        remindIn: "1 day",
      });

      const call = vi.mocked(mockSlack.chat?.scheduleMessage as any).mock.calls[0];
      const expectedTimestamp = Math.floor(
        new Date("2026-01-25T10:00:00Z").getTime() / 1000
      );
      expect(call[0].post_at).toBe(expectedTimestamp);
    });
  });

  describe("parseRemindIn edge cases", () => {
    beforeEach(() => {
      manager.initialize(mockSlack as WebClient);
      vi.mocked(mockAshby.getCandidateFullContext!).mockResolvedValue({
        candidate: { id: "c-1", name: "Test", profileUrl: "https://test.com" },
        applications: [],
        notes: [],
      } as any);
      vi.mocked(mockSlack.chat?.scheduleMessage as any).mockResolvedValue({
        scheduled_message_id: "msg-123",
      });
    });

    it("should handle singular units (1 day)", async () => {
      const result = await manager.scheduleReminder({
        userId: "user-1",
        candidateId: "c-1",
        remindIn: "1 day",
      });

      expect(result.success).toBe(true);
    });

    it("should handle singular week", async () => {
      const result = await manager.scheduleReminder({
        userId: "user-1",
        candidateId: "c-1",
        remindIn: "1 week",
      });

      expect(result.success).toBe(true);
    });

    it("should handle singular hour", async () => {
      const result = await manager.scheduleReminder({
        userId: "user-1",
        candidateId: "c-1",
        remindIn: "1 hour",
      });

      expect(result.success).toBe(true);
    });

    it("should handle mins abbreviation", async () => {
      const result = await manager.scheduleReminder({
        userId: "user-1",
        candidateId: "c-1",
        remindIn: "30 mins",
      });

      expect(result.success).toBe(true);
    });

    it("should handle min abbreviation", async () => {
      const result = await manager.scheduleReminder({
        userId: "user-1",
        candidateId: "c-1",
        remindIn: "5 min",
      });

      expect(result.success).toBe(true);
    });

    it("should handle case insensitivity", async () => {
      const result = await manager.scheduleReminder({
        userId: "user-1",
        candidateId: "c-1",
        remindIn: "TOMORROW",
      });

      expect(result.success).toBe(true);
    });

    it("should trim whitespace", async () => {
      const result = await manager.scheduleReminder({
        userId: "user-1",
        candidateId: "c-1",
        remindIn: "  3 days  ",
      });

      expect(result.success).toBe(true);
    });
  });

  describe("formatRelativeTime", () => {
    beforeEach(() => {
      manager.initialize(mockSlack as WebClient);
      vi.mocked(mockAshby.getCandidateFullContext!).mockResolvedValue({
        candidate: { id: "c-1", name: "Test", profileUrl: "https://test.com" },
        applications: [],
        notes: [],
      } as any);
      vi.mocked(mockSlack.chat?.scheduleMessage as any).mockResolvedValue({
        scheduled_message_id: "msg-123",
      });
    });

    it("should return 'tomorrow' for 1 day", async () => {
      const result = await manager.scheduleReminder({
        userId: "user-1",
        candidateId: "c-1",
        remindIn: "1 day",
      });

      expect(result.message).toBe("Reminder set for tomorrow");
    });

    it("should return 'in X days' for multiple days", async () => {
      const result = await manager.scheduleReminder({
        userId: "user-1",
        candidateId: "c-1",
        remindIn: "5 days",
      });

      expect(result.message).toBe("Reminder set for in 5 days");
    });

    it("should return 'in 1 hour' for 1 hour", async () => {
      const result = await manager.scheduleReminder({
        userId: "user-1",
        candidateId: "c-1",
        remindIn: "1 hour",
      });

      expect(result.message).toBe("Reminder set for in 1 hour");
    });

    it("should return 'in X hours' for multiple hours", async () => {
      const result = await manager.scheduleReminder({
        userId: "user-1",
        candidateId: "c-1",
        remindIn: "3 hours",
      });

      expect(result.message).toBe("Reminder set for in 3 hours");
    });
  });
});
