/**
 * Ashby Service Layer
 *
 * Provides high-level operations built on top of the Ashby client.
 * Handles business logic like stale candidate detection and pipeline summaries.
 */

import { AshbyClient } from "./client.js";
import type { Config } from "../config/index.js";
import type {
  Application,
  Candidate,
  Job,
  InterviewStage,
  Note,
  ApplicationWithContext,
  PipelineSummary,
  DailySummaryData,
} from "../types/index.js";

export class AshbyService {
  private readonly client: AshbyClient;
  private readonly staleDays: number;

  constructor(config: Config) {
    this.client = new AshbyClient(config);
    this.staleDays = config.staleDays;
  }

  // ===========================================================================
  // Search & Discovery
  // ===========================================================================

  async searchCandidates(query: string): Promise<Candidate[]> {
    return this.client.searchCandidates(query);
  }

  async findCandidateByNameOrEmail(
    query: string
  ): Promise<Candidate | null> {
    const results = await this.client.searchCandidates(query);
    return results[0] ?? null;
  }

  // ===========================================================================
  // Candidate Details
  // ===========================================================================

  async getCandidateFullContext(candidateId: string): Promise<{
    candidate: Candidate;
    applications: ApplicationWithContext[];
    notes: Note[];
  }> {
    const [{ candidate, applications }, notes, stages, jobs] = await Promise.all([
      this.client.getCandidateWithApplications(candidateId),
      this.client.getCandidateNotes(candidateId),
      this.client.listInterviewStages(),
      this.client.listJobs(),
    ]);

    const stageMap = new Map(stages.map((s) => [s.id, s]));
    const jobMap = new Map(jobs.map((j) => [j.id, j]));

    const applicationsWithContext = applications.map((app) =>
      this.enrichApplication(app, stageMap, jobMap)
    );

    return {
      candidate,
      applications: applicationsWithContext,
      notes,
    };
  }

  // ===========================================================================
  // Pipeline Operations
  // ===========================================================================

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

    return {
      totalCandidates: applications.length,
      byStage: Array.from(byStage.entries())
        .map(([stageId, candidates]) => ({
          stage: stageMap.get(stageId)!,
          count: candidates.length,
          candidates,
        }))
        .sort((a, b) => a.stage.orderInInterviewPlan - b.stage.orderInInterviewPlan),
      byJob: Array.from(byJob.entries())
        .map(([jobId, candidates]) => ({
          job: jobMap.get(jobId)!,
          count: candidates.length,
          candidates,
        }))
        .filter((j) => j.job) // Filter out jobs not in our map (closed jobs)
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

  // ===========================================================================
  // Job Operations
  // ===========================================================================

  async getOpenJobs(): Promise<Job[]> {
    return this.client.getOpenJobs();
  }

  async getJobWithCandidates(jobId: string): Promise<{
    job: Job;
    candidates: ApplicationWithContext[];
  }> {
    const [job, applications, stages, jobs] = await Promise.all([
      this.client.getJob(jobId),
      this.client.getApplicationsForJob(jobId),
      this.client.listInterviewStages(),
      this.client.listJobs(),
    ]);

    const stageMap = new Map(stages.map((s) => [s.id, s]));
    const jobMap = new Map(jobs.map((j) => [j.id, j]));

    const candidates = applications.map((app) =>
      this.enrichApplication(app, stageMap, jobMap)
    );

    return { job, candidates };
  }

  // ===========================================================================
  // Write Operations
  // ===========================================================================

  async addNote(
    candidateId: string,
    content: string
  ): Promise<Note> {
    return this.client.addNote(candidateId, content);
  }

  async moveToStage(
    applicationId: string,
    stageId: string
  ): Promise<Application> {
    return this.client.moveApplicationStage(applicationId, stageId);
  }

  async findStageByName(stageName: string): Promise<InterviewStage | null> {
    const stages = await this.client.listInterviewStages();
    const normalizedName = stageName.toLowerCase().trim();

    return stages.find((s) =>
      s.title.toLowerCase().includes(normalizedName)
    ) ?? null;
  }

  // ===========================================================================
  // Interview Scheduling Operations
  // ===========================================================================

  async listInterviewPlans() {
    return this.client.listInterviewPlans();
  }

  async getInterviewSchedulesForCandidate(candidateId: string) {
    const { applications } = await this.client.getCandidateWithApplications(
      candidateId
    );

    // Get schedules for all applications
    const schedules = await Promise.all(
      applications.map((app) => this.client.listInterviewSchedules(app.id))
    );

    return schedules.flat();
  }

  async scheduleInterview(
    candidateId: string,
    startTime: string,
    endTime: string,
    interviewerIds: string[],
    meetingLink?: string,
    location?: string
  ) {
    const { applications } = await this.client.getCandidateWithApplications(
      candidateId
    );
    const activeApp = applications.find((a) => a.status === "Active");

    if (!activeApp) {
      throw new Error("No active application found for this candidate");
    }

    const event: {
      startTime: string;
      endTime: string;
      interviewerIds: string[];
      location?: string;
      meetingLink?: string;
    } = {
      startTime,
      endTime,
      interviewerIds,
    };

    if (meetingLink) event.meetingLink = meetingLink;
    if (location) event.location = location;

    return this.client.createInterviewSchedule(activeApp.id, [event]);
  }

  // ===========================================================================
  // Daily Summary
  // ===========================================================================

  async getDailySummaryData(): Promise<DailySummaryData> {
    const [staleCandidates, needsDecision, summary, recentApps] = await Promise.all([
      this.getStaleCandidates(5),
      this.getCandidatesNeedingDecision(5),
      this.getPipelineSummary(),
      this.getRecentApplications(1),
    ]);

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
        totalActive: summary.totalCandidates,
        openRoles: summary.byJob.length,
        newApplications: recentApps.length,
      },
    };
  }

  // ===========================================================================
  // Hired Candidate Protection
  // ===========================================================================

  async isHiredCandidate(candidateId: string): Promise<boolean> {
    const { applications } = await this.client.getCandidateWithApplications(
      candidateId
    );

    return applications.some(
      (app) =>
        app.status === "Hired" ||
        app.currentInterviewStage?.title.toLowerCase().includes("hired")
    );
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  private enrichApplication(
    app: Application,
    stageMap: Map<string, InterviewStage>,
    jobMap: Map<string, Job>
  ): ApplicationWithContext {
    const stage = app.currentInterviewStageId
      ? stageMap.get(app.currentInterviewStageId) ?? null
      : null;
    const job = jobMap.get(app.jobId);
    const daysInCurrentStage = this.calculateDaysInStage(app);

    return {
      ...app,
      job: job!,
      candidate: app.candidate!,
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
