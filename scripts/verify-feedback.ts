import dotenv from "dotenv";

import type { Config } from "../src/config/index.js";
import { AshbyClient } from "../src/ashby/client.js";
import { AshbyService } from "../src/ashby/service.js";

dotenv.config();

type FlagMap = Map<string, string>;

const args = process.argv.slice(2);
const flags: FlagMap = new Map();

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (!arg?.startsWith("--")) continue;
  const [rawKey, rawValue] = arg.slice(2).split("=", 2);
  const key = rawKey.trim();
  if (!key) continue;

  if (rawValue !== undefined) {
    flags.set(key, rawValue);
    continue;
  }

  const next = args[i + 1];
  if (next && !next.startsWith("--")) {
    flags.set(key, next);
    i += 1;
  } else {
    flags.set(key, "true");
  }
}

const candidateId = flags.get("candidate-id") ?? flags.get("candidate_id");
const applicationIdArg = flags.get("application-id") ?? flags.get("application_id");
const interviewId = flags.get("interview-id") ?? flags.get("interview_id");
const limit = Math.max(parseInt(flags.get("limit") ?? "5", 10) || 5, 1);

const ashbyApiKey = process.env["ASHBY_API_KEY"] ?? "";
const baseUrl = process.env["ASHBY_BASE_URL"] ?? "https://api.ashbyhq.com";

if (!ashbyApiKey) {
  console.error("Missing ASHBY_API_KEY in the environment.");
  process.exit(1);
}

if (!candidateId && !applicationIdArg && !interviewId) {
  console.error("Usage: npx tsx scripts/verify-feedback.ts --candidate-id <id> [--application-id <id>] [--interview-id <id>] [--limit 5]");
  process.exit(1);
}

const config: Config = {
  slack: { botToken: "unused", appToken: "unused", signingSecret: undefined },
  anthropic: { apiKey: "unused", model: "claude-sonnet-4-20250514", maxTokens: 4096 },
  ashby: { apiKey: ashbyApiKey, baseUrl },
  safety: { mode: "CONFIRM_ALL", batchLimit: 2, confirmationTimeoutMs: 300000 },
  dailySummary: { enabled: false, time: "09:00", timezone: "UTC", channelId: undefined },
  pipelineAlerts: {
    enabled: false,
    time: "09:00",
    timezone: "UTC",
    channelId: undefined,
    thresholds: { stale: 3, needsDecision: 2 },
  },
  staleDays: 14,
};

const client = new AshbyClient(config);
const service = new AshbyService(config);

const warn = (message: string) => {
  console.warn(`[warn] ${message}`);
};

const info = (message: string) => {
  console.log(`[info] ${message}`);
};

const summarizeSubmission = async (submissionId: string) => {
  const detail = await service.getFeedbackDetails(submissionId);
  const submittedBy = detail.submittedByUser
    ? `${detail.submittedByUser.firstName} ${detail.submittedByUser.lastName}`.trim()
    : detail.submittedBy?.name ?? "Unknown";

  info(
    `submission ${detail.id}: by ${submittedBy}, submittedAt=${detail.submittedAt ?? "n/a"}, interviewId=${detail.interviewId ?? "n/a"}`
  );

  if (!detail.formDefinition) {
    warn(`submission ${detail.id} missing formDefinition`);
  }
  if (!detail.submittedValues) {
    warn(`submission ${detail.id} missing submittedValues`);
  }

  const fieldCount = detail.fieldSubmissions?.length ?? 0;
  info(`submission ${detail.id} fieldSubmissions=${fieldCount}`);
  return detail;
};

const run = async () => {
  let applicationId = applicationIdArg;

  if (!applicationId && candidateId) {
    const activeApp = await service.getActiveApplicationForCandidate(candidateId);
    if (!activeApp) {
      throw new Error("No active application found for this candidate.");
    }
    applicationId = activeApp.id;
  }

  info(`candidateId=${candidateId ?? "n/a"}`);
  info(`applicationId=${applicationId ?? "n/a"}`);
  info(`interviewId=${interviewId ?? "n/a"}`);

  if (applicationId) {
    const applicationFeedback = await client.getApplicationFeedback(applicationId);
    info(`applicationFeedback.list returned ${applicationFeedback.length} submissions`);

    const listFilters = {
      applicationId,
      ...(interviewId ? { interviewId } : {}),
    };
    const feedbackSubmissions = await client.listFeedbackSubmissions(listFilters);
    info(`feedbackSubmission.list returned ${feedbackSubmissions.length} submissions`);

    const missingInterviewIds = feedbackSubmissions.filter((submission) => !submission.interviewId);
    if (missingInterviewIds.length > 0) {
      warn(`feedbackSubmission.list missing interviewId on ${missingInterviewIds.length} submissions`);
    }

    const interviews = await client.listInterviews({ applicationId });
    info(`interview.list returned ${interviews.length} interviews`);

    const completedInterviews = interviews.filter(
      (interview) => interview.scheduledStartTime && new Date(interview.scheduledStartTime) < new Date()
    );
    const hasInterviewIds = feedbackSubmissions.some((submission) => submission.interviewId);
    if (hasInterviewIds) {
      const missingFeedback = completedInterviews.filter(
        (interview) => !feedbackSubmissions.some((submission) => submission.interviewId === interview.id)
      );
      info(`completed interviews=${completedInterviews.length}, missing feedback=${missingFeedback.length}`);
    } else if (feedbackSubmissions.length > 0) {
      warn("feedbackSubmission.list lacks interviewId; cannot map feedback to interviews reliably.");
    }

    const detailTargets = feedbackSubmissions.slice(0, limit);
    for (const submission of detailTargets) {
      await summarizeSubmission(submission.id);
    }
  }

  if (interviewId && !applicationId) {
    const feedbackSubmissions = await client.listFeedbackSubmissions({ interviewId });
    info(`feedbackSubmission.list (interviewId) returned ${feedbackSubmissions.length} submissions`);
    for (const submission of feedbackSubmissions.slice(0, limit)) {
      await summarizeSubmission(submission.id);
    }
  }
};

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
