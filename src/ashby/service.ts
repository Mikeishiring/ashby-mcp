/**
 * Ashby Service Layer (Facade)
 *
 * Provides a unified interface to all domain services.
 * This is the main entry point for the AI agent to interact with Ashby.
 */

import { AshbyClient } from "./client.js";
import type { Config } from "../config/index.js";

// Import domain services
import {
  SearchService,
  PipelineService,
  InterviewService,
  OfferService,
  FeedbackService,
  CandidateService,
  AnalyticsService,
  AnalysisService,
  JobService,
  WriteService,
} from "./services/index.js";

// Re-export types for convenience
import type {
  Application,
  ApplicationWithContext,
  ArchiveReason,
  BatchBlockerAnalysis,
  Candidate,
  CandidateComparison,
  CandidateStatusAnalysis,
  CreateCandidateParams,
  DailySummaryData,
  FeedbackSubmission,
  Interview,
  InterviewBriefing,
  InterviewEvent,
  InterviewPlan,
  InterviewSchedule,
  InterviewStage,
  Job,
  Note,
  Offer,
  OfferStatus,
  PipelineSummary,
  PrepPacket,
  Scorecard,
  SourceAnalytics,
  User,
} from "../types/index.js";

export class AshbyService {
  // Domain services
  private readonly searchService: SearchService;
  private readonly pipelineService: PipelineService;
  private readonly interviewService: InterviewService;
  private readonly offerService: OfferService;
  private readonly feedbackService: FeedbackService;
  private readonly candidateService: CandidateService;
  private readonly analyticsService: AnalyticsService;
  private readonly analysisService: AnalysisService;
  private readonly jobService: JobService;
  private readonly writeService: WriteService;

  private readonly client: AshbyClient;

  constructor(config: Config) {
    this.client = new AshbyClient(config);

    // Initialize domain services
    this.searchService = new SearchService(this.client);
    this.pipelineService = new PipelineService(this.client, config.staleDays);
    this.candidateService = new CandidateService(this.client);
    this.feedbackService = new FeedbackService(this.client, this.searchService);
    this.interviewService = new InterviewService(this.client, this.searchService);
    this.offerService = new OfferService(this.client, this.searchService);
    this.jobService = new JobService(this.client, this.pipelineService);
    this.writeService = new WriteService(this.client, this.searchService);
    this.analyticsService = new AnalyticsService(
      this.client,
      this.searchService,
      this.candidateService,
      this.feedbackService,
      this.interviewService
    );
    this.analysisService = new AnalysisService(
      this.client,
      this.searchService,
      this.pipelineService,
      config.staleDays
    );
  }

  // ===========================================================================
  // Search & Discovery (delegated to SearchService)
  // ===========================================================================

  searchCandidates(query: string): Promise<Candidate[]> {
    return this.searchService.searchCandidates(query);
  }

  getCandidateWithApplications(candidateId: string): Promise<{
    candidate: Candidate;
    applications: Application[];
  }> {
    return this.searchService.getCandidateWithApplications(candidateId);
  }

  getApplication(applicationId: string): Promise<Application> {
    return this.searchService.getApplication(applicationId);
  }

  findCandidateByNameOrEmail(query: string): Promise<Candidate | null> {
    return this.searchService.findCandidateByNameOrEmail(query);
  }

  getActiveApplicationForCandidate(
    candidateId: string,
    applicationId?: string
  ): Promise<Application | null> {
    return this.searchService.getActiveApplicationForCandidate(candidateId, applicationId);
  }

  // ===========================================================================
  // Candidate Details (delegated to CandidateService)
  // ===========================================================================

  getCandidateFullContext(candidateId: string): Promise<{
    candidate: Candidate;
    applications: ApplicationWithContext[];
    notes: Note[];
  }> {
    return this.candidateService.getCandidateFullContext(candidateId);
  }

  createCandidate(params: CreateCandidateParams): Promise<Candidate> {
    return this.candidateService.createCandidate(params);
  }

  updateCandidate(
    candidateId: string,
    updates: Partial<CreateCandidateParams>
  ): Promise<Candidate> {
    return this.candidateService.updateCandidate(candidateId, updates);
  }

  addCandidateTag(candidateId: string, tagId: string): Promise<Candidate> {
    return this.candidateService.addCandidateTag(candidateId, tagId);
  }

  listCandidateTags(): Promise<Array<{ id: string; title: string }>> {
    return this.candidateService.listCandidateTags();
  }

  isHiredCandidate(candidateId: string): Promise<boolean> {
    return this.candidateService.isHiredCandidate(candidateId);
  }

  /**
   * Get the resume download URL for a candidate.
   * Returns null if the candidate doesn't have a resume on file.
   */
  getResumeUrl(candidateId: string): Promise<{
    url: string;
    candidateName: string;
  } | null> {
    return this.candidateService.getResumeUrl(candidateId);
  }

  // ===========================================================================
  // Pipeline Operations (delegated to PipelineService)
  // ===========================================================================

  getPipelineSummary(): Promise<PipelineSummary> {
    return this.pipelineService.getPipelineSummary();
  }

  getStaleCandidates(limit?: number): Promise<ApplicationWithContext[]> {
    return this.pipelineService.getStaleCandidates(limit);
  }

  getCandidatesNeedingDecision(limit?: number): Promise<ApplicationWithContext[]> {
    return this.pipelineService.getCandidatesNeedingDecision(limit);
  }

  getRecentApplications(days?: number): Promise<ApplicationWithContext[]> {
    return this.pipelineService.getRecentApplications(days);
  }

  getDailySummaryData(): Promise<DailySummaryData> {
    return this.pipelineService.getDailySummaryData();
  }

  // ===========================================================================
  // Job Operations (delegated to JobService)
  // ===========================================================================

  getOpenJobs(): Promise<Job[]> {
    return this.jobService.getOpenJobs();
  }

  getJob(jobId: string): Promise<Job> {
    return this.client.getJob(jobId);
  }

  getJobWithCandidates(jobId: string): Promise<{
    job: Job;
    candidates: ApplicationWithContext[];
  }> {
    return this.jobService.getJobWithCandidates(jobId);
  }

  findStageByName(stageName: string): Promise<InterviewStage | null> {
    return this.jobService.findStageByName(stageName);
  }

  getArchiveReasons(): Promise<ArchiveReason[]> {
    return this.jobService.getArchiveReasons();
  }

  listSources(): Promise<Array<{ id: string; title: string }>> {
    return this.jobService.listSources();
  }

  listHiringTeamRoles(): Promise<Array<{ id: string; label: string }>> {
    return this.jobService.listHiringTeamRoles();
  }

  getApplicationHiringTeam(applicationId: string): Promise<Array<{
    userId: string;
    roleId: string;
    role: { id: string; label: string };
  }>> {
    return this.jobService.getApplicationHiringTeam(applicationId);
  }

  listCustomFields(): Promise<Array<{ id: string; title: string; fieldType: string }>> {
    return this.jobService.listCustomFields();
  }

  listLocations(): Promise<Array<{ id: string; name: string }>> {
    return this.jobService.listLocations();
  }

  listDepartments(): Promise<Array<{ id: string; name: string }>> {
    return this.jobService.listDepartments();
  }

  getApplicationHistory(applicationId: string): Promise<Array<Record<string, unknown>>> {
    return this.jobService.getApplicationHistory(applicationId);
  }

  getInterviewStageDetails(interviewStageId: string): Promise<InterviewStage | null> {
    return this.jobService.getInterviewStageDetails(interviewStageId);
  }

  // ===========================================================================
  // Write Operations (delegated to WriteService)
  // ===========================================================================

  addNote(candidateId: string, content: string): Promise<Note> {
    return this.writeService.addNote(candidateId, content);
  }

  moveToStage(applicationId: string, stageId: string): Promise<Application> {
    return this.writeService.moveToStage(applicationId, stageId);
  }

  createApplication(params: {
    candidateId: string;
    jobId: string;
    sourceId?: string;
    creditedToUserId?: string;
  }): Promise<Application> {
    return this.writeService.createApplication(params);
  }

  transferApplication(applicationId: string, jobId: string): Promise<Application> {
    return this.writeService.transferApplication(applicationId, jobId);
  }

  rejectCandidate(
    candidateId: string,
    archiveReasonId: string,
    applicationId?: string
  ): Promise<Application> {
    return this.writeService.rejectCandidate(candidateId, archiveReasonId, applicationId);
  }

  // ===========================================================================
  // Interview Scheduling (delegated to InterviewService)
  // ===========================================================================

  listInterviewPlans(): Promise<InterviewPlan[]> {
    return this.interviewService.listInterviewPlans();
  }

  listUsers(): Promise<User[]> {
    return this.interviewService.listUsers();
  }

  getUserByEmail(email: string): Promise<User | null> {
    return this.interviewService.getUserByEmail(email);
  }

  getUpcomingInterviewsForUser(
    userId: string,
    options?: { candidateName?: string; limit?: number }
  ): Promise<Interview[]> {
    return this.interviewService.getUpcomingInterviewsForUser(userId, options);
  }

  getInterviewSchedulesForCandidate(candidateId: string): Promise<InterviewSchedule[]> {
    return this.interviewService.getInterviewSchedulesForCandidate(candidateId);
  }

  scheduleInterview(
    candidateId: string,
    startTime: string,
    endTime: string,
    interviewerIds: string[],
    meetingLink?: string,
    location?: string,
    applicationId?: string
  ): Promise<InterviewSchedule> {
    return this.interviewService.scheduleInterview(
      candidateId,
      startTime,
      endTime,
      interviewerIds,
      meetingLink,
      location,
      applicationId
    );
  }

  listAllInterviews(filters?: {
    applicationId?: string;
    userId?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<Interview[]> {
    return this.interviewService.listAllInterviews(filters);
  }

  getInterview(interviewId: string): Promise<Interview> {
    return this.interviewService.getInterview(interviewId);
  }

  getUpcomingInterviews(limit?: number): Promise<Interview[]> {
    return this.interviewService.getUpcomingInterviews(limit);
  }

  rescheduleInterview(
    interviewScheduleId: string,
    newStartTime: string,
    newEndTime: string,
    interviewerIds: string[],
    meetingLink?: string,
    location?: string
  ): Promise<InterviewSchedule> {
    return this.interviewService.rescheduleInterview(
      interviewScheduleId,
      newStartTime,
      newEndTime,
      interviewerIds,
      meetingLink,
      location
    );
  }

  cancelInterview(
    interviewScheduleId: string,
    cancellationReason?: string
  ): Promise<{ success: boolean }> {
    return this.interviewService.cancelInterview(interviewScheduleId, cancellationReason);
  }

  listInterviewEvents(interviewScheduleId?: string): Promise<InterviewEvent[]> {
    return this.interviewService.listInterviewEvents(interviewScheduleId);
  }

  // ===========================================================================
  // Feedback (delegated to FeedbackService)
  // ===========================================================================

  getCandidateScorecard(
    candidateId: string,
    applicationId?: string
  ): Promise<Scorecard> {
    return this.feedbackService.getCandidateScorecard(candidateId, applicationId);
  }

  listFeedbackSubmissions(filters?: {
    applicationId?: string;
    interviewId?: string;
    authorId?: string;
  }): Promise<FeedbackSubmission[]> {
    return this.feedbackService.listFeedbackSubmissions(filters);
  }

  getFeedbackDetails(feedbackSubmissionId: string): Promise<FeedbackSubmission> {
    return this.feedbackService.getFeedbackDetails(feedbackSubmissionId);
  }

  // ===========================================================================
  // Offers (delegated to OfferService)
  // ===========================================================================

  listOffers(filters?: {
    applicationId?: string;
    status?: OfferStatus;
  }): Promise<Offer[]> {
    return this.offerService.listOffers(filters);
  }

  getPendingOffers(): Promise<Offer[]> {
    return this.offerService.getPendingOffers();
  }

  getOfferForCandidate(
    candidateId: string,
    applicationId?: string
  ): Promise<Offer | null> {
    return this.offerService.getOfferForCandidate(candidateId, applicationId);
  }

  createOffer(params: {
    candidateId: string;
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
    applicationId?: string;
  }): Promise<Offer> {
    return this.offerService.createOffer(params);
  }

  updateOffer(
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
    return this.offerService.updateOffer(offerId, updates);
  }

  approveOffer(offerId: string, approverId: string): Promise<Offer> {
    return this.offerService.approveOffer(offerId, approverId);
  }

  sendOffer(offerId: string): Promise<Offer> {
    return this.offerService.sendOffer(offerId);
  }

  // ===========================================================================
  // Analytics (delegated to AnalyticsService)
  // ===========================================================================

  getSourceAnalytics(days?: number): Promise<SourceAnalytics[]> {
    return this.analyticsService.getSourceAnalytics(days);
  }

  compareCandidates(
    candidateIds?: string[],
    jobId?: string,
    limit?: number
  ): Promise<CandidateComparison> {
    return this.analyticsService.compareCandidates(candidateIds, jobId, limit);
  }

  getInterviewPrepPacket(
    candidateId: string,
    applicationId?: string
  ): Promise<PrepPacket> {
    return this.analyticsService.getInterviewPrepPacket(candidateId, applicationId);
  }

  getInterviewBriefing(
    interviewerEmail: string,
    candidateName?: string
  ): Promise<InterviewBriefing | null> {
    return this.analyticsService.getInterviewBriefing(interviewerEmail, candidateName);
  }

  getInterviewBriefingForCandidate(
    candidateId: string,
    applicationId?: string
  ): Promise<InterviewBriefing> {
    return this.analyticsService.getInterviewBriefingForCandidate(candidateId, applicationId);
  }

  // ===========================================================================
  // Proactive Analysis (delegated to AnalysisService)
  // ===========================================================================

  analyzeCandidateStatus(
    candidateId: string,
    applicationId?: string
  ): Promise<CandidateStatusAnalysis> {
    return this.analysisService.analyzeCandidateStatus(candidateId, applicationId);
  }

  analyzeCandidateBlockers(candidateIds?: string[]): Promise<BatchBlockerAnalysis> {
    return this.analysisService.analyzeCandidateBlockers(candidateIds);
  }

  // ===========================================================================
  // User Management
  // ===========================================================================

  getUserDetails(userId: string): Promise<User> {
    return this.client.getUser(userId);
  }

  searchUsers(params: { name?: string; email?: string }): Promise<User[]> {
    return this.client.searchUsers(params);
  }
}
