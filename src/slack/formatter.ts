/**
 * Slack Message Formatter
 *
 * Utilities for formatting messages for Slack.
 */

import type { DailySummaryData, ApplicationWithContext } from "../types/index.js";

/**
 * Format the daily summary message
 */
export function formatDailySummary(data: DailySummaryData): string {
  const lines: string[] = [
    "📊 *Daily Pipeline Summary*",
    "",
  ];

  // Stale candidates section
  if (data.staleCandidate.length > 0) {
    lines.push("*Stale Candidates* (>14 days without movement):");
    for (const c of data.staleCandidate) {
      lines.push(`• *${c.name}* - ${c.stage} (${c.daysInStage} days) - ${c.job}`);
    }
    lines.push("");
  } else {
    lines.push("*Stale Candidates*: None! 🎉");
    lines.push("");
  }

  // Needs decision section
  if (data.needsDecision.length > 0) {
    lines.push("*Needs Decision*:");
    for (const c of data.needsDecision) {
      lines.push(`• *${c.name}* - ${c.stage} (${c.daysWaiting} days) - ${c.job}`);
    }
    lines.push("");
  } else {
    lines.push("*Needs Decision*: None pending");
    lines.push("");
  }

  // Quick stats
  lines.push("*Quick Stats*:");
  lines.push(`• ${data.stats.totalActive} active candidates across ${data.stats.openRoles} open roles`);
  lines.push(`• ${data.stats.newApplications} new applications yesterday`);
  lines.push("");
  lines.push("Reply to this thread or @mention me with questions!");

  return lines.join("\n");
}

/**
 * Format a list of candidates for display
 */
export function formatCandidateList(
  candidates: ApplicationWithContext[],
  title: string
): string {
  if (candidates.length === 0) {
    return `*${title}*\nNo candidates found.`;
  }

  const lines: string[] = [
    `*${title}* (${candidates.length} total)`,
    "",
  ];

  for (const app of candidates.slice(0, 10)) {
    const name = app.candidate?.name ?? "Unknown";
    const email = app.candidate?.primaryEmailAddress?.value ?? "No email";
    const stage = app.currentInterviewStage?.title ?? "Unknown stage";
    const job = app.job?.title ?? "Unknown job";
    const days = app.daysInCurrentStage;

    lines.push(`• *${name}* (${email})`);
    lines.push(`  ${stage} - ${job} - ${days} days in stage`);
  }

  if (candidates.length > 10) {
    lines.push("");
    lines.push(`_...and ${candidates.length - 10} more_`);
  }

  return lines.join("\n");
}

/**
 * Format a candidate's details for display
 */
export function formatCandidateDetails(context: {
  candidate: { name: string; primaryEmailAddress?: { value: string } | null };
  applications: ApplicationWithContext[];
  notes: Array<{ content: string; createdAt: string }>;
}): string {
  const { candidate, applications, notes } = context;
  const lines: string[] = [];

  // Header
  lines.push(`*${candidate.name}*`);
  if (candidate.primaryEmailAddress) {
    lines.push(candidate.primaryEmailAddress.value);
  }
  lines.push("");

  // Applications
  if (applications.length > 0) {
    lines.push("*Applications:*");
    for (const app of applications) {
      const status = app.status;
      const stage = app.currentInterviewStage?.title ?? "N/A";
      const job = app.job?.title ?? "Unknown";
      const days = app.daysInCurrentStage;
      const staleFlag = app.isStale ? " ⚠️ STALE" : "";

      lines.push(`• ${job} - ${stage} (${status})${staleFlag}`);
      lines.push(`  ${days} days in current stage`);
    }
    lines.push("");
  }

  // Recent notes
  if (notes.length > 0) {
    lines.push("*Recent Notes:*");
    for (const note of notes.slice(0, 3)) {
      const date = new Date(note.createdAt).toLocaleDateString();
      const preview =
        note.content.length > 100
          ? note.content.substring(0, 100) + "..."
          : note.content;
      lines.push(`• [${date}] ${preview}`);
    }
  }

  return lines.join("\n");
}

/**
 * Format a pipeline summary for display
 */
export function formatPipelineSummary(summary: {
  totalCandidates: number;
  staleCount: number;
  needsDecisionCount: number;
  byStage: Array<{ stage: { title: string }; count: number }>;
  byJob: Array<{ job: { title: string }; count: number }>;
}): string {
  const lines: string[] = [
    "📊 *Pipeline Overview*",
    "",
    `*Total Active Candidates:* ${summary.totalCandidates}`,
    `*Stale (>14 days):* ${summary.staleCount}`,
    `*Needs Decision:* ${summary.needsDecisionCount}`,
    "",
  ];

  // By stage
  lines.push("*By Stage:*");
  for (const { stage, count } of summary.byStage) {
    lines.push(`• ${stage.title}: ${count}`);
  }
  lines.push("");

  // By job
  lines.push("*By Job:*");
  for (const { job, count } of summary.byJob) {
    lines.push(`• ${job.title}: ${count}`);
  }

  return lines.join("\n");
}

/**
 * Escape special Slack characters in text
 */
export function escapeSlack(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
