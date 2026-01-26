/**
 * Analytics Service
 *
 * Handles source analytics, candidate comparisons, and prep packets.
 */

import type { AshbyClient } from "../client.js";
import type { SearchService } from "./search-service.js";
import type { FeedbackService } from "./feedback-service.js";
import type { CandidateService } from "./candidate-service.js";
import type { InterviewService } from "./interview-service.js";
import type {
  Application,
  CandidateComparison,
  CandidateWithContext,
  Interview,
  InterviewBriefing,
  Job,
  PrepPacket,
  SourceAnalytics,
} from "../../types/index.js";

export class AnalyticsService {
  constructor(
    private readonly client: AshbyClient,
    private readonly searchService: SearchService,
    private readonly candidateService: CandidateService,
    private readonly feedbackService: FeedbackService,
    private readonly interviewService: InterviewService
  ) {}

  async getSourceAnalytics(days: number = 90): Promise<SourceAnalytics[]> {
    // Fetch all applications (not just active) to get full picture
    const [activeApps, hiredApps, archivedApps] = await Promise.all([
      this.client.listApplications({ status: "Active" }),
      this.client.listApplications({ status: "Hired" }),
      this.client.listApplications({ status: "Archived" }),
    ]);

    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const allApps = [...activeApps, ...hiredApps, ...archivedApps].filter(
      (app) => new Date(app.createdAt).getTime() > cutoff
    );

    // Group by source
    const bySource = new Map<string, Application[]>();
    for (const app of allApps) {
      const sourceKey = app.source?.id ?? "unknown";
      if (!bySource.has(sourceKey)) {
        bySource.set(sourceKey, []);
      }
      bySource.get(sourceKey)!.push(app);
    }

    // Calculate analytics per source
    const analytics: SourceAnalytics[] = [];
    for (const apps of bySource.values()) {
      const activeCount = apps.filter((a) => a.status === "Active").length;
      const hiredCount = apps.filter((a) => a.status === "Hired").length;
      const archivedCount = apps.filter((a) => a.status === "Archived").length;
      const totalApplications = apps.length;

      // Calculate average days to hire
      const hiredWithDates = apps.filter((a) => a.status === "Hired");
      let avgDaysToHire: number | null = null;
      if (hiredWithDates.length > 0) {
        const daysToHire = hiredWithDates.map((a) => {
          const created = new Date(a.createdAt).getTime();
          const updated = new Date(a.updatedAt).getTime();
          return Math.floor((updated - created) / (24 * 60 * 60 * 1000));
        });
        avgDaysToHire = Math.round(
          daysToHire.reduce((a, b) => a + b, 0) / daysToHire.length
        );
      }

      analytics.push({
        source: apps[0]?.source ?? null,
        sourceName: apps[0]?.source?.title ?? "Unknown Source",
        totalApplications,
        activeCount,
        hiredCount,
        archivedCount,
        conversionRate: totalApplications > 0 ? Math.round((hiredCount / totalApplications) * 100) : 0,
        avgDaysToHire,
      });
    }

    // Sort by total applications descending
    return analytics.sort((a, b) => b.totalApplications - a.totalApplications);
  }

  async compareCandidates(
    candidateIds?: string[],
    jobId?: string,
    limit: number = 3
  ): Promise<CandidateComparison> {
    let candidates: CandidateWithContext[] = [];
    let job: Job | null = null;

    if (candidateIds && candidateIds.length > 0) {
      // Get specific candidates
      const contexts = await Promise.all(
        candidateIds.slice(0, Math.min(limit, 5)).map(async (id) => {
          const ctx = await this.candidateService.getCandidateFullContext(id);
          return {
            ...ctx.candidate,
            applications: ctx.applications,
            notes: ctx.notes,
          } as CandidateWithContext;
        })
      );
      candidates = contexts;

      // Get the job from the first candidate's active application
      const firstApp = contexts[0]?.applications.find((a) => a.status === "Active");
      if (firstApp) {
        job = firstApp.job;
      }
    } else if (jobId) {
      // Get top candidates for a job
      const [jobData, applications] = await Promise.all([
        this.client.getJob(jobId),
        this.client.getApplicationsForJob(jobId),
      ]);
      job = jobData;

      // Get full context for top candidates
      const topApps = applications.slice(0, limit);
      candidates = await Promise.all(
        topApps.map(async (app) => {
          const ctx = await this.candidateService.getCandidateFullContext(app.candidateId);
          return {
            ...ctx.candidate,
            applications: ctx.applications,
            notes: ctx.notes,
          } as CandidateWithContext;
        })
      );
    }

    return {
      candidates,
      job,
      comparisonFields: ["name", "currentStage", "daysInStage", "source", "email"],
    };
  }

  async getInterviewPrepPacket(
    candidateId: string,
    applicationId?: string
  ): Promise<PrepPacket> {
    const [contextResult, scorecardResult, schedulesResult] = await Promise.allSettled([
      this.candidateService.getCandidateFullContext(candidateId),
      this.feedbackService.getCandidateScorecard(candidateId, applicationId),
      this.interviewService.getInterviewSchedulesForCandidate(candidateId),
    ]);

    if (contextResult.status === "rejected") {
      throw contextResult.reason;
    }

    const context = contextResult.value;
    const scorecard = scorecardResult.status === "fulfilled" ? scorecardResult.value : null;
    const schedules = schedulesResult.status === "fulfilled" ? schedulesResult.value : [];

    const { candidate, applications, notes } = context;

    // Get the active application's job
    const selectedApp = this.searchService.selectApplicationForRead(applications, applicationId);
    const job = selectedApp?.job ?? null;

    // Find upcoming interview
    const now = new Date();
    const upcomingEvents = schedules
      .flatMap((s) => s.interviewEvents)
      .filter((e) => new Date(e.startTime) > now)
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
    const upcomingInterview = upcomingEvents[0] ?? null;

    // Generate highlights from candidate data
    const highlights: string[] = [];
    if (candidate.source?.title) {
      highlights.push(`Source: ${candidate.source.title}`);
    }
    if (selectedApp?.currentInterviewStage) {
      highlights.push(`Current Stage: ${selectedApp.currentInterviewStage.title}`);
      highlights.push(`Days in Stage: ${selectedApp.daysInCurrentStage}`);
    }
    if (candidate.socialLinks.length > 0) {
      const linkedin = candidate.socialLinks.find((l) => l.type === "LinkedIn" || l.url.includes("linkedin"));
      if (linkedin) {
        highlights.push(`LinkedIn: ${linkedin.url}`);
      }
    }
    if (scorecard && scorecard.overallRating !== null) {
      highlights.push(`Interview Rating: ${scorecard.overallRating}/5 (${scorecard.feedbackCount} reviews)`);
    }

    return {
      candidate,
      job,
      highlights,
      priorFeedback: scorecard,
      upcomingInterview,
      notes,
      profileUrl: candidate.profileUrl,
    };
  }

  /**
   * Get a comprehensive interview briefing for an interviewer.
   * This is designed for the "@ashby I have an interview with [name]" use case.
   *
   * @param interviewerEmail - The email of the interviewer (typically from Slack user lookup)
   * @param candidateName - Optional candidate name to filter by
   * @returns Interview briefing with resume, notes, context, and interview details
   */
  async getInterviewBriefing(
    interviewerEmail: string,
    candidateName?: string
  ): Promise<InterviewBriefing | null> {
    // Step 1: Find the Ashby user by email
    const user = await this.interviewService.getUserByEmail(interviewerEmail);
    if (!user) {
      return null;
    }

    // Step 2: Find their upcoming interviews (optionally filtered by candidate name)
    const options: { candidateName?: string; limit?: number } = { limit: 1 };
    if (candidateName) {
      options.candidateName = candidateName;
    }
    const upcomingInterviews = await this.interviewService.getUpcomingInterviewsForUser(
      user.id,
      options
    );

    if (upcomingInterviews.length === 0) {
      return null;
    }

    const interview = upcomingInterviews[0]!;

    // Step 3: Get the application and candidate info
    const application = await this.client.getApplication(interview.applicationId);
    if (!application.candidate) {
      return null;
    }

    const candidateId = application.candidateId;

    // Step 4: Fetch prep packet and resume URL in parallel for performance
    const [prepPacket, resumeData] = await Promise.all([
      this.getInterviewPrepPacket(candidateId, interview.applicationId),
      this.candidateService.getResumeUrl(candidateId).catch(() => null),
    ]);

    // Step 5: Build the full briefing with interview-specific details
    return this.buildInterviewBriefing(prepPacket, interview, resumeData?.url ?? null);
  }

  /**
   * Get an interview briefing by candidate name or ID.
   * Alternative to getInterviewBriefing when you don't have interviewer context.
   *
   * @param candidateId - The candidate ID
   * @param applicationId - Optional specific application ID
   */
  async getInterviewBriefingForCandidate(
    candidateId: string,
    applicationId?: string
  ): Promise<InterviewBriefing> {
    // Fetch prep packet and resume URL in parallel for performance
    const [prepPacket, resumeData] = await Promise.all([
      this.getInterviewPrepPacket(candidateId, applicationId),
      this.candidateService.getResumeUrl(candidateId).catch(() => null),
    ]);

    // Build briefing from upcoming interview event if available
    const upcomingEvent = prepPacket.upcomingInterview;

    return {
      ...prepPacket,
      resumeUrl: resumeData?.url ?? null,
      interviewStageName: upcomingEvent?.title ?? null,
      scheduledTime: upcomingEvent?.startTime ?? null,
      scheduledEndTime: upcomingEvent?.endTime ?? null,
      meetingLink: upcomingEvent?.meetingLink ?? null,
      location: upcomingEvent?.location ?? null,
      interviewerNames: this.extractInterviewerNames(upcomingEvent?.interviewers),
    };
  }

  /**
   * Build an InterviewBriefing from a PrepPacket and Interview data.
   * Extracts all relevant interview details including meeting info and interviewers.
   */
  private buildInterviewBriefing(
    prepPacket: PrepPacket,
    interview: Interview,
    resumeUrl: string | null
  ): InterviewBriefing {
    // Get interviewer names from the interview record
    const interviewerNames = interview.interviewers
      .map((i) => i.user ? `${i.user.firstName} ${i.user.lastName}` : null)
      .filter((name): name is string => name !== null);

    return {
      ...prepPacket,
      resumeUrl,
      interviewStageName: interview.interviewStage?.title ?? null,
      scheduledTime: interview.scheduledStartTime ?? null,
      scheduledEndTime: interview.scheduledEndTime ?? null,
      // Interview doesn't have meetingLink directly, but InterviewEvent does
      // We'll use the upcoming interview event if available, otherwise null
      meetingLink: prepPacket.upcomingInterview?.meetingLink ?? null,
      location: prepPacket.upcomingInterview?.location ?? null,
      interviewerNames,
    };
  }

  /**
   * Extract interviewer names from User array.
   */
  private extractInterviewerNames(interviewers?: Array<{ firstName: string; lastName: string }>): string[] {
    if (!interviewers) return [];
    return interviewers.map((u) => `${u.firstName} ${u.lastName}`);
  }
}
