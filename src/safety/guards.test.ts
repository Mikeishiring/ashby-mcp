/**
 * Safety Guards Tests
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { SafetyGuards } from "./guards.js";
import type { AshbyService } from "../ashby/service.js";
import type { Config } from "../config/index.js";

const createMockConfig = (overrides?: Partial<Config["safety"]>): Config => ({
  slack: { botToken: "test", appToken: "test" },
  anthropic: { apiKey: "test", model: "test", maxTokens: 4096 },
  ashby: { apiKey: "test", baseUrl: "https://api.ashbyhq.com" },
  safety: {
    mode: "CONFIRM_ALL",
    batchLimit: 2,
    confirmationTimeoutMs: 300000,
    ...overrides,
  },
  dailySummary: { enabled: false, time: "09:00", timezone: "America/New_York" },
  staleDays: 14,
});

const createMockAshby = (): Partial<AshbyService> => ({
  isHiredCandidate: vi.fn(),
});

describe("SafetyGuards", () => {
  let guards: SafetyGuards;
  let mockAshby: Partial<AshbyService>;
  let config: Config;

  beforeEach(() => {
    config = createMockConfig();
    mockAshby = createMockAshby();
    guards = new SafetyGuards(config, mockAshby as AshbyService);
  });

  describe("checkReadOperation", () => {
    it("should allow reading non-hired candidates", async () => {
      vi.mocked(mockAshby.isHiredCandidate!).mockResolvedValue(false);

      const result = await guards.checkReadOperation("candidate-1");

      expect(result.allowed).toBe(true);
    });

    it("should block reading hired candidates", async () => {
      vi.mocked(mockAshby.isHiredCandidate!).mockResolvedValue(true);

      const result = await guards.checkReadOperation("candidate-1");

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("hired");
    });
  });

  describe("checkWriteOperation - CONFIRM_ALL mode", () => {
    it("should require confirmation for single candidate", async () => {
      vi.mocked(mockAshby.isHiredCandidate!).mockResolvedValue(false);

      const result = await guards.checkWriteOperation({
        type: "add_note",
        candidateIds: ["candidate-1"],
      });

      expect(result.allowed).toBe(true);
      expect(result.requiresConfirmation).toBe(true);
    });

    it("should block hired candidates", async () => {
      vi.mocked(mockAshby.isHiredCandidate!).mockResolvedValue(true);

      const result = await guards.checkWriteOperation({
        type: "add_note",
        candidateIds: ["candidate-1"],
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("hired");
    });

    it("should block batch operations exceeding limit", async () => {
      vi.mocked(mockAshby.isHiredCandidate!).mockResolvedValue(false);

      const result = await guards.checkWriteOperation({
        type: "move_stage",
        candidateIds: ["c1", "c2", "c3"], // exceeds limit of 2
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("batch");
    });
  });

  describe("checkWriteOperation - BATCH_LIMIT mode", () => {
    beforeEach(() => {
      config = createMockConfig({ mode: "BATCH_LIMIT" });
      guards = new SafetyGuards(config, mockAshby as AshbyService);
    });

    it("should not require confirmation within batch limit", async () => {
      vi.mocked(mockAshby.isHiredCandidate!).mockResolvedValue(false);

      const result = await guards.checkWriteOperation({
        type: "add_note",
        candidateIds: ["candidate-1"],
      });

      expect(result.allowed).toBe(true);
      expect(result.requiresConfirmation).toBe(false);
    });

    it("should require confirmation for destructive ops", async () => {
      vi.mocked(mockAshby.isHiredCandidate!).mockResolvedValue(false);

      const result = await guards.checkWriteOperation({
        type: "move_stage",
        candidateIds: ["candidate-1"],
      });

      expect(result.allowed).toBe(true);
      expect(result.requiresConfirmation).toBe(true);
    });

    it("should still block batch over limit", async () => {
      vi.mocked(mockAshby.isHiredCandidate!).mockResolvedValue(false);

      const result = await guards.checkWriteOperation({
        type: "add_note",
        candidateIds: ["c1", "c2", "c3"],
      });

      expect(result.allowed).toBe(false);
    });
  });

  describe("operations without candidates", () => {
    it("should allow operations with empty candidate list", async () => {
      const result = await guards.checkWriteOperation({
        type: "add_note",
        candidateIds: [],
      });

      expect(result.allowed).toBe(true);
    });
  });
});
