/**
 * Configuration Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { loadConfig, SafetyMode } from "./index.js";

describe("loadConfig", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset env to a clean state
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("should load valid configuration", () => {
    process.env["SLACK_BOT_TOKEN"] = "xoxb-test-token";
    process.env["SLACK_APP_TOKEN"] = "xapp-test-token";
    process.env["ANTHROPIC_API_KEY"] = "sk-ant-test-key";
    process.env["ASHBY_API_KEY"] = "ashby-test-key";

    const config = loadConfig();

    expect(config.slack.botToken).toBe("xoxb-test-token");
    expect(config.slack.appToken).toBe("xapp-test-token");
    expect(config.anthropic.apiKey).toBe("sk-ant-test-key");
    expect(config.ashby.apiKey).toBe("ashby-test-key");
  });

  it("should use default values", () => {
    process.env["SLACK_BOT_TOKEN"] = "xoxb-test-token";
    process.env["SLACK_APP_TOKEN"] = "xapp-test-token";
    process.env["ANTHROPIC_API_KEY"] = "sk-ant-test-key";
    process.env["ASHBY_API_KEY"] = "ashby-test-key";

    const config = loadConfig();

    expect(config.anthropic.model).toBe("claude-sonnet-4-20250514");
    expect(config.anthropic.maxTokens).toBe(4096);
    expect(config.ashby.baseUrl).toBe("https://api.ashbyhq.com");
    expect(config.safety.mode).toBe("CONFIRM_ALL");
    expect(config.safety.batchLimit).toBe(2);
    expect(config.staleDays).toBe(14);
  });

  it("should throw on missing required fields", () => {
    process.env["SLACK_BOT_TOKEN"] = "";
    process.env["SLACK_APP_TOKEN"] = "xapp-test-token";
    process.env["ANTHROPIC_API_KEY"] = "sk-ant-test-key";
    process.env["ASHBY_API_KEY"] = "ashby-test-key";

    expect(() => loadConfig()).toThrow("Configuration validation failed");
  });

  it("should parse safety mode", () => {
    process.env["SLACK_BOT_TOKEN"] = "xoxb-test-token";
    process.env["SLACK_APP_TOKEN"] = "xapp-test-token";
    process.env["ANTHROPIC_API_KEY"] = "sk-ant-test-key";
    process.env["ASHBY_API_KEY"] = "ashby-test-key";
    process.env["SAFETY_MODE"] = "BATCH_LIMIT";

    const config = loadConfig();

    expect(config.safety.mode).toBe(SafetyMode.BATCH_LIMIT);
  });

  it("should parse numeric values", () => {
    process.env["SLACK_BOT_TOKEN"] = "xoxb-test-token";
    process.env["SLACK_APP_TOKEN"] = "xapp-test-token";
    process.env["ANTHROPIC_API_KEY"] = "sk-ant-test-key";
    process.env["ASHBY_API_KEY"] = "ashby-test-key";
    process.env["BATCH_LIMIT"] = "5";
    process.env["ANTHROPIC_MAX_TOKENS"] = "8192";
    process.env["STALE_DAYS"] = "7";

    const config = loadConfig();

    expect(config.safety.batchLimit).toBe(5);
    expect(config.anthropic.maxTokens).toBe(8192);
    expect(config.staleDays).toBe(7);
  });

  it("should parse daily summary config", () => {
    process.env["SLACK_BOT_TOKEN"] = "xoxb-test-token";
    process.env["SLACK_APP_TOKEN"] = "xapp-test-token";
    process.env["ANTHROPIC_API_KEY"] = "sk-ant-test-key";
    process.env["ASHBY_API_KEY"] = "ashby-test-key";
    process.env["DAILY_SUMMARY_ENABLED"] = "true";
    process.env["DAILY_SUMMARY_TIME"] = "08:30";
    process.env["DAILY_SUMMARY_TIMEZONE"] = "America/Los_Angeles";
    process.env["DAILY_SUMMARY_CHANNEL"] = "C12345";

    const config = loadConfig();

    expect(config.dailySummary.enabled).toBe(true);
    expect(config.dailySummary.time).toBe("08:30");
    expect(config.dailySummary.timezone).toBe("America/Los_Angeles");
    expect(config.dailySummary.channelId).toBe("C12345");
  });

  it("should parse pipeline alerts config", () => {
    process.env["SLACK_BOT_TOKEN"] = "xoxb-test-token";
    process.env["SLACK_APP_TOKEN"] = "xapp-test-token";
    process.env["ANTHROPIC_API_KEY"] = "sk-ant-test-key";
    process.env["ASHBY_API_KEY"] = "ashby-test-key";
    process.env["PIPELINE_ALERTS_ENABLED"] = "true";
    process.env["PIPELINE_ALERTS_CHANNEL"] = "C67890";
    process.env["PIPELINE_ALERTS_STALE_THRESHOLD"] = "5";
    process.env["PIPELINE_ALERTS_DECISION_THRESHOLD"] = "3";

    const config = loadConfig();

    expect(config.pipelineAlerts?.enabled).toBe(true);
    expect(config.pipelineAlerts?.channelId).toBe("C67890");
    expect(config.pipelineAlerts?.thresholds?.stale).toBe(5);
    expect(config.pipelineAlerts?.thresholds?.needsDecision).toBe(3);
  });

  it("should disable daily summary when set to false", () => {
    process.env["SLACK_BOT_TOKEN"] = "xoxb-test-token";
    process.env["SLACK_APP_TOKEN"] = "xapp-test-token";
    process.env["ANTHROPIC_API_KEY"] = "sk-ant-test-key";
    process.env["ASHBY_API_KEY"] = "ashby-test-key";
    process.env["DAILY_SUMMARY_ENABLED"] = "false";

    const config = loadConfig();

    expect(config.dailySummary.enabled).toBe(false);
  });
});

describe("SafetyMode", () => {
  it("should have expected values", () => {
    expect(SafetyMode.BATCH_LIMIT).toBe("BATCH_LIMIT");
    expect(SafetyMode.CONFIRM_ALL).toBe("CONFIRM_ALL");
  });
});
