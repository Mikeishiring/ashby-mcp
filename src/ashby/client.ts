/**
 * Ashby API Client
 *
 * Handles all communication with the Ashby REST API.
 * Provides typed methods for common operations with built-in caching.
 */

import type { Config } from "../config/index.js";
import type {
  Candidate,
  Application,
  Job,
  InterviewStage,
  Note,
  PaginatedResponse,
  ApiResponse,
  ApplicationStatus,
  JobStatus,
} from "../types/index.js";

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

export class AshbyClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly cache: Map<string, CacheEntry<unknown>> = new Map();

  // Cache TTLs in milliseconds
  private static readonly CACHE_TTL = {
    jobs: 5 * 60 * 1000, // 5 minutes
    stages: 10 * 60 * 1000, // 10 minutes
    candidates: 60 * 1000, // 1 minute
  } as const;

  constructor(config: Config) {
    this.baseUrl = config.ashby.baseUrl;
    this.apiKey = config.ashby.apiKey;
  }

  // ===========================================================================
  // HTTP Layer
  // ===========================================================================

  private async request<T>(
    endpoint: string,
    body?: Record<string, unknown>
  ): Promise<T> {
    const url = `${this.baseUrl}/${endpoint}`;
    const auth = Buffer.from(`${this.apiKey}:`).toString("base64");

    const fetchOptions: RequestInit = {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
    };

    if (body) {
      fetchOptions.body = JSON.stringify(body);
    }

    const response = await fetch(url, fetchOptions);

    if (!response.ok) {
      const errorText = await response.text();
      throw new AshbyApiError(
        `Ashby API error: ${response.status} ${response.statusText}`,
        response.status,
        errorText
      );
    }

    const data = (await response.json()) as ApiResponse<T>;

    if (!data.success) {
      const errors = data.errors?.map((e) => e.message).join(", ") ?? "Unknown error";
      throw new AshbyApiError(`Ashby API returned error: ${errors}`, 400);
    }

    return data.results as T;
  }

  private async getAllPaginated<T>(
    endpoint: string,
    params?: Record<string, unknown>
  ): Promise<T[]> {
    const allResults: T[] = [];
    let cursor: string | undefined;

    do {
      const body = { ...params, cursor };
      const response = await this.request<PaginatedResponse<T>>(endpoint, body);

      allResults.push(...response.results);
      cursor = response.moreDataAvailable ? response.nextCursor : undefined;
    } while (cursor);

    return allResults;
  }

  private getCached<T>(key: string): T | null {
    const entry = this.cache.get(key) as CacheEntry<T> | undefined;
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return entry.data;
  }

  private setCache<T>(key: string, data: T, ttl: number): void {
    this.cache.set(key, {
      data,
      expiresAt: Date.now() + ttl,
    });
  }

  clearCache(): void {
    this.cache.clear();
  }

  // ===========================================================================
  // Candidates
  // ===========================================================================

  async searchCandidates(query: string): Promise<Candidate[]> {
    return this.request<Candidate[]>("candidate.search", {
      email: query.includes("@") ? query : undefined,
      name: !query.includes("@") ? query : undefined,
    });
  }

  async getCandidate(candidateId: string): Promise<Candidate> {
    return this.request<Candidate>("candidate.info", { candidateId });
  }

  async listCandidates(): Promise<Candidate[]> {
    const cacheKey = "candidates:all";
    const cached = this.getCached<Candidate[]>(cacheKey);
    if (cached) return cached;

    const results = await this.getAllPaginated<Candidate>("candidate.list");
    this.setCache(cacheKey, results, AshbyClient.CACHE_TTL.candidates);
    return results;
  }

  // ===========================================================================
  // Applications
  // ===========================================================================

  async getApplication(applicationId: string): Promise<Application> {
    return this.request<Application>("application.info", { applicationId });
  }

  async listApplications(
    filters?: {
      status?: ApplicationStatus;
      jobId?: string;
      interviewStageId?: string;
    }
  ): Promise<Application[]> {
    return this.getAllPaginated<Application>("application.list", filters);
  }

  async moveApplicationStage(
    applicationId: string,
    interviewStageId: string
  ): Promise<Application> {
    return this.request<Application>("application.move", {
      applicationId,
      interviewStageId,
    });
  }

  // ===========================================================================
  // Jobs
  // ===========================================================================

  async getJob(jobId: string): Promise<Job> {
    return this.request<Job>("job.info", { jobId });
  }

  async listJobs(status?: JobStatus): Promise<Job[]> {
    const cacheKey = `jobs:${status ?? "all"}`;
    const cached = this.getCached<Job[]>(cacheKey);
    if (cached) return cached;

    const results = await this.getAllPaginated<Job>("job.list", { status });
    this.setCache(cacheKey, results, AshbyClient.CACHE_TTL.jobs);
    return results;
  }

  async getOpenJobs(): Promise<Job[]> {
    return this.listJobs("Open");
  }

  // ===========================================================================
  // Interview Stages
  // ===========================================================================

  async listInterviewStages(): Promise<InterviewStage[]> {
    const cacheKey = "stages:all";
    const cached = this.getCached<InterviewStage[]>(cacheKey);
    if (cached) return cached;

    const results = await this.getAllPaginated<InterviewStage>(
      "interviewStage.list"
    );
    this.setCache(cacheKey, results, AshbyClient.CACHE_TTL.stages);
    return results;
  }

  async getInterviewStage(stageId: string): Promise<InterviewStage> {
    return this.request<InterviewStage>("interviewStage.info", {
      interviewStageId: stageId,
    });
  }

  // ===========================================================================
  // Notes
  // ===========================================================================

  async getCandidateNotes(candidateId: string): Promise<Note[]> {
    return this.request<Note[]>("note.list", { candidateId });
  }

  async addNote(
    candidateId: string,
    content: string,
    visibility: "Private" | "Public" = "Public"
  ): Promise<Note> {
    // Auto-tag notes from the bot
    const timestamp = new Date().toISOString();
    const taggedContent = `[via Slack Bot - ${timestamp}]\n\n${content}`;

    return this.request<Note>("note.create", {
      candidateId,
      content: taggedContent,
      visibility,
    });
  }

  // ===========================================================================
  // Composite Operations
  // ===========================================================================

  async getApplicationsForJob(jobId: string): Promise<Application[]> {
    return this.listApplications({ jobId, status: "Active" });
  }

  async getApplicationsByStage(stageId: string): Promise<Application[]> {
    return this.listApplications({ interviewStageId: stageId, status: "Active" });
  }

  async getCandidateWithApplications(candidateId: string): Promise<{
    candidate: Candidate;
    applications: Application[];
  }> {
    const candidate = await this.getCandidate(candidateId);
    const applications = await Promise.all(
      candidate.applicationIds.map((id) => this.getApplication(id))
    );
    return { candidate, applications };
  }
}

/**
 * Custom error class for Ashby API errors
 */
export class AshbyApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly responseBody?: string
  ) {
    super(message);
    this.name = "AshbyApiError";
  }
}
