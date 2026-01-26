/**
 * Candidate Service
 *
 * Handles candidate creation, updates, tagging, and detailed context retrieval.
 */

import type { AshbyClient } from "../client.js";
import type {
  Application,
  ApplicationWithContext,
  Candidate,
  CreateCandidateParams,
  InterviewStage,
  Job,
  Note,
} from "../../types/index.js";

export class CandidateService {
  constructor(private readonly client: AshbyClient) {}

  async createCandidate(params: CreateCandidateParams): Promise<Candidate> {
    return this.client.createCandidate(params);
  }

  async updateCandidate(
    candidateId: string,
    updates: Partial<CreateCandidateParams>
  ): Promise<Candidate> {
    return this.client.updateCandidate(candidateId, updates);
  }

  async addCandidateTag(candidateId: string, tagId: string): Promise<Candidate> {
    return this.client.addCandidateTag(candidateId, tagId);
  }

  async listCandidateTags(): Promise<Array<{ id: string; title: string }>> {
    return this.client.listCandidateTags();
  }

  async isHiredCandidate(candidateId: string): Promise<boolean> {
    const { applications } = await this.client.getCandidateWithApplications(candidateId);

    return applications.some(
      (app) =>
        app.status === "Hired" ||
        app.currentInterviewStage?.title.toLowerCase().includes("hired")
    );
  }

  async getCandidateFullContext(candidateId: string): Promise<{
    candidate: Candidate;
    applications: ApplicationWithContext[];
    notes: Note[];
  }> {
    // Use Promise.allSettled for resilience - partial data is better than no data
    const [candidateResult, notesResult, stagesResult, jobsResult] = await Promise.allSettled([
      this.client.getCandidateWithApplications(candidateId),
      this.client.getCandidateNotes(candidateId),
      this.client.listInterviewStages(),
      this.client.listJobs(),
    ]);

    // Candidate data is required - throw if it fails
    if (candidateResult.status === "rejected") {
      throw candidateResult.reason;
    }
    const { candidate, applications } = candidateResult.value;

    // Notes, stages, and jobs are optional - use empty arrays on failure
    const notes = notesResult.status === "fulfilled" ? notesResult.value : [];
    const stages = stagesResult.status === "fulfilled" ? stagesResult.value : [];
    const jobs = jobsResult.status === "fulfilled" ? jobsResult.value : [];

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

  private enrichApplication(
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
      isStale: false, // Staleness is determined by PipelineService
    };
  }

  private calculateDaysInStage(app: Application): number {
    const updatedAt = new Date(app.updatedAt).getTime();
    const now = Date.now();
    return Math.floor((now - updatedAt) / (24 * 60 * 60 * 1000));
  }
}
