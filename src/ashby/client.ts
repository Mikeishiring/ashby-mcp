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
import { logger } from "../utils/logger.js";

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

/**
 * Rate limiter using token bucket algorithm
 */
class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private readonly maxTokens: number;
  private readonly refillRate: number; // tokens per second
  private readonly minTokens: number;

  constructor(maxTokens: number = 100, refillRate: number = 10) {
    this.maxTokens = maxTokens;
    this.tokens = maxTokens;
    this.refillRate = refillRate;
    this.lastRefill = Date.now();
    this.minTokens = 1;
  }

  /**
   * Attempt to acquire a token, returns delay in ms if rate limited
   */
  async acquire(): Promise<void> {
    this.refill();

    if (this.tokens >= this.minTokens) {
      this.tokens -= 1;
      return;
    }

    // Calculate wait time until a token is available
    const waitMs = Math.ceil((this.minTokens - this.tokens) / this.refillRate * 1000);
    logger.debug(`Rate limited, waiting ${waitMs}ms`, { tokens: this.tokens });
    await new Promise(resolve => setTimeout(resolve, waitMs));

    this.refill();
    this.tokens -= 1;
  }

  /**
   * Mark that we received a rate limit response
   */
  onRateLimitResponse(retryAfterMs?: number): void {
    // Drain most tokens to slow down
    this.tokens = Math.max(0, this.tokens - this.maxTokens * 0.5);
    logger.warn("Rate limit response received", { retryAfterMs, remainingTokens: this.tokens });
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    const tokensToAdd = elapsed * this.refillRate;

    this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }
}

export class AshbyClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly cache: Map<string, CacheEntry<unknown>> = new Map();
  private readonly rateLimiter: RateLimiter;

  // Cache TTLs in milliseconds
  private static readonly CACHE_TTL = {
    jobs: 5 * 60 * 1000, // 5 minutes
    stages: 10 * 60 * 1000, // 10 minutes
    candidates: 60 * 1000, // 1 minute
  } as const;

  private static readonly REQUEST_TIMEOUT_MS = 15000;
  private static readonly MAX_RETRIES = 3; // Increased for rate limit handling
  private static readonly RETRY_BASE_DELAY_MS = 500;

  constructor(config: Config) {
    this.baseUrl = config.ashby.baseUrl;
    this.apiKey = config.ashby.apiKey;
    this.rateLimiter = new RateLimiter(100, 10); // 100 tokens, refill 10/sec
  }

  // ===========================================================================
  // HTTP Layer
  // ===========================================================================

  private async postJson(
    endpoint: string,
    body?: Record<string, unknown>
  ): Promise<Response> {
    // Acquire rate limit token before making request
    await this.rateLimiter.acquire();

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

    const maxRetries = isRead ? AshbyClient.MAX_RETRIES : 1; // Allow 1 retry for writes on rate limit

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      const controller = new globalThis.AbortController();
      const timeoutId = setTimeout(() => controller.abort(), AshbyClient.REQUEST_TIMEOUT_MS);

      try {
        const response = await fetch(url, { ...fetchOptions, signal: controller.signal });
        clearTimeout(timeoutId);

        if (response.ok) {
          return response;
        }

        // Handle rate limiting specifically
        if (response.status === 429) {
          const retryAfter = response.headers.get("Retry-After");
          const retryAfterMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : undefined;
          this.rateLimiter.onRateLimitResponse(retryAfterMs);

          if (attempt < maxRetries) {
            const waitTime = retryAfterMs ?? this.calculateBackoff(attempt, 2000);
            logger.warn(`Rate limited on ${endpoint}, waiting ${waitTime}ms before retry`, {
              attempt,
              retryAfterMs,
            });
            await new Promise(resolve => setTimeout(resolve, waitTime));
            continue;
          }
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

  private calculateBackoff(attempt: number, baseMs: number = AshbyClient.RETRY_BASE_DELAY_MS): number {
    // Exponential backoff with jitter
    const exponential = baseMs * Math.pow(2, attempt);
    const jitter = Math.random() * 0.3 * exponential;
    return Math.min(exponential + jitter, 30000); // Cap at 30s
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
    logger.debug(`Requesting ${endpoint}`);

    try {
      const response = await this.postJson(endpoint, body);

      if (!response.ok) {
        const errorText = await response.text();
        logger.error(`API error ${response.status}`, { endpoint, status: response.status, error: errorText });
        throw new AshbyApiError(
          `Ashby API error: ${response.status} ${response.statusText}`,
          response.status,
          errorText
        );
      }

      const data = (await response.json()) as ApiResponse<T>;

      if (!data.success) {
        const errors = this.formatErrors(data.errors);
        logger.error(`API returned error`, { endpoint, errors });
        throw new AshbyApiError(`Ashby API returned error: ${errors}`, 400);
      }

      logger.debug(`${endpoint} succeeded`);
      return data.results as T;
    } catch (error) {
      if (error instanceof AshbyApiError) {
        throw error;
      }
      logger.error(`Network error for ${endpoint}`, { endpoint, error });
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
    logger.debug(`Requesting paginated ${endpoint}`);
    const response = await this.postJson(endpoint, body);

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(`API error ${response.status}`, { endpoint, status: response.status, error: errorText });
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
      errors?: Array<{ message: string } | string>;
    };

    if (!data.success) {
      const errors = this.formatErrors(data.errors);
      logger.error(`API returned error`, { endpoint, errors });
      throw new AshbyApiError(`Ashby API returned error: ${errors}`, 400);
    }

    logger.debug(`${endpoint} succeeded`, { resultCount: data.results.length });
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

  private formatErrors(errors?: Array<{ message?: string } | string>): string {
    if (!errors) return "Unknown error";
    const messages = errors
      .map((error) => {
        if (typeof error === "string") return error;
        if (error && typeof error.message === "string") return error.message;
        return "";
      })
      .map((message) => message.trim())
      .filter((message) => message.length > 0);
    return messages.length > 0 ? messages.join(", ") : "Unknown error";
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
    return this.request<Candidate>("candidate.info", { id: candidateId });
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

  async listInterviewStages(jobId?: string): Promise<InterviewStage[]> {
    const cacheKey = jobId ? `stages:job:${jobId}` : "stages:all";
    const cached = this.getCached<InterviewStage[]>(cacheKey);
    if (cached) return cached;

    const stageMap = new Map<string, InterviewStage>();

    try {
      const params = jobId ? { jobId } : {};
      const stages = await this.getAllPaginated<InterviewStage>("interviewStage.list", params);
      for (const stage of stages) {
        if (stage?.id) {
          stageMap.set(stage.id, stage);
        }
      }
    } catch (error) {
      logger.warn("[Ashby] interviewStage.list failed, falling back to plans/applications.", { error: String(error) });
    }

    try {
      const plans = await this.listInterviewPlans();
      for (const plan of plans) {
        for (const stage of plan.interviewStages) {
          if (stage?.id) {
            stageMap.set(stage.id, stage);
          }
        }
      }
    } catch (error) {
      logger.warn("[Ashby] interviewPlan.list failed while building stage cache.", { error: String(error) });
    }

    try {
      const filters = jobId ? { status: "Active", jobId } : { status: "Active" };
      const applications = await this.getAllPaginated<Application>("application.list", filters);
      for (const app of applications) {
        if (app.currentInterviewStage?.id) {
          stageMap.set(app.currentInterviewStage.id, app.currentInterviewStage);
        }
      }
    } catch (error) {
      logger.warn("[Ashby] application.list failed while building stage cache.", { error: String(error) });
    }

    const results = Array.from(stageMap.values());
    this.setCache(cacheKey, results, AshbyClient.CACHE_TTL.stages);
    return results;
  }

  async getInterviewStage(stageId: string): Promise<InterviewStage | null> {
    // Use the official interviewStage.info endpoint
    try {
      return await this.request<InterviewStage>("interviewStage.info", { interviewStageId: stageId });
    } catch {
      return null;
    }
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
      interviewers: Array<{ email: string; feedbackRequired?: boolean }>;
      location?: string;
      meetingLink?: string;
      interviewId?: string;
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
    const result = await this.request<
      FeedbackSubmission[] | { feedbackSubmissions?: FeedbackSubmission[] }
    >("applicationFeedback.list", { applicationId });

    if (Array.isArray(result)) {
      return result;
    }

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

    // Use allSettled to handle individual application failures gracefully
    // (e.g., if an application was deleted or access is restricted)
    const results = await Promise.allSettled(
      candidate.applicationIds.map((id) => this.getApplication(id))
    );

    const applications = results
      .filter((r): r is PromiseFulfilledResult<Application> => r.status === "fulfilled")
      .map((r) => r.value);

    // Log any failures for debugging but don't crash
    const failures = results.filter((r) => r.status === "rejected");
    if (failures.length > 0) {
      logger.warn(`[Ashby] Failed to fetch ${failures.length} application(s) for candidate ${candidateId}`);
    }

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
      interviewers: Array<{ email: string; feedbackRequired?: boolean }>;
      location?: string;
      meetingLink?: string;
      interviewEventId?: string;
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
    try {
      return await this.getAllPaginated<FeedbackSubmission>(
        "feedbackSubmission.list",
        filters
      );
    } catch (error) {
      if (error instanceof AshbyApiError && error.statusCode === 404) {
        const fallback = await this.listFeedbackSubmissionsFallback(filters);
        if (fallback) {
          return fallback;
        }
      }
      throw error;
    }
  }

  private async listFeedbackSubmissionsFallback(filters?: {
    applicationId?: string;
    interviewId?: string;
    authorId?: string;
  }): Promise<FeedbackSubmission[] | null> {
    if (!filters) {
      logger.warn("[Ashby] feedbackSubmission.list unavailable; no filters provided for fallback.");
      return [];
    }

    let applicationId = filters.applicationId;
    if (!applicationId && filters.interviewId) {
      try {
        const interview = await this.getInterview(filters.interviewId);
        applicationId = interview.applicationId;
      } catch (error) {
        logger.warn("[Ashby] Failed to resolve applicationId for interviewId fallback.", { error: String(error) });
        return [];
      }
    }

    if (!applicationId) {
      logger.warn("[Ashby] feedbackSubmission.list unavailable; missing applicationId for fallback.");
      return [];
    }

    try {
      let submissions = await this.getApplicationFeedback(applicationId);
      if (filters.interviewId) {
        submissions = submissions.filter(
          (submission) => submission.interviewId === filters.interviewId
        );
      }
      if (filters.authorId) {
        submissions = submissions.filter(
          (submission) => submission.submittedByUser?.id === filters.authorId
        );
      }
      return submissions;
    } catch (error) {
      logger.warn("[Ashby] applicationFeedback.list fallback failed.", { error: String(error) });
      return [];
    }
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
    try {
      return await this.request<FeedbackSubmission>("feedbackSubmission.info", {
        feedbackSubmissionId,
      });
    } catch (error) {
      if (error instanceof AshbyApiError && error.statusCode === 404) {
        throw new AshbyApiError(
          "feedbackSubmission.info is not available for this Ashby account. Use applicationFeedback.list instead.",
          error.statusCode,
          error.responseBody
        );
      }
      throw error;
    }
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
