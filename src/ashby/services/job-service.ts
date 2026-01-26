/**
 * Job Service
 *
 * Handles job operations including listing, stages, and applications.
 */

import type { AshbyClient } from "../client.js";
import type { PipelineService } from "./pipeline-service.js";
import type {
  ApplicationWithContext,
  ArchiveReason,
  InterviewStage,
  Job,
} from "../../types/index.js";

export class JobService {
  constructor(
    private readonly client: AshbyClient,
    private readonly pipelineService: PipelineService
  ) {}

  async getOpenJobs(): Promise<Job[]> {
    return this.client.getOpenJobs();
  }

  async getJob(jobId: string): Promise<Job> {
    return this.client.getJob(jobId);
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
      this.pipelineService.enrichApplication(app, stageMap, jobMap)
    );

    return { job, candidates };
  }

  async findStageByName(stageName: string): Promise<InterviewStage | null> {
    const stages = await this.client.listInterviewStages();
    const normalizedName = stageName.toLowerCase().trim();

    return stages.find((s) =>
      s.title.toLowerCase().includes(normalizedName)
    ) ?? null;
  }

  async getArchiveReasons(): Promise<ArchiveReason[]> {
    return this.client.listArchiveReasons();
  }

  async listSources(): Promise<Array<{ id: string; title: string }>> {
    return this.client.listSources();
  }

  async listHiringTeamRoles(): Promise<Array<{ id: string; label: string }>> {
    return this.client.listHiringTeamRoles();
  }

  async getApplicationHiringTeam(applicationId: string): Promise<Array<{
    userId: string;
    roleId: string;
    role: { id: string; label: string };
  }>> {
    return this.client.listApplicationHiringTeam(applicationId);
  }

  async listCustomFields(): Promise<Array<{ id: string; title: string; fieldType: string }>> {
    return this.client.listCustomFields();
  }

  async listLocations(): Promise<Array<{ id: string; name: string }>> {
    return this.client.listLocations();
  }

  async listDepartments(): Promise<Array<{ id: string; name: string }>> {
    return this.client.listDepartments();
  }

  async getApplicationHistory(applicationId: string): Promise<Array<Record<string, unknown>>> {
    return this.client.getApplicationHistory(applicationId);
  }

  async getInterviewStageDetails(interviewStageId: string): Promise<InterviewStage | null> {
    return this.client.getInterviewStage(interviewStageId);
  }
}
