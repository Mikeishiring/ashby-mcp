/**
 * Confirmation Manager Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ConfirmationManager } from "./confirmations.js";

describe("ConfirmationManager", () => {
  let manager: ConfirmationManager;

  beforeEach(() => {
    vi.useFakeTimers();
    manager = new ConfirmationManager(300000); // 5 minute timeout
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("create", () => {
    it("should create a pending confirmation", () => {
      const confirmation = manager.create({
        type: "move_stage",
        description: "Move candidate to Onsite",
        candidateIds: ["c-1"],
        payload: { stageId: "stage-1" },
        channelId: "channel-1",
        messageTs: "1234567890.123456",
        userId: "user-1",
      });

      expect(confirmation.id).toMatch(/^conf_/);
      expect(confirmation.type).toBe("move_stage");
      expect(confirmation.description).toBe("Move candidate to Onsite");
      expect(confirmation.candidateIds).toEqual(["c-1"]);
      expect(confirmation.channelId).toBe("channel-1");
      expect(confirmation.messageTs).toBe("1234567890.123456");
      expect(confirmation.userId).toBe("user-1");
      expect(confirmation.createdAt).toBeInstanceOf(Date);
      expect(confirmation.expiresAt).toBeInstanceOf(Date);
    });

    it("should set expiration based on timeout", () => {
      const now = new Date();
      vi.setSystemTime(now);

      const confirmation = manager.create({
        type: "add_note",
        description: "Add note",
        candidateIds: ["c-1"],
        payload: { content: "Test note" },
        channelId: "channel-1",
        messageTs: "1234567890.123456",
        userId: "user-1",
      });

      const expectedExpiry = new Date(now.getTime() + 300000);
      expect(confirmation.expiresAt.getTime()).toBe(expectedExpiry.getTime());
    });

    it("should generate unique IDs", () => {
      const conf1 = manager.create({
        type: "move_stage",
        description: "Test 1",
        candidateIds: ["c-1"],
        payload: {},
        channelId: "ch-1",
        messageTs: "ts-1",
        userId: "u-1",
      });

      const conf2 = manager.create({
        type: "move_stage",
        description: "Test 2",
        candidateIds: ["c-2"],
        payload: {},
        channelId: "ch-1",
        messageTs: "ts-2",
        userId: "u-1",
      });

      expect(conf1.id).not.toBe(conf2.id);
    });
  });

  describe("findByMessageTs", () => {
    it("should find confirmation by channel and message timestamp", () => {
      const confirmation = manager.create({
        type: "move_stage",
        description: "Test",
        candidateIds: ["c-1"],
        payload: {},
        channelId: "channel-1",
        messageTs: "1234567890.123456",
        userId: "user-1",
      });

      const found = manager.findByMessageTs("channel-1", "1234567890.123456");

      expect(found).not.toBeNull();
      expect(found?.id).toBe(confirmation.id);
    });

    it("should return null for non-existent message", () => {
      const found = manager.findByMessageTs("channel-1", "nonexistent");

      expect(found).toBeNull();
    });

    it("should return null for wrong channel", () => {
      manager.create({
        type: "move_stage",
        description: "Test",
        candidateIds: ["c-1"],
        payload: {},
        channelId: "channel-1",
        messageTs: "1234567890.123456",
        userId: "user-1",
      });

      const found = manager.findByMessageTs("channel-2", "1234567890.123456");

      expect(found).toBeNull();
    });
  });

  describe("get", () => {
    it("should get confirmation by ID", () => {
      const confirmation = manager.create({
        type: "move_stage",
        description: "Test",
        candidateIds: ["c-1"],
        payload: {},
        channelId: "channel-1",
        messageTs: "ts-1",
        userId: "user-1",
      });

      const found = manager.get(confirmation.id);

      expect(found).not.toBeNull();
      expect(found?.id).toBe(confirmation.id);
    });

    it("should return null for non-existent ID", () => {
      const found = manager.get("nonexistent-id");

      expect(found).toBeNull();
    });
  });

  describe("complete", () => {
    it("should complete and remove confirmation", () => {
      const confirmation = manager.create({
        type: "move_stage",
        description: "Test",
        candidateIds: ["c-1"],
        payload: {},
        channelId: "channel-1",
        messageTs: "ts-1",
        userId: "user-1",
      });

      const completed = manager.complete(confirmation.id);

      expect(completed).not.toBeNull();
      expect(completed?.id).toBe(confirmation.id);

      // Should no longer be retrievable
      expect(manager.get(confirmation.id)).toBeNull();
    });

    it("should return null when completing non-existent ID", () => {
      const completed = manager.complete("nonexistent-id");

      expect(completed).toBeNull();
    });
  });

  describe("cancel", () => {
    it("should cancel and remove confirmation", () => {
      const confirmation = manager.create({
        type: "move_stage",
        description: "Test",
        candidateIds: ["c-1"],
        payload: {},
        channelId: "channel-1",
        messageTs: "ts-1",
        userId: "user-1",
      });

      const result = manager.cancel(confirmation.id);

      expect(result).toBe(true);
      expect(manager.get(confirmation.id)).toBeNull();
    });

    it("should return false when canceling non-existent ID", () => {
      const result = manager.cancel("nonexistent-id");

      expect(result).toBe(false);
    });
  });

  describe("isValid", () => {
    it("should return true for non-expired confirmation", () => {
      const confirmation = manager.create({
        type: "move_stage",
        description: "Test",
        candidateIds: ["c-1"],
        payload: {},
        channelId: "channel-1",
        messageTs: "ts-1",
        userId: "user-1",
      });

      expect(manager.isValid(confirmation)).toBe(true);
    });

    it("should return false for expired confirmation", () => {
      const confirmation = manager.create({
        type: "move_stage",
        description: "Test",
        candidateIds: ["c-1"],
        payload: {},
        channelId: "channel-1",
        messageTs: "ts-1",
        userId: "user-1",
      });

      // Advance time past expiration
      vi.advanceTimersByTime(400000); // 6.6 minutes

      expect(manager.isValid(confirmation)).toBe(false);
    });
  });

  describe("getForChannel", () => {
    it("should get all valid confirmations for a channel", () => {
      manager.create({
        type: "move_stage",
        description: "Test 1",
        candidateIds: ["c-1"],
        payload: {},
        channelId: "channel-1",
        messageTs: "ts-1",
        userId: "user-1",
      });

      manager.create({
        type: "add_note",
        description: "Test 2",
        candidateIds: ["c-2"],
        payload: {},
        channelId: "channel-1",
        messageTs: "ts-2",
        userId: "user-1",
      });

      manager.create({
        type: "move_stage",
        description: "Test 3",
        candidateIds: ["c-3"],
        payload: {},
        channelId: "channel-2", // Different channel
        messageTs: "ts-3",
        userId: "user-1",
      });

      const channel1Confirmations = manager.getForChannel("channel-1");

      expect(channel1Confirmations).toHaveLength(2);
    });

    it("should exclude expired confirmations", () => {
      manager.create({
        type: "move_stage",
        description: "Test",
        candidateIds: ["c-1"],
        payload: {},
        channelId: "channel-1",
        messageTs: "ts-1",
        userId: "user-1",
      });

      // Advance time past expiration
      vi.advanceTimersByTime(400000);

      const confirmations = manager.getForChannel("channel-1");

      expect(confirmations).toHaveLength(0);
    });

    it("should return empty array for channel with no confirmations", () => {
      const confirmations = manager.getForChannel("nonexistent-channel");

      expect(confirmations).toEqual([]);
    });
  });

  describe("automatic cleanup", () => {
    it("should cleanup expired confirmations periodically", () => {
      const confirmation = manager.create({
        type: "move_stage",
        description: "Test",
        candidateIds: ["c-1"],
        payload: {},
        channelId: "channel-1",
        messageTs: "ts-1",
        userId: "user-1",
      });

      // Advance time past expiration but before cleanup
      vi.advanceTimersByTime(350000);

      // Confirmation still exists (not yet cleaned up)
      expect(manager.get(confirmation.id)).not.toBeNull();

      // Advance to trigger cleanup interval (every 60 seconds)
      vi.advanceTimersByTime(60000);

      // Now it should be cleaned up
      expect(manager.get(confirmation.id)).toBeNull();
    });

    it("should not cleanup non-expired confirmations", () => {
      const confirmation = manager.create({
        type: "move_stage",
        description: "Test",
        candidateIds: ["c-1"],
        payload: {},
        channelId: "channel-1",
        messageTs: "ts-1",
        userId: "user-1",
      });

      // Advance time but stay within timeout
      vi.advanceTimersByTime(120000); // 2 minutes

      // Should still exist
      expect(manager.get(confirmation.id)).not.toBeNull();
    });
  });

  describe("custom timeout", () => {
    it("should respect custom timeout value", () => {
      const shortTimeoutManager = new ConfirmationManager(10000); // 10 seconds

      const confirmation = shortTimeoutManager.create({
        type: "move_stage",
        description: "Test",
        candidateIds: ["c-1"],
        payload: {},
        channelId: "channel-1",
        messageTs: "ts-1",
        userId: "user-1",
      });

      // Still valid within 10 seconds
      vi.advanceTimersByTime(5000);
      expect(shortTimeoutManager.isValid(confirmation)).toBe(true);

      // Invalid after 10 seconds
      vi.advanceTimersByTime(10000);
      expect(shortTimeoutManager.isValid(confirmation)).toBe(false);
    });
  });
});
