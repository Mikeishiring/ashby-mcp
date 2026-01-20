/**
 * Reminder Manager
 *
 * Schedules reminders using Slack's chat.scheduleMessage API.
 * Reminders survive bot restarts since they're stored by Slack.
 */

import type { WebClient } from "@slack/web-api";
import type { AshbyService } from "../ashby/service.js";

export interface ReminderData {
  userId: string;
  candidateId: string;
  candidateName: string;
  jobTitle: string | null;
  currentStage: string | null;
  note?: string;
  scheduledMessageId?: string;
}

export class ReminderManager {
  private slackClient: WebClient | null = null;
  private readonly ashby: AshbyService;

  constructor(ashby: AshbyService) {
    this.ashby = ashby;
  }

  /**
   * Initialize with Slack client
   */
  initialize(slackClient: WebClient): void {
    this.slackClient = slackClient;
  }

  /**
   * Schedule a reminder about a candidate
   */
  async scheduleReminder(params: {
    userId: string;
    candidateId: string;
    remindIn: string;
    note?: string;
  }): Promise<{ success: boolean; scheduledTime: Date; message: string }> {
    if (!this.slackClient) {
      throw new Error("Slack client not initialized");
    }

    // Parse the remind_in string to get the target time
    const scheduledTime = this.parseRemindIn(params.remindIn);
    if (!scheduledTime) {
      throw new Error(`Could not parse reminder time: "${params.remindIn}". Try "3 days", "1 week", or "tomorrow".`);
    }

    // Ensure the scheduled time is in the future (Slack requires at least 1 minute)
    const minTime = new Date(Date.now() + 60 * 1000);
    if (scheduledTime < minTime) {
      throw new Error("Reminder must be at least 1 minute in the future");
    }

    // Get candidate context for the reminder message
    const context = await this.ashby.getCandidateFullContext(params.candidateId);
    const candidate = context.candidate;
    const activeApp = context.applications.find((a) => a.status === "Active");

    // Build the reminder message with full context
    const message = this.formatReminderMessage({
      candidateName: candidate.name,
      jobTitle: activeApp?.job?.title ?? null,
      currentStage: activeApp?.currentInterviewStage?.title ?? null,
      ...(activeApp?.daysInCurrentStage !== undefined && { daysInStage: activeApp.daysInCurrentStage }),
      profileUrl: candidate.profileUrl,
      ...(params.note !== undefined && { note: params.note }),
    });

    // Schedule the message using Slack's API
    const postAt = Math.floor(scheduledTime.getTime() / 1000);

    try {
      const result = await this.slackClient.chat.scheduleMessage({
        channel: params.userId, // DM to user
        post_at: postAt,
        text: message,
      });

      console.log(`[Reminder] Scheduled for ${scheduledTime.toISOString()}, message ID: ${result.scheduled_message_id}`);

      return {
        success: true,
        scheduledTime,
        message: `Reminder set for ${this.formatRelativeTime(scheduledTime)}`,
      };
    } catch (error) {
      console.error("[Reminder] Failed to schedule:", error);
      throw new Error("Failed to schedule reminder with Slack");
    }
  }

  /**
   * Parse a human-readable time string into a Date
   */
  private parseRemindIn(remindIn: string): Date | null {
    const now = new Date();
    const input = remindIn.toLowerCase().trim();

    // Match patterns like "3 days", "1 week", "2 hours"
    const durationMatch = input.match(/^(\d+)\s*(day|days|week|weeks|hour|hours|minute|minutes|min|mins)$/);
    if (durationMatch) {
      const amountStr = durationMatch[1];
      const unit = durationMatch[2];

      if (amountStr && unit) {
        const amount = parseInt(amountStr, 10);

        if (unit.startsWith("day")) {
          return new Date(now.getTime() + amount * 24 * 60 * 60 * 1000);
        }
        if (unit.startsWith("week")) {
          return new Date(now.getTime() + amount * 7 * 24 * 60 * 60 * 1000);
        }
        if (unit.startsWith("hour")) {
          return new Date(now.getTime() + amount * 60 * 60 * 1000);
        }
        if (unit.startsWith("min")) {
          return new Date(now.getTime() + amount * 60 * 1000);
        }
      }
    }

    // Handle "tomorrow"
    if (input === "tomorrow") {
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(9, 0, 0, 0); // Default to 9 AM
      return tomorrow;
    }

    // Handle "next week"
    if (input === "next week") {
      return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    }

    // Handle "in X" format (e.g., "in 3 days")
    const inMatch = input.match(/^in\s+(\d+)\s*(day|days|week|weeks|hour|hours)$/);
    if (inMatch) {
      return this.parseRemindIn(`${inMatch[1]} ${inMatch[2]}`);
    }

    return null;
  }

  /**
   * Format the reminder message
   */
  private formatReminderMessage(params: {
    candidateName: string;
    jobTitle: string | null;
    currentStage: string | null;
    daysInStage?: number;
    profileUrl: string;
    note?: string;
  }): string {
    const lines: string[] = [];

    lines.push(`⏰ *Reminder: ${params.candidateName}*`);
    lines.push("");

    if (params.jobTitle) {
      lines.push(`📋 *Role:* ${params.jobTitle}`);
    }

    if (params.currentStage) {
      lines.push(`📍 *Stage:* ${params.currentStage}`);
      if (params.daysInStage !== undefined) {
        lines.push(`⏱️ *Days in stage:* ${params.daysInStage}`);
      }
    }

    if (params.note) {
      lines.push("");
      lines.push(`📝 *Note:* ${params.note}`);
    }

    lines.push("");
    lines.push(`🔗 <${params.profileUrl}|View in Ashby>`);
    lines.push("");
    lines.push("_Reply or @mention me for more details about this candidate._");

    return lines.join("\n");
  }

  /**
   * Format a relative time string
   */
  private formatRelativeTime(date: Date): string {
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
    const diffHours = Math.floor(diffMs / (60 * 60 * 1000));

    if (diffDays > 0) {
      return diffDays === 1 ? "tomorrow" : `in ${diffDays} days`;
    }
    if (diffHours > 0) {
      return diffHours === 1 ? "in 1 hour" : `in ${diffHours} hours`;
    }
    return "shortly";
  }
}
