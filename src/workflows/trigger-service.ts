/**
 * Workflow Trigger Service
 *
 * Creates workflow sessions from actual Ashby API data.
 * This bridges the gap between Ashby entities and workflow states.
 */

import type { AshbyService } from "../ashby/service.js";
import type {
  Application,
  ApplicationWithContext,
  Interview,
  Offer,
  Candidate,
  User,
} from "../types/index.js";
import type {
  QuickFeedbackWorkflow,
  DailyDigestWorkflow,
  BatchDecisionWorkflow,
  OfferApprovalWorkflow,
  InterviewPrepWorkflow,
  FeedbackNudgeWorkflow,
  SchedulingConfirmWorkflow,
  DebriefKickoffWorkflow,
  WeeklyPulseWorkflow,
  RejectionOptionsWorkflow,
} from "./types.js";
import { REACTION_SETS } from "./types.js";

export class WorkflowTriggerService {
  constructor(private readonly ashby: AshbyService) {}

  /**
   * Create Quick Feedback workflow state after an interview completes
   */
  async createQuickFeedbackState(params: {
    interview: Interview;
    interviewer: User;
    candidate: Candidate;
    application: Application;
  }): Promise<QuickFeedbackWorkflow> {
    const { interview, interviewer, candidate, application } = params;

    // Get job title
    const job = application.job ?? (await this.ashby.getJob(application.jobId));

    return {
      type: "quick_feedback",
      candidateId: candidate.id,
      candidateName: candidate.name,
      applicationId: application.id,
      jobTitle: job?.title ?? "Unknown Role",
      interviewerId: interviewer.id,
      interviewType: interview.interviewStage?.title ?? "Interview",
      interviewDate: interview.scheduledStartTime ?? new Date().toISOString(),
      reactions: [...REACTION_SETS.FEEDBACK_QUICK],
    };
  }

  /**
   * Create Daily Digest workflow state from pipeline analysis
   */
  async createDailyDigestState(): Promise<DailyDigestWorkflow> {
    // Get pipeline analysis
    const blockerAnalysis = await this.ashby.analyzeCandidateBlockers();

    // Build needs attention list from critical/warning blockers
    const needsAttention: DailyDigestWorkflow["needsAttention"] = [];

    for (const [blockerType, candidates] of Object.entries(blockerAnalysis.byBlockerType)) {
      if (blockerType === "no_blocker") continue;

      for (const item of candidates.slice(0, 3)) {
        needsAttention.push({
          candidateId: item.candidate.id,
          candidateName: item.candidate.name,
          issue: item.blocker.message,
        });
      }
    }

    // Get candidates ready to move
    const readyToMove: DailyDigestWorkflow["readyToMove"] = [];
    const readyList = blockerAnalysis.byBlockerType.ready_to_move ?? [];
    for (const item of readyList.slice(0, 3)) {
      readyToMove.push({
        candidateId: item.candidate.id,
        candidateName: item.candidate.name,
        reason: item.blocker.suggestedAction,
      });
    }

    // Count on-track candidates
    const onTrack = blockerAnalysis.byBlockerType.no_blocker?.length ?? 0;

    return {
      type: "daily_digest",
      needsAttention,
      readyToMove,
      onTrack,
      reactions: [...REACTION_SETS.DIGEST_ACTIONS],
    };
  }

  /**
   * Create Batch Decision workflow state for reviewing candidates in a stage
   */
  async createBatchDecisionState(params: {
    jobId: string;
    stageId: string;
    action: "advance" | "reject";
    limit?: number;
  }): Promise<BatchDecisionWorkflow> {
    const { jobId, stageId, action, limit = 5 } = params;

    // Get job and candidates
    const { job, candidates: pipeline } = await this.ashby.getJobWithCandidates(jobId);

    // Get stage details
    const stage = await this.ashby.getInterviewStageDetails(stageId);

    // Get candidates in this stage
    const candidatesInStage = pipeline
      .filter((app) => app.currentInterviewStage?.id === stageId)
      .slice(0, limit);

    // Build candidate list with scores
    const candidates: BatchDecisionWorkflow["candidates"] = [];

    for (let i = 0; i < candidatesInStage.length; i++) {
      const app = candidatesInStage[i];
      if (!app) continue;

      // Try to get scorecard for scores
      let scores = "No scores yet";
      let summary = "";

      try {
        const scorecard = await this.ashby.getCandidateScorecard(app.candidate?.id ?? "");
        if (scorecard.overallRating !== null) {
          scores = `${scorecard.overallRating}`;
        }
        if (scorecard.recommendations.length > 0) {
          summary = scorecard.recommendations[0] ?? "";
        }
      } catch {
        // Scorecard not available
      }

      candidates.push({
        index: i + 1,
        candidateId: app.candidate?.id ?? "",
        applicationId: app.id,
        candidateName: app.candidate?.name ?? "Unknown",
        scores,
        summary,
      });
    }

    return {
      type: "batch_decision",
      jobId,
      jobTitle: job?.title ?? "Unknown Role",
      stage: stage?.title ?? "Unknown Stage",
      candidates,
      selectedIndices: [],
      targetAction: action,
    };
  }

  /**
   * Create Offer Approval workflow state
   */
  async createOfferApprovalState(params: {
    offer: Offer;
    approverUserId: string;
  }): Promise<OfferApprovalWorkflow> {
    const { offer, approverUserId } = params;

    // Get application and candidate info
    const application = await this.ashby.getApplication(offer.applicationId);
    const { candidate } = await this.ashby.getCandidateWithApplications(application.candidateId);
    const job = application.job ?? (await this.ashby.getJob(application.jobId));

    return {
      type: "offer_approval",
      offerId: offer.id,
      applicationId: offer.applicationId,
      candidateId: candidate?.id ?? application.candidateId,
      candidateName: candidate?.name ?? "Unknown",
      jobTitle: job?.title ?? "Unknown Role",
      salary: offer.salary ?? 0,
      salaryFrequency: offer.salaryFrequency,
      currency: offer.currency,
      equity: offer.equity ?? 0,
      signingBonus: offer.signingBonus ?? 0,
      startDate: offer.startDate ?? "TBD",
      approvers: [{ userId: approverUserId }],
      currentApproverId: approverUserId,
      phase: "approval",
      reactions: [...REACTION_SETS.OFFER_APPROVAL],
    };
  }

  /**
   * Create Interview Prep workflow state for upcoming interview
   */
  async createInterviewPrepState(params: {
    interview: Interview;
    interviewer: User;
  }): Promise<InterviewPrepWorkflow> {
    const { interview, interviewer } = params;

    // Get application and candidate
    const application = await this.ashby.getApplication(interview.applicationId);
    const { candidate } = await this.ashby.getCandidateWithApplications(application.candidateId);
    const job = application.job ?? (await this.ashby.getJob(application.jobId));

    // Build prep summary
    let prepSummary = "";
    let previousScores = "";

    // Get candidate's experience/source
    if (candidate?.source?.title) {
      prepSummary += `Source: ${candidate.source.title}`;
    }

    // Try to get previous scores
    try {
      const scorecard = await this.ashby.getCandidateScorecard(candidate?.id ?? application.candidateId);
      if (scorecard.overallRating !== null) {
        previousScores = `Previous: ${scorecard.overallRating}`;
      }
    } catch {
      // No previous feedback
    }

    // Calculate time until interview
    const now = new Date();
    const interviewTime = new Date(interview.scheduledStartTime ?? now);
    const hoursUntil = Math.round((interviewTime.getTime() - now.getTime()) / (1000 * 60 * 60));
    const timeUntilStr = hoursUntil < 1 ? "soon" : `${hoursUntil}h`;

    return {
      type: "interview_prep",
      interviewerId: interviewer.id,
      candidateId: candidate?.id ?? application.candidateId,
      candidateName: candidate?.name ?? "Unknown",
      applicationId: application.id,
      jobTitle: job?.title ?? "Unknown Role",
      interviewTime: `in ${timeUntilStr}`,
      prepSummary: prepSummary || "No additional context available",
      previousScores,
      reactions: [...REACTION_SETS.PREP_ACTIONS],
    };
  }

  /**
   * Create Feedback Nudge workflow state for missing feedback
   */
  async createFeedbackNudgeState(params: {
    interview: Interview;
    interviewer: User;
  }): Promise<FeedbackNudgeWorkflow> {
    const { interview, interviewer } = params;

    // Get application and candidate
    const application = await this.ashby.getApplication(interview.applicationId);
    const { candidate } = await this.ashby.getCandidateWithApplications(application.candidateId);

    // Calculate days since interview
    const interviewDate = new Date(interview.scheduledStartTime ?? new Date());
    const now = new Date();
    const daysSince = Math.floor((now.getTime() - interviewDate.getTime()) / (1000 * 60 * 60 * 24));

    return {
      type: "feedback_nudge",
      interviewerId: interviewer.id,
      candidateId: candidate?.id ?? application.candidateId,
      candidateName: candidate?.name ?? "Unknown",
      applicationId: application.id,
      interviewType: interview.interviewStage?.title ?? "Interview",
      daysSinceInterview: daysSince,
      reactions: [
        { emoji: "thumbsup", slackName: "thumbsup", action: "strong_yes", label: "Strong hire" },
        { emoji: "thumbsdown", slackName: "thumbsdown", action: "pass", label: "Pass" },
        { emoji: "shrug", slackName: "shrug", action: "maybe", label: "Mixed feelings" },
      ],
    };
  }

  /**
   * Create Scheduling Confirmation workflow state
   */
  createSchedulingConfirmState(params: {
    interviewScheduleId: string;
    interviewer: User;
    candidate: Candidate;
    jobTitle: string;
    scheduledTime: string;
    duration: string;
    meetingLink?: string;
  }): SchedulingConfirmWorkflow {
    const { interviewScheduleId, interviewer, candidate, jobTitle, scheduledTime, duration, meetingLink } = params;

    return {
      type: "scheduling_confirm",
      interviewScheduleId,
      interviewerId: interviewer.id,
      candidateId: candidate.id,
      candidateName: candidate.name,
      jobTitle,
      scheduledTime,
      duration,
      meetingLink: meetingLink ?? "",
      reactions: [...REACTION_SETS.SCHEDULING],
    };
  }

  /**
   * Create Debrief Kickoff workflow state after all interviews complete
   */
  async createDebriefKickoffState(params: {
    candidateId: string;
    applicationId: string;
  }): Promise<DebriefKickoffWorkflow> {
    const { candidateId, applicationId } = params;

    // Get application details
    const application = await this.ashby.getApplication(applicationId);
    const { candidate } = await this.ashby.getCandidateWithApplications(candidateId);
    const job = application.job ?? (await this.ashby.getJob(application.jobId));

    // Get all feedback submissions to find interviewers
    const feedbackList = await this.ashby.listFeedbackSubmissions({ applicationId });
    const users = await this.ashby.listUsers();
    const userMap = new Map(users.map((u) => [u.id, u]));

    // Build interviewer list from feedback submissions
    const interviewerSet = new Map<string, { userId: string; name: string }>();

    for (const feedback of feedbackList) {
      const userId = feedback.submittedByUser?.id;
      if (userId && !interviewerSet.has(userId)) {
        const user = userMap.get(userId);
        const name = feedback.submittedByUser
          ? `${feedback.submittedByUser.firstName} ${feedback.submittedByUser.lastName}`.trim()
          : feedback.submittedBy?.name ?? user?.firstName ?? "Unknown";

        interviewerSet.set(userId, { userId, name });
      }
    }

    // Get overall scores
    let overallScores = "No scores yet";
    try {
      const scorecard = await this.ashby.getCandidateScorecard(candidateId, applicationId);
      if (scorecard.overallRating !== null) {
        overallScores = `${scorecard.overallRating} (${scorecard.feedbackCount} reviews)`;
      }
    } catch {
      // Scorecard not available
    }

    return {
      type: "debrief_kickoff",
      candidateId,
      candidateName: candidate?.name ?? "Unknown",
      applicationId,
      jobTitle: job?.title ?? "Unknown Role",
      overallScores,
      interviewers: Array.from(interviewerSet.values()),
      reactions: [
        { emoji: "thumbsup", slackName: "thumbsup", action: "yes", label: "Strong yes" },
        { emoji: "thumbsdown", slackName: "thumbsdown", action: "no", label: "Pass" },
        { emoji: "thinking_face", slackName: "thinking_face", action: "maybe", label: "Mixed" },
      ],
    };
  }

  /**
   * Create Weekly Pulse workflow state
   */
  async createWeeklyPulseState(jobId?: string): Promise<WeeklyPulseWorkflow> {
    let jobTitle = "";
    let pipeline: ApplicationWithContext[];

    if (jobId) {
      const result = await this.ashby.getJobWithCandidates(jobId);
      jobTitle = result.job?.title ?? "";
      pipeline = result.candidates;
    } else {
      // Get stale candidates as a proxy for active pipeline
      pipeline = await this.ashby.getStaleCandidates(10);
    }

    // Categorize candidates
    const activelyInterviewing: WeeklyPulseWorkflow["activelyInterviewing"] = [];
    const waitingOn: WeeklyPulseWorkflow["waitingOn"] = [];

    for (const app of pipeline.slice(0, 10)) {
      const stageName = app.currentInterviewStage?.title ?? "Unknown Stage";
      const candidateName = app.candidate?.name ?? "Unknown";
      const candidateId = app.candidateId;

      // Check for blockers
      if (app.isStale || app.daysInCurrentStage > 14) {
        waitingOn.push({
          candidateId,
          candidateName,
          waitingFor: `${app.daysInCurrentStage} days in ${stageName}`,
        });
      } else {
        activelyInterviewing.push({
          candidateId,
          candidateName,
          status: stageName,
        });
      }
    }

    return {
      type: "weekly_pulse",
      jobId: jobId ?? "",
      jobTitle,
      activelyInterviewing: activelyInterviewing.slice(0, 5),
      waitingOn: waitingOn.slice(0, 5),
      reactions: [...REACTION_SETS.PULSE_ACTIONS],
    };
  }

  /**
   * Create Rejection Options workflow state
   */
  async createRejectionOptionsState(params: {
    candidateId: string;
    applicationId: string;
    archiveReasonId: string;
  }): Promise<RejectionOptionsWorkflow> {
    const { candidateId, applicationId, archiveReasonId } = params;

    // Get application details
    const application = await this.ashby.getApplication(applicationId);
    const { candidate } = await this.ashby.getCandidateWithApplications(candidateId);
    const job = application.job ?? (await this.ashby.getJob(application.jobId));

    return {
      type: "rejection_options",
      candidateId,
      candidateName: candidate?.name ?? "Unknown",
      applicationId,
      jobTitle: job?.title ?? "Unknown Role",
      archiveReasonId,
      reactions: [...REACTION_SETS.REJECTION],
    };
  }

  /**
   * Find interviews that completed recently without feedback
   */
  async findInterviewsNeedingFeedback(hoursAgo: number = 24): Promise<
    Array<{
      interview: Interview;
      interviewer: User;
    }>
  > {
    const now = new Date();
    const cutoff = new Date(now.getTime() - hoursAgo * 60 * 60 * 1000);

    // Get recent interviews
    const interviews = await this.ashby.listAllInterviews({
      startDate: cutoff.toISOString(),
      endDate: now.toISOString(),
    });

    // Get users for interviewer lookup
    const users = await this.ashby.listUsers();
    const userMap = new Map(users.map((u) => [u.id, u]));

    const results: Array<{ interview: Interview; interviewer: User }> = [];

    for (const interview of interviews) {
      if (!interview.scheduledStartTime) continue;
      if (new Date(interview.scheduledStartTime) > now) continue;

      // Check if feedback exists
      const feedback = await this.ashby.listFeedbackSubmissions({
        interviewId: interview.id,
      });

      if (feedback.length === 0 && interview.interviewers) {
        // No feedback yet - find interviewer
        for (const interviewer of interview.interviewers) {
          const user = userMap.get(interviewer.userId);
          if (user) {
            results.push({ interview, interviewer: user });
          }
        }
      }
    }

    return results;
  }

  /**
   * Find upcoming interviews for prep notifications
   */
  async findUpcomingInterviewsForPrep(hoursAhead: number = 2): Promise<
    Array<{
      interview: Interview;
      interviewer: User;
    }>
  > {
    const now = new Date();
    const cutoff = new Date(now.getTime() + hoursAhead * 60 * 60 * 1000);

    // Get upcoming interviews
    const interviews = await this.ashby.getUpcomingInterviews(20);
    const users = await this.ashby.listUsers();
    const userMap = new Map(users.map((u) => [u.id, u]));

    const results: Array<{ interview: Interview; interviewer: User }> = [];

    for (const interview of interviews) {
      if (!interview.scheduledStartTime) continue;

      const interviewTime = new Date(interview.scheduledStartTime);
      if (interviewTime > now && interviewTime <= cutoff && interview.interviewers) {
        for (const interviewer of interview.interviewers) {
          const user = userMap.get(interviewer.userId);
          if (user) {
            results.push({ interview, interviewer: user });
          }
        }
      }
    }

    return results;
  }
}
