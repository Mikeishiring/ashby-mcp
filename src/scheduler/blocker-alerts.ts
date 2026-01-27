/**
 * Blocker Alert Scheduler
 *
 * Proactively detects and alerts about candidate blockers.
 * Unlike pipeline-alerts which runs on a schedule, this runs more frequently
 * and notifies specific people about actionable blockers.
 */

import cron from "node-cron";
import type { WebClient } from "@slack/web-api";
import type { AshbyService } from "../ashby/service.js";
import type { BatchBlockerAnalysis, CandidateBlocker, Candidate } from "../types/index.js";
import { logger } from "../utils/logger.js";

/**
 * Configuration for blocker alerts
 */
export interface BlockerAlertConfig {
  enabled: boolean;
  /** Cron expression for check interval (e.g., "0 0 *\/4 * * *" for every 4 hours) */
  cronExpression: string;
  /** Slack channel to post alerts */
  channelId: string;
  /** Only alert if severity >= this level */
  minSeverity: "info" | "warning" | "critical";
  /** Notify hiring managers via DM for their candidates */
  notifyHiringManagers: boolean;
  /** Cooldown before re-alerting about same candidate (hours) */
  cooldownHours: number;
}

/**
 * Tracks when we last alerted about a candidate to avoid spam
 */
interface AlertCooldown {
  candidateId: string;
  blockerType: string;
  alertedAt: Date;
}

export class BlockerAlertScheduler {
  private task: cron.ScheduledTask | null = null;
  private slackClient: WebClient | null = null;
  private readonly alertCooldowns: Map<string, AlertCooldown> = new Map();
  private readonly ashby: AshbyService | null;
  private readonly alertConfig: BlockerAlertConfig;

  constructor(
    ashby: AshbyService | null,
    alertConfig: BlockerAlertConfig
  ) {
    this.ashby = ashby;
    this.alertConfig = alertConfig;
  }

  /**
   * Set the Slack client (for testing or deferred initialization)
   */
  setSlackClient(client: WebClient): void {
    this.slackClient = client;
  }

  /**
   * Check if the scheduler has all required dependencies
   */
  isReady(): boolean {
    return this.ashby !== null && this.slackClient !== null;
  }

  /**
   * Start the scheduler
   */
  start(slackClient: WebClient): void {
    if (!this.alertConfig.enabled) {
      console.log("Blocker alerts are disabled");
      return;
    }

    if (!this.alertConfig.channelId) {
      console.warn("Blocker alerts channel not configured - skipping scheduler");
      return;
    }

    this.slackClient = slackClient;

    console.log(`Scheduling blocker alerts with cron: ${this.alertConfig.cronExpression}`);

    this.task = cron.schedule(this.alertConfig.cronExpression, () => {
      this.checkAndAlert().catch((error) => {
        logger.error("Failed to run blocker alert check", { error });
      });
    });

    console.log("Blocker alert scheduler started");
  }

  /**
   * Stop the scheduler
   */
  stop(): void {
    if (this.task) {
      this.task.stop();
      this.task = null;
      console.log("Blocker alert scheduler stopped");
    }
  }

  /**
   * Run a blocker check and post alerts
   */
  async checkAndAlert(): Promise<void> {
    if (!this.slackClient) {
      throw new Error("Slack client not initialized - call start() or setSlackClient() first");
    }

    if (!this.ashby) {
      throw new Error("AshbyService not available - scheduler created without Ashby dependency");
    }

    logger.info("Running blocker alert check...");

    try {
      // Analyze all candidates for blockers
      const analysis = await this.ashby.analyzeCandidateBlockers();

      // Filter to actionable blockers based on config
      const alertableBlockers = this.filterAlertableBlockers(analysis);

      if (alertableBlockers.length === 0) {
        logger.info("No new blockers to alert about");
        return;
      }

      // Group alerts by type for cleaner messaging
      const groupedAlerts = this.groupAlertsByType(alertableBlockers);

      // Post to channel
      await this.postChannelAlert(groupedAlerts, analysis.summary);

      // Optionally DM hiring managers
      if (this.alertConfig.notifyHiringManagers) {
        await this.notifyHiringManagers(alertableBlockers);
      }

      // Update cooldowns
      this.updateCooldowns(alertableBlockers);

      logger.info(`Posted alerts for ${alertableBlockers.length} blockers`);
    } catch (error) {
      logger.error("Blocker alert check failed", { error });
      throw error;
    }
  }

  /**
   * Filter blockers to only those we should alert about
   */
  private filterAlertableBlockers(
    analysis: BatchBlockerAnalysis
  ): Array<{ candidate: Candidate; blocker: CandidateBlocker; daysInStage: number }> {
    const severityOrder = { info: 0, warning: 1, critical: 2 };
    const minSeverityLevel = severityOrder[this.alertConfig.minSeverity];

    const alertable: Array<{ candidate: Candidate; blocker: CandidateBlocker; daysInStage: number }> = [];

    for (const [blockerType, candidates] of Object.entries(analysis.byBlockerType)) {
      if (blockerType === "no_blocker") continue;

      for (const { candidate, blocker, daysInStage } of candidates) {
        // Check severity threshold
        if (severityOrder[blocker.severity] < minSeverityLevel) continue;

        // Check cooldown
        if (this.isOnCooldown(candidate.id, blocker.type)) continue;

        alertable.push({ candidate, blocker, daysInStage });
      }
    }

    // Sort by severity (critical first) then by days
    alertable.sort((a, b) => {
      const severityDiff = severityOrder[b.blocker.severity] - severityOrder[a.blocker.severity];
      if (severityDiff !== 0) return severityDiff;
      return b.daysInStage - a.daysInStage;
    });

    return alertable;
  }

  /**
   * Group alerts by blocker type for cleaner messaging
   */
  private groupAlertsByType(
    blockers: Array<{ candidate: Candidate; blocker: CandidateBlocker; daysInStage: number }>
  ): Map<string, Array<{ candidate: Candidate; blocker: CandidateBlocker; daysInStage: number }>> {
    const grouped = new Map<string, Array<{ candidate: Candidate; blocker: CandidateBlocker; daysInStage: number }>>();

    for (const item of blockers) {
      const type = item.blocker.type;
      if (!grouped.has(type)) {
        grouped.set(type, []);
      }
      grouped.get(type)!.push(item);
    }

    return grouped;
  }

  /**
   * Post alert to the configured channel
   */
  private async postChannelAlert(
    groupedAlerts: Map<string, Array<{ candidate: Candidate; blocker: CandidateBlocker; daysInStage: number }>>,
    summary: { critical: number; warning: number; info: number }
  ): Promise<void> {
    const lines: string[] = [];

    // Header with severity breakdown
    const hasCritical = summary.critical > 0;
    const emoji = hasCritical ? "🚨" : "⚠️";
    lines.push(`${emoji} *Candidate Blockers Detected*`);
    lines.push("");

    if (summary.critical > 0) {
      lines.push(`🔴 ${summary.critical} critical`);
    }
    if (summary.warning > 0) {
      lines.push(`🟡 ${summary.warning} warning`);
    }
    lines.push("");

    // Blocker type sections
    const typeLabels: Record<string, string> = {
      no_interview_scheduled: "📅 No Interview Scheduled",
      awaiting_feedback: "📝 Awaiting Feedback",
      interview_completed_no_feedback: "📝 Interviews Without Feedback",
      offer_pending: "💼 Offer Stage - No Offer Created",
      offer_not_sent: "📧 Approved Offer Not Sent",
      ready_to_move: "➡️ Ready to Move Forward",
    };

    for (const [type, items] of groupedAlerts) {
      const label = typeLabels[type] ?? type;
      lines.push(`*${label}* (${items.length})`);

      for (const { candidate, blocker, daysInStage } of items.slice(0, 5)) {
        const severityEmoji = blocker.severity === "critical" ? "🔴" : "🟡";
        lines.push(`${severityEmoji} *${candidate.name}* - ${daysInStage} days`);
        lines.push(`    _${blocker.suggestedAction}_`);
      }

      if (items.length > 5) {
        lines.push(`    _...and ${items.length - 5} more_`);
      }
      lines.push("");
    }

    lines.push("_React with 👀 to see details or @mention me with a name_");

    await this.slackClient!.chat.postMessage({
      channel: this.alertConfig.channelId,
      text: lines.join("\n"),
      unfurl_links: false,
      unfurl_media: false,
    });
  }

  /**
   * Send DMs to hiring managers about their candidates
   */
  private async notifyHiringManagers(
    _blockers: Array<{ candidate: Candidate; blocker: CandidateBlocker; daysInStage: number }>
  ): Promise<void> {
    // Group by hiring manager (would need to look up from applications)
    // For now, this is a placeholder - full implementation would:
    // 1. Get application for each candidate
    // 2. Get hiring team for application
    // 3. Find the hiring manager's Slack user ID
    // 4. Send a DM

    // This is complex because it requires:
    // - Ashby user ID to Slack user ID mapping
    // - DM permissions

    logger.info("Hiring manager DM notifications not yet implemented");
  }

  /**
   * Check if we're on cooldown for a candidate/blocker combo
   */
  private isOnCooldown(candidateId: string, blockerType: string): boolean {
    const key = `${candidateId}:${blockerType}`;
    const cooldown = this.alertCooldowns.get(key);

    if (!cooldown) return false;

    const cooldownMs = this.alertConfig.cooldownHours * 60 * 60 * 1000;
    return Date.now() - cooldown.alertedAt.getTime() < cooldownMs;
  }

  /**
   * Update cooldowns after sending alerts
   */
  private updateCooldowns(
    blockers: Array<{ candidate: Candidate; blocker: CandidateBlocker }>
  ): void {
    const now = new Date();

    for (const { candidate, blocker } of blockers) {
      const key = `${candidate.id}:${blocker.type}`;
      this.alertCooldowns.set(key, {
        candidateId: candidate.id,
        blockerType: blocker.type,
        alertedAt: now,
      });
    }

    // Clean up old cooldowns (older than 48 hours)
    const maxAge = 48 * 60 * 60 * 1000;
    for (const [key, cooldown] of this.alertCooldowns) {
      if (now.getTime() - cooldown.alertedAt.getTime() > maxAge) {
        this.alertCooldowns.delete(key);
      }
    }
  }

  /**
   * Trigger an immediate check (for testing or manual trigger)
   */
  async triggerNow(): Promise<void> {
    await this.checkAndAlert();
  }
}
