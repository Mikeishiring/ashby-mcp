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
import { DailySummaryScheduler } from "./scheduler/index.js";

async function main(): Promise<void> {
  console.log("Starting Ashby Slack Bot...");

  // Load and validate configuration
  let config;
  try {
    config = loadConfig();
    console.log("Configuration loaded successfully");
  } catch (error) {
    console.error("Configuration error:", error);
    process.exit(1);
  }

  // Initialize services
  const ashby = new AshbyService(config);
  console.log("Ashby service initialized");

  // Log API key presence (not the actual key for security)
  const ashbyKeyLength = config.ashby.apiKey.length;
  const ashbyKeyPrefix = config.ashby.apiKey.substring(0, 8);
  console.log(`Ashby API key: ${ashbyKeyPrefix}... (${ashbyKeyLength} chars)`);

  // Test Ashby connectivity on startup
  try {
    console.log("Testing Ashby API connectivity...");
    const jobs = await ashby.getOpenJobs();
    console.log(`✅ Ashby API connected! Found ${jobs.length} open jobs.`);
  } catch (error) {
    console.error("⚠️ Ashby API connectivity test failed:", error);
    console.error("The bot will still start, but Ashby operations may fail.");
  }

  // Initialize safety components
  const confirmations = new ConfirmationManager(config.safety.confirmationTimeoutMs);
  const safety = new SafetyGuards(config, ashby);
  console.log(`Safety mode: ${config.safety.mode}, batch limit: ${config.safety.batchLimit}`);

  // Initialize Claude agent
  const agent = new ClaudeAgent(config, ashby, safety);
  console.log("Claude agent initialized");

  // Initialize Slack bot
  const bot = new SlackBot(config, agent, confirmations);

  // Initialize scheduler
  const scheduler = new DailySummaryScheduler(config, ashby);

  // Handle graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    console.log(`\nReceived ${signal}, shutting down gracefully...`);
    scheduler.stop();
    await bot.stop();
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  // Start the bot
  try {
    await bot.start();

    // Start the scheduler after bot is running
    scheduler.start(bot.getClient());

    console.log("\n✅ Ashby Slack Bot is ready!");
    console.log("   Listening for @mentions in configured channels.");
    if (config.dailySummary.enabled && config.dailySummary.channelId) {
      console.log(
        `   Daily summary scheduled for ${config.dailySummary.time} ${config.dailySummary.timezone}`
      );
    }
  } catch (error) {
    console.error("Failed to start bot:", error);
    process.exit(1);
  }
}

// Run the bot
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
