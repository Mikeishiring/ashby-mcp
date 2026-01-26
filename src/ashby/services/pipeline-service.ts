/**
 * Pipeline Service
 *
 * Handles pipeline overview, stale candidates, and daily summaries.
 */

import type { AshbyClient } from "../client.js";
import type {
  Application,
  ApplicationWithContext,
  Candidate,
  DailySummaryData,
  InterviewStage,
  Job,
  PipelineSummary,
} from "../../types/index.js";

export class PipelineService {
  constructor(
    private readonly client: AshbyClient,
    private readonly staleDays: number
  ) {}

  async getPipelineSummary(): Promise<PipelineSummary> {
    const [applications, stages, jobs] = await Promise.all([
      this.client.listApplications({ status: "Active" }),
      this.client.listInterviewStages(),
      this.client.getOpenJobs(),
    ]);

    const stageMap = new Map(stages.map((s) => [s.id, s]));
    const jobMap = new Map(jobs.map((j) => [j.id, j]));

    const enrichedApps = applications.map((app) =>
      this.enrichApplication(app, stageMap, jobMap)
    );

    // Group by stage
    const byStage = new Map<string, ApplicationWithContext[]>();
    for (const app of enrichedApps) {
      if (!app.currentInterviewStage) continue;
      const stageId = app.currentInterviewStage.id;
      if (!byStage.has(stageId)) {
        byStage.set(stageId, []);
      }
      byStage.get(stageId)!.push(app);
    }

    // Group by job
    const byJob = new Map<string, ApplicationWithContext[]>();
    for (const app of enrichedApps) {
      const jobId = app.jobId;
      if (!byJob.has(jobId)) {
        byJob.set(jobId, []);
      }
      byJob.get(jobId)!.push(app);
    }

    const staleCount = enrichedApps.filter((a) => a.isStale).length;
    const needsDecisionCount = enrichedApps.filter((a) =>
      this.needsDecision(a)
    ).length;

    // Create fallback stage for unknown stages
    const fallbackStage: InterviewStage = {
      id: "unknown",
      title: "Unknown Stage",
      orderInInterviewPlan: 999,
      interviewStageType: "Interview",
    };

    // Create fallback job for unknown jobs
    const fallbackJob: Job = {
      id: "unknown",
      title: "Unknown Position",
      status: "Closed",
      employmentType: "Unknown",
      hiringTeam: [],
      jobPostings: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    return {
      totalCandidates: applications.length,
      byStage: Array.from(byStage.entries())
        .map(([stageId, candidates]) => ({
          stage: stageMap.get(stageId) ?? { ...fallbackStage, id: stageId },
          count: candidates.length,
          candidates,
        }))
        .sort((a, b) => a.stage.orderInInterviewPlan - b.stage.orderInInterviewPlan),
      byJob: Array.from(byJob.entries())
        .map(([jobId, candidates]) => ({
          job: jobMap.get(jobId) ?? { ...fallbackJob, id: jobId },
          count: candidates.length,
          candidates,
        }))
        .sort((a, b) => a.job.title.localeCompare(b.job.title)),
      staleCount,
      needsDecisionCount,
    };
  }

  async getStaleCandidates(limit: number = 10): Promise<ApplicationWithContext[]> {
    const [applications, stages, jobs] = await Promise.all([
      this.client.listApplications({ status: "Active" }),
      this.client.listInterviewStages(),
      this.client.listJobs(),
    ]);

    const stageMap = new Map(stages.map((s) => [s.id, s]));
    const jobMap = new Map(jobs.map((j) => [j.id, j]));

    return applications
      .map((app) => this.enrichApplication(app, stageMap, jobMap))
      .filter((app) => app.isStale)
      .sort((a, b) => b.daysInCurrentStage - a.daysInCurrentStage)
      .slice(0, limit);
  }

  async getCandidatesNeedingDecision(limit: number = 10): Promise<ApplicationWithContext[]> {
    const [applications, stages, jobs] = await Promise.all([
      this.client.listApplications({ status: "Active" }),
      this.client.listInterviewStages(),
      this.client.listJobs(),
    ]);

    const stageMap = new Map(stages.map((s) => [s.id, s]));
    const jobMap = new Map(jobs.map((j) => [j.id, j]));

    return applications
      .map((app) => this.enrichApplication(app, stageMap, jobMap))
      .filter((app) => this.needsDecision(app))
      .sort((a, b) => b.daysInCurrentStage - a.daysInCurrentStage)
      .slice(0, limit);
  }

  async getRecentApplications(days: number = 7): Promise<ApplicationWithContext[]> {
    const [applications, stages, jobs] = await Promise.all([
      this.client.listApplications({ status: "Active" }),
      this.client.listInterviewStages(),
      this.client.listJobs(),
    ]);

    const stageMap = new Map(stages.map((s) => [s.id, s]));
    const jobMap = new Map(jobs.map((j) => [j.id, j]));
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

    return applications
      .filter((app) => new Date(app.createdAt).getTime() > cutoff)
      .map((app) => this.enrichApplication(app, stageMap, jobMap))
      .sort((a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
  }

  async getDailySummaryData(): Promise<DailySummaryData> {
    // Use allSettled to ensure partial data is returned even if some calls fail
    const [staleResult, decisionResult, summaryResult, recentResult] = await Promise.allSettled([
      this.getStaleCandidates(5),
      this.getCandidatesNeedingDecision(5),
      this.getPipelineSummary(),
      this.getRecentApplications(1),
    ]);

    // Extract successful results with empty fallbacks
    const staleCandidates = staleResult.status === "fulfilled" ? staleResult.value : [];
    const needsDecision = decisionResult.status === "fulfilled" ? decisionResult.value : [];
    const summary = summaryResult.status === "fulfilled" ? summaryResult.value : null;
    const recentApps = recentResult.status === "fulfilled" ? recentResult.value : [];

    return {
      staleCandidate: staleCandidates.map((app) => ({
        name: app.candidate?.name ?? "Unknown",
        email: app.candidate?.primaryEmailAddress?.value ?? "No email",
        stage: app.currentInterviewStage?.title ?? "Unknown",
        job: app.job?.title ?? "Unknown",
        daysInStage: app.daysInCurrentStage,
      })),
      needsDecision: needsDecision.map((app) => ({
        name: app.candidate?.name ?? "Unknown",
        email: app.candidate?.primaryEmailAddress?.value ?? "No email",
        stage: app.currentInterviewStage?.title ?? "Unknown",
        job: app.job?.title ?? "Unknown",
        daysWaiting: app.daysInCurrentStage,
      })),
      stats: {
        totalActive: summary?.totalCandidates ?? 0,
        openRoles: summary?.byJob.length ?? 0,
        newApplications: recentApps.length,
      },
    };
  }

  /**
   * Enrich an application with computed context
   */
  enrichApplication(
    app: Application,
    stageMap: Map<string, InterviewStage>,
    jobMap: Map<string, Job>
  ): ApplicationWithContext {
    const stage =
      app.currentInterviewStage ??
      (app.currentInterviewStageId
        ? stageMap.get(app.currentInterviewStageId) ?? null
        : null);
    const job = jobMap.get(app.jobId);
    const daysInCurrentStage = this.calculateDaysInStage(app);

    // Create fallback job if not found in map
    const fallbackJob: Job = {
      id: app.jobId,
      title: "Unknown Position",
      status: "Closed",
      employmentType: "Unknown",
      hiringTeam: [],
      jobPostings: [],
      createdAt: app.createdAt,
      updatedAt: app.updatedAt,
    };

    // Create fallback candidate if not embedded in application
    const fallbackCandidate: Candidate = {
      id: app.candidateId,
      name: "Unknown Candidate",
      primaryEmailAddress: null,
      phoneNumbers: [],
      socialLinks: [],
      tags: [],
      createdAt: app.createdAt,
      updatedAt: app.updatedAt,
      applicationIds: [app.id],
      profileUrl: "",
    };

    return {
      ...app,
      job: job ?? fallbackJob,
      candidate: app.candidate ?? fallbackCandidate,
      currentInterviewStage: stage,
      daysInCurrentStage,
      isStale: this.isStale(app, stage, daysInCurrentStage),
    };
  }

  private calculateDaysInStage(app: Application): number {
    const updatedAt = new Date(app.updatedAt).getTime();
    const now = Date.now();
    return Math.floor((now - updatedAt) / (24 * 60 * 60 * 1000));
  }

  private isStale(
    _app: Application,
    stage: InterviewStage | null,
    daysInStage: number
  ): boolean {
    // Application Review stage is expected to have backlog - don't flag as stale
    if (stage?.title.toLowerCase().includes("application review")) {
      return false;
    }
    return daysInStage > this.staleDays;
  }

  private needsDecision(app: ApplicationWithContext): boolean {
    const stage = app.currentInterviewStage;
    if (!stage) return false;

    // Final round stages typically need decisions
    const decisionStages = ["final", "offer", "decision", "reference"];
    return decisionStages.some((s) =>
      stage.title.toLowerCase().includes(s)
    );
  }
}
