/**
 * Daily Summary Scheduler
 *
 * Handles scheduled posting of pipeline summaries to Slack.
 */

import cron from "node-cron";
import type { WebClient } from "@slack/web-api";
import type { Config } from "../config/index.js";
import type { AshbyService } from "../ashby/service.js";
import { formatDailySummary } from "../slack/formatter.js";

export class DailySummaryScheduler {
  private task: cron.ScheduledTask | null = null;
  private readonly config: Config;
  private readonly ashby: AshbyService;
  private slackClient: WebClient | null = null;

  constructor(config: Config, ashby: AshbyService) {
    this.config = config;
    this.ashby = ashby;
  }

  /**
   * Start the scheduler
   */
  start(slackClient: WebClient): void {
    if (!this.config.dailySummary.enabled) {
      console.log("Daily summary is disabled");
      return;
    }

    if (!this.config.dailySummary.channelId) {
      console.warn("Daily summary channel not configured - skipping scheduler");
      return;
    }

    this.slackClient = slackClient;

    // Parse time (HH:MM format)
    const [hours, minutes] = this.config.dailySummary.time.split(":");
    const cronExpression = `${minutes} ${hours} * * 1-5`; // Weekdays only

    console.log(
      `Scheduling daily summary for ${this.config.dailySummary.time} (${this.config.dailySummary.timezone})`
    );

    this.task = cron.schedule(
      cronExpression,
      () => {
        this.postSummary().catch(console.error);
      },
      {
        timezone: this.config.dailySummary.timezone,
      }
    );

    console.log("Daily summary scheduler started");
  }

  /**
   * Stop the scheduler
   */
  stop(): void {
    if (this.task) {
      this.task.stop();
      this.task = null;
      console.log("Daily summary scheduler stopped");
    }
  }

  /**
   * Post the daily summary now (can be called manually)
   */
  async postSummary(): Promise<void> {
    if (!this.slackClient) {
      throw new Error("Slack client not initialized");
    }

    if (!this.config.dailySummary.channelId) {
      throw new Error("Daily summary channel not configured");
    }

    console.log("Generating daily summary...");

    try {
      const data = await this.ashby.getDailySummaryData();
      const message = formatDailySummary(data);

      await this.slackClient.chat.postMessage({
        channel: this.config.dailySummary.channelId,
        text: message,
        unfurl_links: false,
        unfurl_media: false,
      });

      console.log("Daily summary posted successfully");
    } catch (error) {
      console.error("Failed to post daily summary:", error);
      throw error;
    }
  }

  /**
   * Trigger an immediate summary post (for testing)
   */
  async triggerNow(): Promise<void> {
    await this.postSummary();
  }
}
