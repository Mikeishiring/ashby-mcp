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
  CriteriaEvaluation,
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

    console.log(`[Ashby] Requesting ${endpoint}...`);

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

    try {
      const response = await fetch(url, fetchOptions);

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
    const url = `${this.baseUrl}/${endpoint}`;
    const auth = Buffer.from(`${this.apiKey}:`).toString("base64");

    console.log(`[Ashby] Requesting ${endpoint}...`);

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

  /**
   * Search for candidates by email or name.
   *
   * IMPORTANT: Results are limited to 100 candidates max.
   * This endpoint is designed for autocomplete/lookup use cases.
   * For larger result sets, use listCandidates() with pagination.
   *
   * When multiple search parameters are provided, they are combined with AND.
   */
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

  /**
   * List AI criteria evaluations for an application.
   * Requires the AI Application Review feature to be enabled for your organization.
   *
   * Note: The exact response structure may vary. Test with your API to verify fields.
   */
  async listCriteriaEvaluations(applicationId: string): Promise<CriteriaEvaluation[]> {
    return this.getAllPaginated<CriteriaEvaluation>(
      "application.listCriteriaEvaluations",
      { applicationId }
    );
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

    // job.list doesn't support status filtering directly.
    // job.search exists but only searches by title, not status.
    // So we fetch all jobs and filter client-side for status filtering.
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

  /**
   * List all interview stages across all interview plans.
   * Uses interviewStage.list API which requires an interviewPlanId,
   * so we first fetch all plans and then get stages for each.
   */
  async listInterviewStages(): Promise<InterviewStage[]> {
    const cacheKey = "stages:all";
    const cached = this.getCached<InterviewStage[]>(cacheKey);
    if (cached) return cached;

    // Get all interview plans first
    const plans = await this.listInterviewPlans();

    // Fetch stages for each plan and deduplicate by ID
    const stageMap = new Map<string, InterviewStage>();
    for (const plan of plans) {
      const stages = await this.listInterviewStagesForPlan(plan.id);
      for (const stage of stages) {
        if (!stageMap.has(stage.id)) {
          stageMap.set(stage.id, stage);
        }
      }
    }

    const results = Array.from(stageMap.values());
    this.setCache(cacheKey, results, AshbyClient.CACHE_TTL.stages);
    return results;
  }

  /**
   * List interview stages for a specific interview plan, in order.
   * Uses the interviewStage.list API endpoint.
   */
  async listInterviewStagesForPlan(interviewPlanId: string): Promise<InterviewStage[]> {
    const cacheKey = `stages:plan:${interviewPlanId}`;
    const cached = this.getCached<InterviewStage[]>(cacheKey);
    if (cached) return cached;

    const response = await this.request<{ interviewStages: InterviewStage[] }>(
      "interviewStage.list",
      { interviewPlanId }
    );
    const stages = response.interviewStages ?? [];
    this.setCache(cacheKey, stages, AshbyClient.CACHE_TTL.stages);
    return stages;
  }

  /**
   * Get a single interview stage by ID.
   * Uses the interviewStage.info API endpoint.
   */
  async getInterviewStage(interviewStageId: string): Promise<InterviewStage | null> {
    try {
      return await this.request<InterviewStage>("interviewStage.info", { interviewStageId });
    } catch (error) {
      // Return null if stage not found
      if (error instanceof AshbyApiError && error.statusCode === 404) {
        return null;
      }
      throw error;
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

  /**
   * Archive an application by moving it to an Archived interview stage.
   *
   * @param applicationId - The application to archive
   * @param interviewStageId - The ID of an interview stage with type "Archived"
   * @param archiveReasonId - The reason for archiving (from archiveReason.list)
   * @param archiveEmail - Optional email to send to the candidate
   *
   * NOTE: The interviewStageId MUST be a stage with interviewStageType="Archived".
   * Use listInterviewStages() to find archived stages for the job's interview plan.
   */
  async archiveApplication(
    applicationId: string,
    interviewStageId: string,
    archiveReasonId: string,
    archiveEmail?: {
      subject: string;
      body: string;
      sendAt?: string;
    }
  ): Promise<Application> {
    const params: Record<string, unknown> = {
      applicationId,
      interviewStageId,
      archiveReasonId,
    };

    if (archiveEmail) {
      params.archiveEmail = archiveEmail;
    }

    return this.request<Application>("application.changeStage", params);
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

  /**
   * List all interviews (interview templates, not scheduled events).
   *
   * NOTE: The Ashby API does NOT support filtering by applicationId, userId,
   * startDate, or endDate. If you need interviews for a specific application,
   * use listInterviewSchedules(applicationId) instead.
   *
   * @param options.includeArchived - Include archived interviews (default: false)
   * @param options.includeNonSharedInterviews - Include job-specific interviews (default: false)
   */
  async listInterviews(options?: {
    includeArchived?: boolean;
    includeNonSharedInterviews?: boolean;
    excludeArchivedScheduleTemplateInterviews?: boolean;
  }): Promise<Interview[]> {
    return this.getAllPaginated<Interview>("interview.list", options);
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

  /**
   * List feedback submissions for an application.
   * Uses applicationFeedback.list API which requires applicationId.
   *
   * NOTE: interviewId and authorId filters are applied client-side since
   * the Ashby API doesn't support these as query parameters.
   */
  async listFeedbackSubmissions(filters?: {
    applicationId?: string;
    interviewId?: string;
    authorId?: string;
  }): Promise<FeedbackSubmission[]> {
    if (!filters?.applicationId) {
      // Without applicationId, we can't query - return empty
      // The Ashby API requires applicationId for feedback queries
      console.warn("[Ashby] listFeedbackSubmissions called without applicationId - returning empty");
      return [];
    }

    // Use the correct API endpoint
    let submissions = await this.getApplicationFeedback(filters.applicationId);

    // Apply client-side filtering for interviewId if provided
    if (filters.interviewId) {
      submissions = submissions.filter(s => s.interviewId === filters.interviewId);
    }

    // Apply client-side filtering for authorId if provided
    if (filters.authorId) {
      submissions = submissions.filter(s => s.submittedByUser?.id === filters.authorId);
    }

    return submissions;
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

  /**
   * Creates an offer using a form-based submission.
   *
   * Flow: offerProcess.start -> offer.start -> offer.create
   *
   * @param offerProcessId - From offerProcess.start response
   * @param offerFormId - From offer.start response
   * @param offerForm - Form values keyed by field path. Field types:
   *   - Boolean: true/false
   *   - Currency: { currencyCode: "USD", value: 100000 }
   *   - Date: ISO date string
   *   - Number: integer
   *   - String: string
   *   - ValueSelect: string matching a selectable option
   *   - MultiValueSelect: array of strings matching selectable options
   */
  async createOffer(params: {
    offerProcessId: string;
    offerFormId: string;
    offerForm: Record<string, unknown>;
  }): Promise<Offer> {
    return this.request<Offer>("offer.create", params);
  }

  /**
   * Updates an existing offer using a form-based submission.
   * Creates a new version and retrigggers approval steps.
   */
  async updateOffer(
    offerId: string,
    offerForm: Record<string, unknown>
  ): Promise<Offer> {
    return this.request<Offer>("offer.update", {
      offerId,
      offerForm,
    });
  }

  /**
   * Approves an offer or a specific approval step.
   *
   * @param offerVersionId - The offer version ID (from approval.list as entityId)
   * @param approvalStepId - Optional: specific step to approve (requires userId)
   * @param userId - Required if approvalStepId is provided
   */
  async approveOffer(
    offerVersionId: string,
    approvalStepId?: string,
    userId?: string
  ): Promise<Offer> {
    const params: Record<string, string> = { offerVersionId };
    if (approvalStepId) params.approvalStepId = approvalStepId;
    if (userId) params.userId = userId;
    return this.request<Offer>("offer.approve", params);
  }

  /**
   * Creates a new offer version for an in-progress offer process.
   * Returns an offer form that can be filled out and submitted via offer.create.
   *
   * @param offerProcessId - From offerProcess.start response
   */
  async startOffer(offerProcessId: string): Promise<{
    id: string;
    offerFormId: string;
    offerFormDefinition: Record<string, unknown>;
  }> {
    return this.request<{
      id: string;
      offerFormId: string;
      offerFormDefinition: Record<string, unknown>;
    }>("offer.start", { offerProcessId });
  }

  /**
   * Starts an offer process for a candidate.
   *
   * @param applicationId - The application to start an offer process for
   */
  async startOfferProcess(applicationId: string): Promise<{
    id: string;
    applicationId: string;
  }> {
    return this.request<{
      id: string;
      applicationId: string;
    }>("offerProcess.start", { applicationId });
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

  /**
   * Get a single feedback submission by ID.
   *
   * NOTE: The Ashby API does not have a feedbackSubmission.info endpoint.
   * This method throws an error to indicate the limitation.
   *
   * To get feedback details, use getApplicationFeedback(applicationId) which
   * returns all feedback submissions for an application with full details.
   *
   * @deprecated Use getApplicationFeedback(applicationId) instead and filter by ID
   */
  async getFeedbackSubmission(_feedbackSubmissionId: string): Promise<FeedbackSubmission> {
    throw new AshbyApiError(
      "The feedbackSubmission.info endpoint does not exist in the Ashby API. " +
      "Use getApplicationFeedback(applicationId) to get feedback submissions with full details.",
      400
    );
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

  async getApplicationHistory(applicationId: string): Promise<Array<any>> {
    const response = await this.request<{ applicationHistory: Array<any> }>(
      "application.listHistory",
      { applicationId }
    );
    return response.applicationHistory;
  }

  async listInterviewEvents(interviewScheduleId?: string): Promise<Array<any>> {
    return this.getAllPaginated<any>("interviewEvent.list", { interviewScheduleId });
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
