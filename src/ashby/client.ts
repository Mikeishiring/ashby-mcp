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
  InterviewPlan,
  InterviewSchedule,
  Interview,
  InterviewEvent,
  Note,
  User,
  FeedbackSubmission,
  ArchiveReason,
  Offer,
  OfferStatus,
  PaginatedResponse,
  ApiResponse,
  ApplicationStatus,
  JobStatus,
  CreateCandidateParams,
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

  private static readonly REQUEST_TIMEOUT_MS = 15000;
  private static readonly MAX_RETRIES = 2;
  private static readonly RETRY_BASE_DELAY_MS = 500;

  constructor(config: Config) {
    this.baseUrl = config.ashby.baseUrl;
    this.apiKey = config.ashby.apiKey;
  }

  // ===========================================================================
  // HTTP Layer
  // ===========================================================================

  private async postJson(
    endpoint: string,
    body?: Record<string, unknown>
  ): Promise<Response> {
    const url = `${this.baseUrl}/${endpoint}`;
    const auth = Buffer.from(`${this.apiKey}:`).toString("base64");
    const isRead = this.isReadEndpoint(endpoint);

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

    const maxRetries = isRead ? AshbyClient.MAX_RETRIES : 0;

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      const controller = new globalThis.AbortController();
      const timeoutId = setTimeout(() => controller.abort(), AshbyClient.REQUEST_TIMEOUT_MS);

      try {
        const response = await fetch(url, { ...fetchOptions, signal: controller.signal });
        clearTimeout(timeoutId);

        if (response.ok) {
          return response;
        }

        if (this.shouldRetryStatus(response.status, isRead) && attempt < maxRetries) {
          await this.backoff(attempt);
          continue;
        }

        return response;
      } catch (error) {
        clearTimeout(timeoutId);
        if (this.shouldRetryError(error, isRead) && attempt < maxRetries) {
          await this.backoff(attempt);
          continue;
        }
        throw error;
      }
    }

    throw new Error("Request failed after retries");
  }

  private isReadEndpoint(endpoint: string): boolean {
    return [".list", ".info", ".search"].some((token) => endpoint.includes(token));
  }

  private shouldRetryStatus(status: number, isRead: boolean): boolean {
    if (!isRead) return false;
    return status === 429 || (status >= 500 && status < 600);
  }

  private shouldRetryError(error: unknown, isRead: boolean): boolean {
    if (!isRead) return false;
    if (error instanceof Error && error.name === "AbortError") {
      return true;
    }
    return error instanceof TypeError;
  }

  private async backoff(attempt: number): Promise<void> {
    const delay = AshbyClient.RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  private async request<T>(
    endpoint: string,
    body?: Record<string, unknown>
  ): Promise<T> {
    console.log(`[Ashby] Requesting ${endpoint}...`);

    try {
      const response = await this.postJson(endpoint, body);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[Ashby] API error ${response.status}: ${errorText}`);
        throw new AshbyApiError(
          `Ashby API error: ${response.status} ${response.statusText}`,
          response.status,
          errorText
        );
      }

      const data = (await response.json()) as ApiResponse<T>;

      if (!data.success) {
        const errors = data.errors?.map((e) => e.message).join(", ") ?? "Unknown error";
        console.error(`[Ashby] API returned error: ${errors}`);
        throw new AshbyApiError(`Ashby API returned error: ${errors}`, 400);
      }

      console.log(`[Ashby] ${endpoint} succeeded`);
      return data.results as T;
    } catch (error) {
      if (error instanceof AshbyApiError) {
        throw error;
      }
      console.error(`[Ashby] Network error for ${endpoint}:`, error);
      throw error;
    }
  }

  private async getAllPaginated<T>(
    endpoint: string,
    params?: Record<string, unknown>
  ): Promise<T[]> {
    const allResults: T[] = [];
    let cursor: string | undefined;

    do {
      const body = { ...params, cursor };
      const response = await this.requestPaginated<T>(endpoint, body);

      allResults.push(...response.results);
      cursor = response.moreDataAvailable ? response.nextCursor : undefined;
    } while (cursor);

    return allResults;
  }

  /**
   * Make a paginated request that preserves pagination metadata.
   * Unlike request<T>, this returns the full paginated response structure.
   */
  private async requestPaginated<T>(
    endpoint: string,
    body?: Record<string, unknown>
  ): Promise<PaginatedResponse<T>> {
    console.log(`[Ashby] Requesting ${endpoint}...`);
    const response = await this.postJson(endpoint, body);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Ashby] API error ${response.status}: ${errorText}`);
      throw new AshbyApiError(
        `Ashby API error: ${response.status} ${response.statusText}`,
        response.status,
        errorText
      );
    }

    // For paginated endpoints, the response structure is:
    // { success: true, results: [...], moreDataAvailable: bool, nextCursor?: string }
    const data = await response.json() as {
      success: boolean;
      results: T[];
      moreDataAvailable: boolean;
      nextCursor?: string;
      errors?: Array<{ message: string }>;
    };

    if (!data.success) {
      const errors = data.errors?.map((e) => e.message).join(", ") ?? "Unknown error";
      console.error(`[Ashby] API returned error: ${errors}`);
      throw new AshbyApiError(`Ashby API returned error: ${errors}`, 400);
    }

    console.log(`[Ashby] ${endpoint} succeeded`);
    const result: PaginatedResponse<T> = {
      results: data.results,
      moreDataAvailable: data.moreDataAvailable,
    };
    if (data.nextCursor) {
      result.nextCursor = data.nextCursor;
    }
    return result;
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
    return this.request<Application>("application.changeStage", {
      applicationId,
      interviewStageId,
    });
  }

  async createApplication(params: {
    candidateId: string;
    jobId: string;
    sourceId?: string;
    creditedToUserId?: string;
  }): Promise<Application> {
    return this.request<Application>("application.create", params);
  }

  async transferApplication(
    applicationId: string,
    jobId: string
  ): Promise<Application> {
    return this.request<Application>("application.transfer", {
      applicationId,
      jobId,
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

    // Ashby API doesn't support status filter directly, so we fetch all and filter client-side
    const allJobs = await this.getAllPaginated<Job>("job.list");
    const results = status ? allJobs.filter(job => job.status === status) : allJobs;
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

    const stageMap = new Map<string, InterviewStage>();

    // Prefer interview plans to build a complete stage list without relying on active applications.
    const plans = await this.listInterviewPlans();
    for (const plan of plans) {
      for (const stage of plan.interviewStages) {
        if (stage?.id) {
          stageMap.set(stage.id, stage);
        }
      }
    }

    if (stageMap.size === 0) {
      // Fallback: extract unique stages from active applications.
      const applications = await this.getAllPaginated<Application>("application.list", { status: "Active" });
      for (const app of applications) {
        if (app.currentInterviewStage && !stageMap.has(app.currentInterviewStage.id)) {
          stageMap.set(app.currentInterviewStage.id, app.currentInterviewStage);
        }
      }
    }

    const results = Array.from(stageMap.values());
    this.setCache(cacheKey, results, AshbyClient.CACHE_TTL.stages);
    return results;
  }

  async getInterviewStage(stageId: string): Promise<InterviewStage | null> {
    // Get stage from the cached list
    const stages = await this.listInterviewStages();
    return stages.find(s => s.id === stageId) ?? null;
  }

  // ===========================================================================
  // Interview Scheduling
  // ===========================================================================

  async listInterviewPlans(): Promise<InterviewPlan[]> {
    const cacheKey = "interviewPlans:all";
    const cached = this.getCached<InterviewPlan[]>(cacheKey);
    if (cached) return cached;

    const results = await this.request<{ interviewPlans: InterviewPlan[] }>(
      "interviewPlan.list",
      { includeArchived: false }
    );
    const plans = results.interviewPlans;
    this.setCache(cacheKey, plans, AshbyClient.CACHE_TTL.stages);
    return plans;
  }

  async createInterviewSchedule(
    applicationId: string,
    interviewEvents: Array<{
      startTime: string;
      endTime: string;
      interviewerIds: string[];
      location?: string;
      meetingLink?: string;
    }>
  ): Promise<InterviewSchedule> {
    return this.request<InterviewSchedule>("interviewSchedule.create", {
      applicationId,
      interviewEvents,
    });
  }

  async listInterviewSchedules(
    applicationId?: string
  ): Promise<InterviewSchedule[]> {
    const params = applicationId ? { applicationId } : {};
    return this.getAllPaginated<InterviewSchedule>(
      "interviewSchedule.list",
      params
    );
  }

  // ===========================================================================
  // Users & Team
  // ===========================================================================

  async listUsers(): Promise<User[]> {
    const cacheKey = "users:all";
    const cached = this.getCached<User[]>(cacheKey);
    if (cached) return cached;

    const results = await this.getAllPaginated<User>("user.list");
    this.setCache(cacheKey, results, AshbyClient.CACHE_TTL.stages);
    return results;
  }

  // ===========================================================================
  // Notes
  // ===========================================================================

  async getCandidateNotes(candidateId: string): Promise<Note[]> {
    return this.request<Note[]>("candidate.listNotes", { candidateId });
  }

  async addNote(
    candidateId: string,
    content: string,
    visibility: "Private" | "Public" = "Public"
  ): Promise<Note> {
    // Auto-tag notes from the bot
    const timestamp = new Date().toISOString();
    const taggedContent = `[via Slack Bot - ${timestamp}]\n\n${content}`;

    return this.request<Note>("candidate.createNote", {
      candidateId,
      content: taggedContent,
      visibility,
    });
  }

  // ===========================================================================
  // Interview Feedback
  // ===========================================================================

  async getApplicationFeedback(applicationId: string): Promise<FeedbackSubmission[]> {
    const result = await this.request<{ feedbackSubmissions: FeedbackSubmission[] }>(
      "applicationFeedback.list",
      { applicationId }
    );
    return result.feedbackSubmissions ?? [];
  }

  // ===========================================================================
  // Archive / Rejection
  // ===========================================================================

  async listArchiveReasons(): Promise<ArchiveReason[]> {
    const cacheKey = "archiveReasons:all";
    const cached = this.getCached<ArchiveReason[]>(cacheKey);
    if (cached) return cached;

    const result = await this.request<{ archiveReasons: ArchiveReason[] }>(
      "archiveReason.list",
      {}
    );
    const reasons = result.archiveReasons ?? [];
    this.setCache(cacheKey, reasons, AshbyClient.CACHE_TTL.stages);
    return reasons;
  }

  async archiveApplication(
    applicationId: string,
    archiveReasonId: string
  ): Promise<Application> {
    return this.request<Application>("application.changeStage", {
      applicationId,
      archiveReasonId,
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

  // ===========================================================================
  // Candidate Creation & Updates
  // ===========================================================================

  async createCandidate(params: CreateCandidateParams): Promise<Candidate> {
    return this.request<Candidate>("candidate.create", params as unknown as Record<string, unknown>);
  }

  async updateCandidate(
    candidateId: string,
    updates: Partial<CreateCandidateParams>
  ): Promise<Candidate> {
    return this.request<Candidate>("candidate.update", {
      candidateId,
      ...updates,
    });
  }

  async addCandidateTag(candidateId: string, tagId: string): Promise<Candidate> {
    return this.request<Candidate>("candidate.addTag", {
      candidateId,
      tagId,
    });
  }

  async listCandidateTags(): Promise<Array<{ id: string; title: string }>> {
    const response = await this.request<{ candidateTags: Array<{ id: string; title: string }> }>(
      "candidateTag.list",
      {}
    );
    return response.candidateTags;
  }

  // ===========================================================================
  // Interviews
  // ===========================================================================

  async listInterviews(filters?: {
    applicationId?: string;
    userId?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<Interview[]> {
    return this.getAllPaginated<Interview>("interview.list", filters);
  }

  async getInterview(interviewId: string): Promise<Interview> {
    return this.request<Interview>("interview.info", { interviewId });
  }

  async updateInterviewSchedule(
    interviewScheduleId: string,
    interviewEvents: Array<{
      startTime: string;
      endTime: string;
      interviewerIds: string[];
      location?: string;
      meetingLink?: string;
    }>
  ): Promise<InterviewSchedule> {
    return this.request<InterviewSchedule>("interviewSchedule.update", {
      interviewScheduleId,
      interviewEvents,
    });
  }

  async cancelInterviewSchedule(
    interviewScheduleId: string,
    cancellationReason?: string
  ): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>("interviewSchedule.cancel", {
      interviewScheduleId,
      cancellationReason,
    });
  }

  // ===========================================================================
  // Feedback
  // ===========================================================================

  async listFeedbackSubmissions(filters?: {
    applicationId?: string;
    interviewId?: string;
    authorId?: string;
  }): Promise<FeedbackSubmission[]> {
    return this.getAllPaginated<FeedbackSubmission>(
      "feedbackSubmission.list",
      filters
    );
  }

  // ===========================================================================
  // Offers
  // ===========================================================================

  async listOffers(filters?: {
    applicationId?: string;
    status?: OfferStatus;
  }): Promise<Offer[]> {
    return this.getAllPaginated<Offer>("offer.list", filters);
  }

  async getOffer(offerId: string): Promise<Offer> {
    return this.request<Offer>("offer.info", { offerId });
  }

  async createOffer(params: {
    applicationId: string;
    offerProcessId: string;
    startDate: string;
    salary: number;
    salaryFrequency?: "Annual" | "Hourly";
    currency?: string;
    equity?: number;
    equityType?: string;
    signingBonus?: number;
    relocationBonus?: number;
    variableCompensation?: number;
    notes?: string;
  }): Promise<Offer> {
    return this.request<Offer>("offer.create", params);
  }

  async updateOffer(
    offerId: string,
    updates: {
      salary?: number;
      startDate?: string;
      equity?: number;
      signingBonus?: number;
      relocationBonus?: number;
      variableCompensation?: number;
      notes?: string;
    }
  ): Promise<Offer> {
    return this.request<Offer>("offer.update", {
      offerId,
      ...updates,
    });
  }

  async approveOffer(offerId: string, approverId: string): Promise<Offer> {
    return this.request<Offer>("offer.approve", {
      offerId,
      approverId,
    });
  }

  async startOffer(offerId: string): Promise<Offer> {
    return this.request<Offer>("offer.start", { offerId });
  }

  async startOfferProcess(
    applicationId: string,
    offerProcessId: string
  ): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>("offerProcess.start", {
      applicationId,
      offerProcessId,
    });
  }

  // ===========================================================================
  // Sources
  // ===========================================================================

  async listSources(): Promise<Array<{ id: string; title: string }>> {
    const response = await this.request<{ sources: Array<{ id: string; title: string }> }>(
      "source.list",
      {}
    );
    return response.sources;
  }

  // ===========================================================================
  // Hiring Team
  // ===========================================================================

  async listHiringTeamRoles(): Promise<Array<{ id: string; label: string }>> {
    const response = await this.request<{ hiringTeamRoles: Array<{ id: string; label: string }> }>(
      "hiringTeamRole.list",
      {}
    );
    return response.hiringTeamRoles;
  }

  async listApplicationHiringTeam(applicationId: string): Promise<Array<{
    userId: string;
    roleId: string;
    role: { id: string; label: string };
  }>> {
    const response = await this.request<{
      applicationHiringTeamRoles: Array<{
        userId: string;
        roleId: string;
        role: { id: string; label: string };
      }>;
    }>("applicationHiringTeamRole.list", { applicationId });
    return response.applicationHiringTeamRoles;
  }

  // ===========================================================================
  // User Management
  // ===========================================================================

  async getUser(userId: string): Promise<User> {
    return this.request<User>("user.info", { userId });
  }

  async searchUsers(params: { name?: string; email?: string }): Promise<User[]> {
    return this.request<{ users: User[] }>("user.search", params).then(r => r.users);
  }

  // ===========================================================================
  // Feedback & Custom Fields
  // ===========================================================================

  async getFeedbackSubmission(feedbackSubmissionId: string): Promise<FeedbackSubmission> {
    return this.request<FeedbackSubmission>("feedbackSubmission.info", { feedbackSubmissionId });
  }

  async listCustomFields(): Promise<Array<{ id: string; title: string; fieldType: string }>> {
    const response = await this.request<{
      customFields: Array<{ id: string; title: string; fieldType: string }>;
    }>("customField.list", {});
    return response.customFields;
  }

  // ===========================================================================
  // Locations & Departments
  // ===========================================================================

  async listLocations(): Promise<Array<{ id: string; name: string }>> {
    const response = await this.request<{ locations: Array<{ id: string; name: string }> }>(
      "location.list",
      {}
    );
    return response.locations;
  }

  async listDepartments(): Promise<Array<{ id: string; name: string }>> {
    const response = await this.request<{ departments: Array<{ id: string; name: string }> }>(
      "department.list",
      {}
    );
    return response.departments;
  }

  // ===========================================================================
  // Application History
  // ===========================================================================

  async getApplicationHistory(
    applicationId: string
  ): Promise<Array<Record<string, unknown>>> {
    const response = await this.request<{ applicationHistory: Array<Record<string, unknown>> }>(
      "application.listHistory",
      { applicationId }
    );
    return response.applicationHistory;
  }

  async listInterviewEvents(
    interviewScheduleId?: string
  ): Promise<InterviewEvent[]> {
    return this.getAllPaginated<InterviewEvent>("interviewEvent.list", { interviewScheduleId });
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
