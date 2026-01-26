/**
 * Logger Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Logger } from "./logger.js";

describe("Logger", () => {
  let consoleSpy: {
    log: ReturnType<typeof vi.spyOn>;
    warn: ReturnType<typeof vi.spyOn>;
    error: ReturnType<typeof vi.spyOn>;
  };

  beforeEach(() => {
    consoleSpy = {
      log: vi.spyOn(console, "log").mockImplementation(() => {}),
      warn: vi.spyOn(console, "warn").mockImplementation(() => {}),
      error: vi.spyOn(console, "error").mockImplementation(() => {}),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("log levels", () => {
    it("should respect minimum log level", () => {
      const logger = new Logger("warn");

      logger.debug("debug message");
      logger.info("info message");
      logger.warn("warn message");
      logger.error("error message");

      expect(consoleSpy.log).not.toHaveBeenCalled();
      expect(consoleSpy.warn).toHaveBeenCalledTimes(1);
      expect(consoleSpy.error).toHaveBeenCalledTimes(1);
    });

    it("should log all levels when set to debug", () => {
      const logger = new Logger("debug");

      logger.debug("debug message");
      logger.info("info message");
      logger.warn("warn message");
      logger.error("error message");

      expect(consoleSpy.log).toHaveBeenCalledTimes(2); // debug + info
      expect(consoleSpy.warn).toHaveBeenCalledTimes(1);
      expect(consoleSpy.error).toHaveBeenCalledTimes(1);
    });

    it("should change level dynamically", () => {
      const logger = new Logger("error");
      expect(logger.getLevel()).toBe("error");

      logger.setLevel("debug");
      expect(logger.getLevel()).toBe("debug");

      logger.debug("should now be logged");
      expect(consoleSpy.log).toHaveBeenCalledTimes(1);
    });
  });

  describe("trace ID", () => {
    it("should generate unique trace IDs", () => {
      const logger = new Logger();
      const id1 = logger.generateTraceId();
      const id2 = logger.generateTraceId();

      expect(id1).not.toBe(id2);
      expect(typeof id1).toBe("string");
      expect(id1.length).toBeGreaterThan(0);
    });

    it("should include trace ID in log output", () => {
      const logger = new Logger("debug");
      logger.setTraceId("test-trace-123");

      logger.info("test message");

      expect(consoleSpy.log).toHaveBeenCalledTimes(1);
      const logCall = consoleSpy.log.mock.calls[0]?.[0] as string;
      expect(logCall).toContain("test-trace-123");
    });

    it("should get and set trace ID", () => {
      const logger = new Logger();
      expect(logger.getTraceId()).toBeNull();

      logger.setTraceId("my-trace");
      expect(logger.getTraceId()).toBe("my-trace");

      logger.setTraceId(null);
      expect(logger.getTraceId()).toBeNull();
    });
  });

  describe("child logger", () => {
    it("should create child logger with bound trace ID", () => {
      const logger = new Logger("debug");
      const child = logger.child("child-trace-456");

      child.info("child message");

      expect(consoleSpy.log).toHaveBeenCalledTimes(1);
      const logCall = consoleSpy.log.mock.calls[0]?.[0] as string;
      expect(logCall).toContain("child-trace-456");
    });

    it("should support all log levels in child", () => {
      const logger = new Logger("debug");
      const child = logger.child("trace-id");

      child.debug("debug");
      child.info("info");
      child.warn("warn");
      child.error("error");

      expect(consoleSpy.log).toHaveBeenCalledTimes(2);
      expect(consoleSpy.warn).toHaveBeenCalledTimes(1);
      expect(consoleSpy.error).toHaveBeenCalledTimes(1);
    });
  });

  describe("context", () => {
    it("should include context in log output", () => {
      const logger = new Logger("debug");

      logger.info("test message", { userId: "123", action: "test" });

      expect(consoleSpy.log).toHaveBeenCalledTimes(1);
      const logCall = consoleSpy.log.mock.calls[0]?.[0] as string;
      expect(logCall).toContain("userId");
      expect(logCall).toContain("123");
      expect(logCall).toContain("action");
      expect(logCall).toContain("test");
    });

    it("should include timestamp in log output", () => {
      const logger = new Logger("debug");

      logger.info("test message");

      expect(consoleSpy.log).toHaveBeenCalledTimes(1);
      const logCall = consoleSpy.log.mock.calls[0]?.[0] as string;
      // Check for ISO timestamp format
      expect(logCall).toMatch(/\d{4}-\d{2}-\d{2}T/);
    });

    it("should include log level in output", () => {
      const logger = new Logger("debug");

      logger.debug("debug message");
      logger.info("info message");
      logger.warn("warn message");
      logger.error("error message");

      expect(consoleSpy.log.mock.calls[0]?.[0]).toContain("[DEBUG]");
      expect(consoleSpy.log.mock.calls[1]?.[0]).toContain("[INFO]");
      expect(consoleSpy.warn.mock.calls[0]?.[0]).toContain("[WARN]");
      expect(consoleSpy.error.mock.calls[0]?.[0]).toContain("[ERROR]");
    });
  });
});
