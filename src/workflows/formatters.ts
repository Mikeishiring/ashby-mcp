/**
 * Workflow Message Formatters
 *
 * Generates Slack messages for each workflow type.
 */

import { REACTION_SETS } from "./types.js";

/**
 * Format Quick Feedback prompt after an interview
 */
export function formatQuickFeedback(params: {
  candidateName: string;
  jobTitle: string;
  interviewType: string;
}): { text: string; reactions: string[] } {
  const lines = [
    `Hey! Looks like you just finished interviewing *${params.candidateName}* for ${params.jobTitle}.`,
    "",
    "*Quick take?*",
    "👍 Strong yes  |  🤔 Maybe  |  👎 Pass  |  ⏸️ Need to think",
    "",
    "_React now for a quick signal, or tell me more for detailed feedback._",
  ];

  return {
    text: lines.join("\n"),
    reactions: REACTION_SETS.FEEDBACK_QUICK.map((r) => r.slackName),
  };
}

/**
 * Format Daily Digest with action reactions
 */
export function formatDailyDigest(params: {
  needsAttention: Array<{ candidateName: string; issue: string }>;
  readyToMove: Array<{ candidateName: string; scores: string }>;
  onTrackCount: number;
  interviewsToday: number;
}): { text: string; reactions: string[] } {
  const lines = [
    "*Good morning! Here's your pipeline snapshot:*",
    "",
  ];

  if (params.needsAttention.length > 0) {
    lines.push("🔴 *Needs attention:*");
    for (const item of params.needsAttention.slice(0, 3)) {
      lines.push(`  • *${item.candidateName}* - ${item.issue}`);
    }
    if (params.needsAttention.length > 3) {
      lines.push(`  _...and ${params.needsAttention.length - 3} more_`);
    }
    lines.push("");
  }

  if (params.readyToMove.length > 0) {
    lines.push("🟡 *Ready to move:*");
    for (const item of params.readyToMove.slice(0, 3)) {
      lines.push(`  • *${item.candidateName}* - All interviews complete ${item.scores}`);
    }
    if (params.readyToMove.length > 3) {
      lines.push(`  _...and ${params.readyToMove.length - 3} more_`);
    }
    lines.push("");
  }

  lines.push("🟢 *On track:*");
  lines.push(`  • ${params.onTrackCount} candidates with interviews scheduled`);
  if (params.interviewsToday > 0) {
    lines.push(`  • ${params.interviewsToday} interviews happening today`);
  }
  lines.push("");

  lines.push("---");
  lines.push("Quick actions:");
  lines.push("✅ = Show who needs decisions");
  lines.push("📅 = Show today's interviews");
  lines.push("🔔 = Remind interviewers about missing feedback");

  return {
    text: lines.join("\n"),
    reactions: REACTION_SETS.DIGEST_ACTIONS.map((r) => r.slackName),
  };
}

/**
 * Format Batch Decision mode for reviewing multiple candidates
 */
export function formatBatchDecision(params: {
  jobTitle: string;
  stage: string;
  candidates: Array<{
    index: number;
    candidateName: string;
    scores: string;
    summary: string;
  }>;
}): { text: string; reactions: string[] } {
  const lines = [
    `*Pipeline review: ${params.jobTitle} (${params.candidates.length} candidates in ${params.stage})*`,
    "",
  ];

  for (const candidate of params.candidates) {
    const emoji = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣"][candidate.index - 1] || `${candidate.index}.`;
    lines.push(`${emoji} *${candidate.candidateName}* - ${candidate.scores} - "${candidate.summary}"`);
  }

  lines.push("");
  lines.push("---");
  lines.push("React with the numbers of candidates to advance:");
  lines.push("1️⃣ 2️⃣ 3️⃣ 4️⃣ 5️⃣");
  lines.push("");
  lines.push("Then react ✅ when done, or ❌ to cancel.");

  const reactions = [
    ...REACTION_SETS.NUMBER_SELECT.slice(0, params.candidates.length).map((r) => r.slackName),
    "white_check_mark",
    "x",
  ];

  return {
    text: lines.join("\n"),
    reactions,
  };
}

/**
 * Format Offer Approval request
 */
export function formatOfferApproval(params: {
  candidateName: string;
  jobTitle: string;
  salary: number;
  equity?: number;
  startDate: string;
  approverMention: string;
}): { text: string; reactions: string[] } {
  const lines = [
    "*Offer pending approval:*",
    "",
    `👤 *${params.candidateName}* → ${params.jobTitle}`,
    `💵 $${params.salary.toLocaleString()} base${params.equity ? ` + $${params.equity.toLocaleString()} equity` : ""}`,
    `📅 Start: ${params.startDate}`,
    "",
    "---",
    `${params.approverMention} - React to approve:`,
    "✅ = Approve as-is",
    "💬 = I have comments",
    "❌ = Do not approve",
  ];

  return {
    text: lines.join("\n"),
    reactions: REACTION_SETS.OFFER_APPROVAL.map((r) => r.slackName),
  };
}

/**
 * Format Offer Send confirmation (after approval)
 */
export function formatOfferSend(params: {
  candidateName: string;
  approverName: string;
}): { text: string; reactions: string[] } {
  const lines = [
    `✅ *Offer approved by ${params.approverName}*`,
    "",
    "Ready to send?",
    "📤 = Send offer now",
    "✏️ = I need to edit something first",
    "⏰ = Schedule send for tomorrow 9am",
  ];

  return {
    text: lines.join("\n"),
    reactions: REACTION_SETS.OFFER_SEND.map((r) => r.slackName),
  };
}

/**
 * Format Interview Prep notification
 */
export function formatInterviewPrep(params: {
  candidateName: string;
  jobTitle: string;
  timeUntil: string;
  experience: string;
  previousScores?: string;
  focusAreas: string[];
}): { text: string; reactions: string[] } {
  const lines = [
    `*Heads up!* You're interviewing *${params.candidateName}* for ${params.jobTitle} in ${params.timeUntil}.`,
    "",
    "📋 *Quick prep:*",
    `  • ${params.experience}`,
  ];

  if (params.previousScores) {
    lines.push(`  • Previous scores: ${params.previousScores}`);
  }

  if (params.focusAreas.length > 0) {
    lines.push(`  • Focus areas: ${params.focusAreas.join(", ")}`);
  }

  lines.push("");
  lines.push("👀 = I've reviewed this");
  lines.push("❓ = Show me more detail");
  lines.push("📝 = Show previous interview notes");

  return {
    text: lines.join("\n"),
    reactions: REACTION_SETS.PREP_ACTIONS.map((r) => r.slackName),
  };
}

/**
 * Format Feedback Nudge reminder
 */
export function formatFeedbackNudge(params: {
  interviewerMention: string;
  candidateName: string;
  interviewType: string;
  daysSince: number;
}): { text: string; reactions: string[] } {
  const lines = [
    `Hey ${params.interviewerMention}! Quick reminder: feedback for *${params.candidateName}* (${params.interviewType}, ${params.daysSince} day${params.daysSince > 1 ? "s" : ""} ago).`,
    "",
    "⏱️ Takes ~2 min in Ashby, or just tell me here:",
    "👍 = Strong hire",
    "👎 = Pass",
    "🤷 = Mixed feelings (I'll ask follow-up questions)",
  ];

  return {
    text: lines.join("\n"),
    reactions: [
      "thumbsup",
      "thumbsdown",
      "shrug",
    ],
  };
}

/**
 * Format Scheduling Confirmation
 */
export function formatSchedulingConfirm(params: {
  candidateName: string;
  interviewerMention: string;
  scheduledTime: string;
  duration: string;
  meetingLink?: string;
}): { text: string; reactions: string[] } {
  const lines = [
    "*Interview scheduled!*",
    "",
    `👤 *${params.candidateName}* ↔️ ${params.interviewerMention}`,
    `📅 ${params.scheduledTime} (${params.duration})`,
  ];

  if (params.meetingLink) {
    lines.push(`🔗 ${params.meetingLink}`);
  }

  lines.push("");
  lines.push(`${params.interviewerMention} - Confirm availability:`);
  lines.push("✅ = Confirmed");
  lines.push("🔄 = Need to reschedule");
  lines.push("📋 = Send me prep materials");

  return {
    text: lines.join("\n"),
    reactions: REACTION_SETS.SCHEDULING.map((r) => r.slackName),
  };
}

/**
 * Format Debrief Kickoff after all interviews complete
 */
export function formatDebriefKickoff(params: {
  candidateName: string;
  jobTitle: string;
  overallScores: string;
  interviewers: Array<{ mention: string; name: string }>;
}): { text: string; reactions: string[] } {
  const lines = [
    `*All interviews complete for *${params.candidateName}* (${params.jobTitle})*`,
    "",
    "Ready for debrief?",
    `📊 Scores: ${params.overallScores}`,
    "",
    "Quick pulse from the team:",
  ];

  for (const interviewer of params.interviewers) {
    lines.push(`${interviewer.mention} - 👍👎🤔`);
  }

  lines.push("");
  lines.push("_React with your gut take, then let's discuss._");

  return {
    text: lines.join("\n"),
    reactions: ["thumbsup", "thumbsdown", "thinking_face"],
  };
}

/**
 * Format Weekly Pipeline Pulse
 */
export function formatWeeklyPulse(params: {
  jobTitle?: string;
  activelyInterviewing: Array<{ candidateName: string; status: string }>;
  waitingOn: Array<{ candidateName: string; waitingFor: string }>;
}): { text: string; reactions: string[] } {
  const title = params.jobTitle
    ? `*Weekly pipeline pulse: ${params.jobTitle}*`
    : "*Weekly pipeline pulse*";

  const lines = [title, ""];

  if (params.activelyInterviewing.length > 0) {
    lines.push("Still actively interviewing:");
    for (const item of params.activelyInterviewing.slice(0, 5)) {
      lines.push(`  • *${item.candidateName}* - ${item.status}`);
    }
    lines.push("");
  }

  if (params.waitingOn.length > 0) {
    lines.push("Waiting on something:");
    for (const item of params.waitingOn.slice(0, 5)) {
      lines.push(`  • *${item.candidateName}* - ${item.waitingFor}`);
    }
    lines.push("");
  }

  lines.push("Anyone we should prioritize or deprioritize?");
  lines.push("🚀 = Show who to fast-track");
  lines.push("🐢 = Show who's been waiting longest");
  lines.push("📊 = Full pipeline breakdown");

  return {
    text: lines.join("\n"),
    reactions: REACTION_SETS.PULSE_ACTIONS.map((r) => r.slackName),
  };
}

/**
 * Format Rejection with Empathy Options
 */
export function formatRejectionOptions(params: {
  candidateName: string;
  jobTitle: string;
}): { text: string; reactions: string[] } {
  const lines = [
    `*Archiving *${params.candidateName}* from ${params.jobTitle} pipeline*`,
    "",
    "Send rejection email?",
    "📧 = Standard rejection (auto-sends)",
    "✍️ = Let me personalize the message",
    "🤫 = No email (internal archive only)",
    "⏸️ = Wait—let me reconsider",
  ];

  return {
    text: lines.join("\n"),
    reactions: REACTION_SETS.REJECTION.map((r) => r.slackName),
  };
}

/**
 * Format a generic workflow completion message
 */
export function formatWorkflowComplete(workflowType: string, summary: string): string {
  return `✅ *${workflowType} complete*\n\n${summary}`;
}

/**
 * Format a workflow error message
 */
export function formatWorkflowError(message: string): string {
  return `❌ ${message}`;
}
