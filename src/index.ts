/**
 * Ashby Slack Bot
 *
 * Main entry point that wires together all components.
 */

import dotenv from "dotenv";
dotenv.config({ override: true });

import { loadConfig } from "./config/index.js";
import { AshbyService } from "./ashby/index.js";
import { ClaudeAgent } from "./ai/index.js";
import { ConfirmationManager, SafetyGuards } from "./safety/index.js";
import { SlackBot } from "./slack/index.js";
import { DailySummaryScheduler, PipelineAlertScheduler, BlockerAlertScheduler } from "./scheduler/index.js";
import { ReminderManager } from "./reminders/index.js";
import { TriageSessionManager } from "./triage/index.js";
import { WorkflowManager } from "./workflows/index.js";
import { ConversationMemory } from "./memory/index.js";
import { UsageTracker } from "./analytics/index.js";

/**
 * Component health status tracking
 */
interface ComponentStatus {
  name: string;
  status: "ok" | "degraded" | "failed";
  message: string;
}

const componentStatuses: ComponentStatus[] = [];

function logStatus(name: string, status: "ok" | "degraded" | "failed", message: string): void {
  const icon = status === "ok" ? "✅" : status === "degraded" ? "⚠️" : "❌";
  console.log(`${icon} ${name}: ${message}`);
  componentStatuses.push({ name, status, message });
}

function printStartupSummary(): void {
  console.log("\n========================================");
  console.log("         COMPONENT STATUS SUMMARY");
  console.log("========================================");

  const failed = componentStatuses.filter((c) => c.status === "failed");
  const degraded = componentStatuses.filter((c) => c.status === "degraded");
  const ok = componentStatuses.filter((c) => c.status === "ok");

  console.log(`\n✅ Working: ${ok.length} components`);
  if (degraded.length > 0) {
    console.log(`⚠️  Degraded: ${degraded.length} components`);
    for (const c of degraded) {
      console.log(`   - ${c.name}: ${c.message}`);
    }
  }
  if (failed.length > 0) {
    console.log(`❌ Failed: ${failed.length} components`);
    for (const c of failed) {
      console.log(`   - ${c.name}: ${c.message}`);
    }
  }
  console.log("\n========================================\n");
}

async function main(): Promise<void> {
  console.log("\n========================================");
  console.log("   Ashby Slack Bot - Starting Up");
  console.log("========================================\n");

  // Load and validate configuration
  let config;
  try {
    config = loadConfig();
    logStatus("Configuration", "ok", "Loaded and validated");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logStatus("Configuration", "failed", message);
    console.error("\n❌ FATAL: Cannot start without valid configuration");
    console.error("   Check your .env file and ensure all required variables are set.");
    console.error("   See .env.example for reference.\n");
    process.exit(1);
  }

  // Check required API keys
  console.log("\n--- Checking Required API Keys ---");

  if (!config.ashby.apiKey) {
    logStatus("Ashby API Key", "failed", "Missing ASHBY_API_KEY");
    console.error("\n❌ FATAL: Ashby API key is required");
    console.error("   Get one from: Ashby Admin > Settings > API Keys\n");
    process.exit(1);
  }
  logStatus("Ashby API Key", "ok", "Configured");

  if (!config.anthropic.apiKey) {
    logStatus("Anthropic API Key", "failed", "Missing ANTHROPIC_API_KEY");
    console.error("\n❌ FATAL: Anthropic API key is required for Claude AI");
    console.error("   Get one from: https://console.anthropic.com/settings/keys\n");
    process.exit(1);
  }
  logStatus("Anthropic API Key", "ok", "Configured");

  if (!config.slack.botToken) {
    logStatus("Slack Bot Token", "failed", "Missing SLACK_BOT_TOKEN");
    console.error("\n❌ FATAL: Slack bot token is required");
    console.error("   Get one from: https://api.slack.com/apps > Your App > OAuth & Permissions\n");
    process.exit(1);
  }
  logStatus("Slack Bot Token", "ok", "Configured");

  if (!config.slack.appToken) {
    logStatus("Slack App Token", "failed", "Missing SLACK_APP_TOKEN");
    console.error("\n❌ FATAL: Slack app token is required for Socket Mode");
    console.error("   Get one from: https://api.slack.com/apps > Your App > Socket Mode\n");
    process.exit(1);
  }
  logStatus("Slack App Token", "ok", "Configured");

  // Initialize services
  console.log("\n--- Initializing Core Services ---");

  const ashby = new AshbyService(config);
  logStatus("Ashby Service", "ok", "Initialized");

  // Test Ashby connectivity
  let ashbyConnected = false;
  try {
    const jobs = await ashby.getOpenJobs();
    ashbyConnected = true;
    logStatus("Ashby API Connection", "ok", `Connected (${jobs.length} open jobs)`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logStatus("Ashby API Connection", "degraded", `Test failed - ${message}`);
    console.log("   The bot will start, but Ashby operations may fail.");
    console.log("   Check: API key permissions, network connectivity\n");
  }

  // Initialize safety components
  const confirmations = new ConfirmationManager(config.safety.confirmationTimeoutMs);
  const safety = new SafetyGuards(config, ashby);
  logStatus("Safety Guards", "ok", `Mode: ${config.safety.mode}, batch limit: ${config.safety.batchLimit}`);

  // Initialize conversation memory
  const memory = new ConversationMemory();
  logStatus("Conversation Memory", "ok", "4hr context retention enabled");

  // Initialize Claude agent with memory
  const agent = new ClaudeAgent(config, ashby, safety, undefined, memory);
  logStatus("Claude Agent", "ok", `Model: ${config.anthropic.model}`);

  // Initialize managers
  const reminders = new ReminderManager(ashby);
  const triageSessions = new TriageSessionManager();
  const workflows = new WorkflowManager();
  logStatus("Workflow Managers", "ok", "Reminders, Triage, Workflows ready");

  // Initialize usage tracking
  const usageTracker = new UsageTracker();
  logStatus("Usage Analytics", "ok", "Tracking messages, response times");

  // Initialize Slack bot
  const bot = new SlackBot(config, agent, confirmations, reminders, triageSessions, workflows, ashby, usageTracker);
  logStatus("Slack Bot", "ok", "Initialized (Socket Mode)");

  // Initialize schedulers
  console.log("\n--- Initializing Schedulers ---");

  const dailySummaryScheduler = new DailySummaryScheduler(config, ashby);
  if (config.dailySummary.enabled && config.dailySummary.channelId) {
    logStatus("Daily Summary", "ok", `Scheduled: ${config.dailySummary.time} ${config.dailySummary.timezone}`);
  } else if (config.dailySummary.enabled && !config.dailySummary.channelId) {
    logStatus("Daily Summary", "degraded", "Enabled but no channel configured (DAILY_SUMMARY_CHANNEL)");
  } else {
    logStatus("Daily Summary", "ok", "Disabled");
  }

  const pipelineAlertScheduler = new PipelineAlertScheduler(config, ashby);
  if (config.pipelineAlerts?.enabled && config.pipelineAlerts?.channelId) {
    logStatus("Pipeline Alerts", "ok", `Scheduled: ${config.pipelineAlerts.time} ${config.pipelineAlerts.timezone}`);
  } else if (config.pipelineAlerts?.enabled && !config.pipelineAlerts?.channelId) {
    logStatus("Pipeline Alerts", "degraded", "Enabled but no channel configured (PIPELINE_ALERTS_CHANNEL)");
  } else {
    logStatus("Pipeline Alerts", "ok", "Disabled");
  }

  // Initialize blocker alert scheduler if configured
  const blockerAlertConfig = config.blockerAlerts;
  let blockerAlertScheduler: BlockerAlertScheduler | null = null;

  if (blockerAlertConfig?.enabled) {
    if (!blockerAlertConfig.channelId) {
      logStatus("Blocker Alerts", "degraded", "Enabled but no channel configured (BLOCKER_ALERTS_CHANNEL)");
    } else if (!ashbyConnected) {
      logStatus("Blocker Alerts", "degraded", "Cannot start - Ashby API not connected");
    } else {
      blockerAlertScheduler = new BlockerAlertScheduler(ashby, {
        enabled: blockerAlertConfig.enabled,
        cronExpression: blockerAlertConfig.cronExpression,
        channelId: blockerAlertConfig.channelId,
        minSeverity: blockerAlertConfig.minSeverity,
        notifyHiringManagers: blockerAlertConfig.notifyHiringManagers,
        cooldownHours: blockerAlertConfig.cooldownHours,
      });
      logStatus("Blocker Alerts", "ok", `Cron: ${blockerAlertConfig.cronExpression}`);
    }
  } else {
    logStatus("Blocker Alerts", "ok", "Disabled");
  }

  // Handle graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    console.log(`\nReceived ${signal}, shutting down gracefully...`);
    dailySummaryScheduler.stop();
    pipelineAlertScheduler.stop();
    blockerAlertScheduler?.stop();
    triageSessions.shutdown();
    workflows.shutdown();
    memory.shutdown();
    await bot.stop();
    console.log("Shutdown complete.");
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  // Start the bot
  console.log("\n--- Starting Slack Connection ---");
  try {
    await bot.start();
    logStatus("Slack Connection", "ok", "Connected via Socket Mode");

    // Initialize reminder manager with Slack client
    reminders.initialize(bot.getClient());

    // Start the schedulers after bot is running
    dailySummaryScheduler.start(bot.getClient());
    pipelineAlertScheduler.start(bot.getClient());
    blockerAlertScheduler?.start(bot.getClient());

    // Print summary
    printStartupSummary();

    console.log("🚀 Ashby Slack Bot is ready!");
    console.log("   Listening for @mentions in channels where the bot is invited.");
    console.log("   Type /invite @YourBotName in a Slack channel to add it.\n");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logStatus("Slack Connection", "failed", message);
    printStartupSummary();
    console.error("❌ FATAL: Could not connect to Slack");
    console.error("   Check: SLACK_BOT_TOKEN and SLACK_APP_TOKEN are correct");
    console.error("   Check: Socket Mode is enabled in your Slack App settings\n");
    process.exit(1);
  }
}

// Run the bot
main().catch((error) => {
  console.error("\n❌ Fatal error during startup:", error);
  console.error("\nTroubleshooting:");
  console.error("1. Check all required environment variables are set");
  console.error("2. Verify API keys are valid and have correct permissions");
  console.error("3. Check network connectivity to Slack, Ashby, and Anthropic APIs");
  console.error("4. See docs/TROUBLESHOOTING.md for more help\n");
  process.exit(1);
});
