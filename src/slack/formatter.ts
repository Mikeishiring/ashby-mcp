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
      const name = formatCandidateName(c.name, c.profileUrl);
      lines.push(`• *${name}* - ${c.stage} (${c.daysInStage} days) - ${c.job}`);
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
      const name = formatCandidateName(c.name, c.profileUrl);
      lines.push(`• *${name}* - ${c.stage} (${c.daysWaiting} days) - ${c.job}`);
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
    const name = formatCandidateName(
      app.candidate?.name ?? "Unknown",
      app.candidate?.profileUrl
    );
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
  candidate: { name: string; primaryEmailAddress?: { value: string } | null; profileUrl?: string };
  applications: ApplicationWithContext[];
  notes: Array<{ content: string; createdAt: string }>;
}): string {
  const { candidate, applications, notes } = context;
  const lines: string[] = [];

  // Header - name is hyperlinked to Ashby profile
  const name = formatCandidateName(candidate.name, candidate.profileUrl);
  lines.push(`*${name}*`);
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

/**
 * Format a candidate name as a hyperlink to their Ashby profile.
 * If no profileUrl is provided, returns just the escaped name.
 */
export function formatCandidateName(name: string, profileUrl?: string): string {
  const escapedName = escapeSlack(name);
  if (profileUrl) {
    return `<${profileUrl}|${escapedName}>`;
  }
  return escapedName;
}

/**
 * Format a resume download link for Slack.
 * Returns a Block Kit formatted message with the download link.
 * This is token-efficient: the URL is passed directly to Slack without LLM processing the file content.
 */
export function formatResumeLink(
  candidateName: string,
  url: string,
  profileUrl?: string
): string {
  const name = formatCandidateName(candidateName, profileUrl);
  return `:page_facing_up: *Resume for ${name}*\n<${url}|Download Resume>`;
}

/**
 * Format a relative time string (e.g., "in 2 hours", "tomorrow at 2:00 PM")
 */
export function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffMins = Math.round(diffMs / (1000 * 60));
  const diffHours = Math.round(diffMs / (1000 * 60 * 60));
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  const timeStr = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });

  if (diffMins < 0) {
    return `${timeStr} (past)`;
  } else if (diffMins < 60) {
    return `in ${diffMins} minute${diffMins !== 1 ? "s" : ""} (${timeStr})`;
  } else if (diffHours < 24) {
    return `in ${diffHours} hour${diffHours !== 1 ? "s" : ""} (${timeStr})`;
  } else if (diffDays === 1) {
    return `tomorrow at ${timeStr}`;
  } else if (diffDays < 7) {
    const dayName = date.toLocaleDateString("en-US", { weekday: "long" });
    return `${dayName} at ${timeStr}`;
  } else {
    return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  }
}

/**
 * Format interview duration (e.g., "30 min", "1 hr", "1 hr 30 min")
 */
export function formatDuration(startTime: string, endTime: string): string {
  const start = new Date(startTime);
  const end = new Date(endTime);
  const diffMins = Math.round((end.getTime() - start.getTime()) / (1000 * 60));

  if (diffMins < 60) {
    return `${diffMins} min`;
  } else {
    const hours = Math.floor(diffMins / 60);
    const mins = diffMins % 60;
    if (mins === 0) {
      return `${hours} hr`;
    }
    return `${hours} hr ${mins} min`;
  }
}

/**
 * Format an interview briefing for Slack.
 * Provides a comprehensive overview for an interviewer before meeting a candidate.
 */
export function formatInterviewBriefing(briefing: {
  candidate: { name: string; primaryEmailAddress?: { value: string } | null; profileUrl?: string };
  job: { title: string } | null;
  highlights: string[];
  priorFeedback: { overallRating: number | null; feedbackCount: number } | null;
  upcomingInterview: { startTime: string; title?: string } | null;
  notes: Array<{ content: string; createdAt: string }>;
  resumeUrl: string | null;
  interviewStageName: string | null;
  scheduledTime: string | null;
  scheduledEndTime?: string | null;
  meetingLink?: string | null;
  location?: string | null;
  interviewerNames?: string[];
}): string {
  const lines: string[] = [];

  // Header with candidate name linked to profile
  const name = formatCandidateName(briefing.candidate.name, briefing.candidate.profileUrl);
  lines.push(`:briefcase: *Interview Briefing: ${name}*`);
  lines.push("");

  // Interview details
  if (briefing.scheduledTime || briefing.interviewStageName) {
    lines.push("*Interview Details*");
    if (briefing.interviewStageName) {
      lines.push(`• Type: ${escapeSlack(briefing.interviewStageName)}`);
    }
    if (briefing.scheduledTime) {
      const date = new Date(briefing.scheduledTime);
      const relativeTime = formatRelativeTime(date);
      lines.push(`• When: ${relativeTime}`);

      // Show duration if we have end time
      if (briefing.scheduledEndTime) {
        const duration = formatDuration(briefing.scheduledTime, briefing.scheduledEndTime);
        lines.push(`• Duration: ${duration}`);
      }
    }
    // Meeting link
    if (briefing.meetingLink) {
      lines.push(`• Join: <${briefing.meetingLink}|Meeting Link>`);
    }
    // Location for in-person
    if (briefing.location) {
      lines.push(`• Location: ${escapeSlack(briefing.location)}`);
    }
    // Other interviewers
    if (briefing.interviewerNames && briefing.interviewerNames.length > 0) {
      const othersLabel = briefing.interviewerNames.length === 1 ? "Interviewer" : "Panel";
      lines.push(`• ${othersLabel}: ${briefing.interviewerNames.map(escapeSlack).join(", ")}`);
    }
    lines.push("");
  }

  // Job info
  if (briefing.job) {
    lines.push(`*Role:* ${escapeSlack(briefing.job.title)}`);
    lines.push("");
  }

  // Highlights (source, stage, LinkedIn, etc.)
  if (briefing.highlights.length > 0) {
    lines.push("*Quick Facts*");
    for (const highlight of briefing.highlights) {
      lines.push(`• ${escapeSlack(highlight)}`);
    }
    lines.push("");
  }

  // Prior feedback summary
  if (briefing.priorFeedback && briefing.priorFeedback.feedbackCount > 0) {
    lines.push("*Prior Interview Feedback*");
    if (briefing.priorFeedback.overallRating !== null) {
      lines.push(`• Overall Rating: ${briefing.priorFeedback.overallRating}/5 (${briefing.priorFeedback.feedbackCount} reviews)`);
    } else {
      lines.push(`• ${briefing.priorFeedback.feedbackCount} prior reviews (no numeric rating)`);
    }
    lines.push("");
  }

  // Recent notes (first 3, truncated)
  if (briefing.notes.length > 0) {
    lines.push("*Recent Notes*");
    for (const note of briefing.notes.slice(0, 3)) {
      const date = new Date(note.createdAt).toLocaleDateString();
      const preview =
        note.content.length > 80 ? note.content.substring(0, 80) + "..." : note.content;
      lines.push(`• [${date}] ${escapeSlack(preview)}`);
    }
    lines.push("");
  }

  // Resume link
  if (briefing.resumeUrl) {
    lines.push(`:page_facing_up: <${briefing.resumeUrl}|Download Resume>`);
    lines.push("");
  }

  // Footer
  lines.push("_Good luck with your interview!_");

  return lines.join("\n");
}
