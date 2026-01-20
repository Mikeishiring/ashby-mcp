/**
 * Pipeline Alert Scheduler
 *
 * Sends pipeline health alerts to a configured Slack channel.
 * Posts warnings about stale candidates and pending decisions.
 */

import cron from "node-cron";
import type { WebClient } from "@slack/web-api";
import type { Config } from "../config/index.js";
import type { AshbyService } from "../ashby/service.js";

export class PipelineAlertScheduler {
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
    if (!this.config.pipelineAlerts?.enabled) {
      console.log("Pipeline alerts are disabled");
      return;
    }

    if (!this.config.pipelineAlerts?.channelId) {
      console.warn("Pipeline alerts channel not configured - skipping scheduler");
      return;
    }

    this.slackClient = slackClient;

    // Parse time (HH:MM format)
    const time = this.config.pipelineAlerts.time ?? "09:00";
    const [hours, minutes] = time.split(":");
    const cronExpression = `${minutes} ${hours} * * 1-5`; // Weekdays only

    const timezone = this.config.pipelineAlerts.timezone ?? "America/New_York";

    console.log(`Scheduling pipeline alerts for ${time} (${timezone})`);

    this.task = cron.schedule(
      cronExpression,
      () => {
        this.postAlerts().catch(console.error);
      },
      {
        timezone,
      }
    );

    console.log("Pipeline alert scheduler started");
  }

  /**
   * Stop the scheduler
   */
  stop(): void {
    if (this.task) {
      this.task.stop();
      this.task = null;
      console.log("Pipeline alert scheduler stopped");
    }
  }

  /**
   * Post pipeline alerts now (can be called manually)
   */
  async postAlerts(): Promise<void> {
    if (!this.slackClient) {
      throw new Error("Slack client not initialized");
    }

    if (!this.config.pipelineAlerts?.channelId) {
      throw new Error("Pipeline alerts channel not configured");
    }

    console.log("Generating pipeline alerts...");

    try {
      const [staleCandidates, needsDecision, summary] = await Promise.all([
        this.ashby.getStaleCandidates(10),
        this.ashby.getCandidatesNeedingDecision(10),
        this.ashby.getPipelineSummary(),
      ]);

      // Only post if there's something to alert about
      const staleThreshold = this.config.pipelineAlerts.thresholds?.stale ?? 3;
      const decisionThreshold = this.config.pipelineAlerts.thresholds?.needsDecision ?? 2;

      const hasStaleAlert = staleCandidates.length >= staleThreshold;
      const hasDecisionAlert = needsDecision.length >= decisionThreshold;

      if (!hasStaleAlert && !hasDecisionAlert) {
        console.log("No alerts to send - pipeline looks healthy!");
        return;
      }

      const message = this.formatAlertMessage(
        staleCandidates as Array<{ candidate?: { name: string }; job?: { title: string }; daysInCurrentStage: number; currentInterviewStage?: { title: string } | null }>,
        needsDecision as Array<{ candidate?: { name: string }; job?: { title: string }; daysInCurrentStage: number; currentInterviewStage?: { title: string } | null }>,
        summary.totalCandidates,
        hasStaleAlert,
        hasDecisionAlert
      );

      await this.slackClient.chat.postMessage({
        channel: this.config.pipelineAlerts.channelId,
        text: message,
        unfurl_links: false,
        unfurl_media: false,
      });

      console.log("Pipeline alerts posted successfully");
    } catch (error) {
      console.error("Failed to post pipeline alerts:", error);
      throw error;
    }
  }

  /**
   * Format the alert message
   */
  private formatAlertMessage(
    staleCandidates: Array<{ candidate?: { name: string }; job?: { title: string }; daysInCurrentStage: number; currentInterviewStage?: { title: string } | null }>,
    needsDecision: Array<{ candidate?: { name: string }; job?: { title: string }; daysInCurrentStage: number; currentInterviewStage?: { title: string } | null }>,
    totalActive: number,
    hasStaleAlert: boolean,
    hasDecisionAlert: boolean
  ): string {
    const lines: string[] = [];

    lines.push("🔔 *Pipeline Health Alert*");
    lines.push("");

    if (hasStaleAlert) {
      lines.push(`⚠️ *${staleCandidates.length} stale candidates* (stuck >14 days):`);
      for (const app of staleCandidates.slice(0, 5)) {
        const name = app.candidate?.name ?? "Unknown";
        const job = app.job?.title ?? "Unknown role";
        const stage = app.currentInterviewStage?.title ?? "Unknown stage";
        lines.push(`  • *${name}* - ${job} (${stage}, ${app.daysInCurrentStage} days)`);
      }
      if (staleCandidates.length > 5) {
        lines.push(`  _...and ${staleCandidates.length - 5} more_`);
      }
      lines.push("");
    }

    if (hasDecisionAlert) {
      lines.push(`🎯 *${needsDecision.length} candidates need decisions*:`);
      for (const app of needsDecision.slice(0, 5)) {
        const name = app.candidate?.name ?? "Unknown";
        const job = app.job?.title ?? "Unknown role";
        const stage = app.currentInterviewStage?.title ?? "Unknown stage";
        lines.push(`  • *${name}* - ${job} (${stage}, waiting ${app.daysInCurrentStage} days)`);
      }
      if (needsDecision.length > 5) {
        lines.push(`  _...and ${needsDecision.length - 5} more_`);
      }
      lines.push("");
    }

    lines.push(`📊 Total active candidates: ${totalActive}`);
    lines.push("");
    lines.push("_Reply to this thread or @mention me for details on any candidate._");

    return lines.join("\n");
  }

  /**
   * Trigger an immediate alert post (for testing)
   */
  async triggerNow(): Promise<void> {
    await this.postAlerts();
  }
}
