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
}
