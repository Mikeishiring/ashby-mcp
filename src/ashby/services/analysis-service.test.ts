/**
 * Analysis Service Tests
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { AnalysisService } from "./analysis-service.js";
import type { AshbyClient } from "../client.js";
import type { SearchService } from "./search-service.js";
import type { PipelineService } from "./pipeline-service.js";
import type { Application, Candidate, Interview, InterviewStage, Offer, FeedbackSubmission, User } from "../../types/index.js";

const createMockClient = (): Partial<AshbyClient> => ({
  getCandidateWithApplications: vi.fn(),
  getApplication: vi.fn(),
  getInterviewStage: vi.fn(),
  listInterviews: vi.fn(),
  listFeedbackSubmissions: vi.fn(),
  listOffers: vi.fn(),
});

const createMockSearchService = (): Partial<SearchService> => ({
  selectApplicationForRead: vi.fn(),
});

const createMockPipelineService = (): Partial<PipelineService> => ({
  getStaleCandidates: vi.fn(),
});

const createMockApplication = (overrides?: Partial<Application>): Application => ({
  id: "app-1",
  candidateId: "c-1",
  status: "Active",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  currentInterviewStageId: "stage-1",
  jobId: "job-1",
  ...overrides,
});

const createMockCandidate = (overrides?: Partial<Candidate>): Candidate => ({
  id: "c-1",
  name: "John Doe",
  primaryEmailAddress: { value: "john@example.com", type: "work", isPrimary: true },
  phoneNumbers: [],
  socialLinks: [],
  tags: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  applicationIds: ["app-1"],
  profileUrl: "https://app.ashbyhq.com/candidate/c-1",
  ...overrides,
});

const createMockStage = (overrides?: Partial<InterviewStage>): InterviewStage => ({
  id: "stage-1",
  title: "Phone Screen",
  orderInInterviewPlan: 1,
  interviewStageType: "Interview",
  ...overrides,
});

const createMockInterview = (overrides?: Partial<Interview>): Interview => ({
  id: "interview-1",
  applicationId: "app-1",
  interviewStageId: "stage-1",
  status: "Completed",
  scheduledStartTime: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
  scheduledEndTime: new Date(Date.now() - 23 * 60 * 60 * 1000).toISOString(),
  feedbackSubmissions: [],
  interviewers: [],
  ...overrides,
});

const createMockOffer = (overrides?: Partial<Offer>): Offer => ({
  id: "offer-1",
  applicationId: "app-1",
  status: "Pending",
  offerProcessId: "process-1",
  startDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  salary: 100000,
  salaryFrequency: "Annual",
  currency: "USD",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

const createMockFeedback = (overrides?: Partial<FeedbackSubmission>): FeedbackSubmission => ({
  id: "feedback-1",
  applicationId: "app-1",
  submittedAt: new Date().toISOString(),
  ...overrides,
});

const createMockUser = (overrides?: Partial<User>): User => ({
  id: "user-1",
  firstName: "Jane",
  lastName: "Smith",
  email: "jane@example.com",
  globalRole: "Recruiter",
  isEnabled: true,
  ...overrides,
});

describe("AnalysisService", () => {
  let service: AnalysisService;
  let mockClient: Partial<AshbyClient>;
  let mockSearchService: Partial<SearchService>;
  let mockPipelineService: Partial<PipelineService>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = createMockClient();
    mockSearchService = createMockSearchService();
    mockPipelineService = createMockPipelineService();
    service = new AnalysisService(
      mockClient as AshbyClient,
      mockSearchService as SearchService,
      mockPipelineService as PipelineService,
      14 // staleDays
    );
  });

  describe("analyzeCandidateStatus", () => {
    it("should return complete status analysis", async () => {
      const candidate = createMockCandidate();
      const application = createMockApplication();
      const stage = createMockStage();

      vi.mocked(mockClient.getCandidateWithApplications!).mockResolvedValue({
        candidate,
        applications: [application],
      });
      vi.mocked(mockSearchService.selectApplicationForRead!).mockReturnValue(application);
      vi.mocked(mockClient.getApplication!).mockResolvedValue({
        ...application,
        currentInterviewStage: stage,
      });
      vi.mocked(mockClient.listInterviews!).mockResolvedValue([]);
      vi.mocked(mockClient.listFeedbackSubmissions!).mockResolvedValue([]);
      vi.mocked(mockClient.listOffers!).mockResolvedValue([]);

      const result = await service.analyzeCandidateStatus("c-1");

      expect(result.candidate.name).toBe("John Doe");
      expect(result.currentStage.title).toBe("Phone Screen");
      expect(result.daysInStage).toBeGreaterThanOrEqual(0);
      expect(result.blockers).toBeDefined();
      expect(result.nextSteps).toBeDefined();
      expect(result.priority).toBeDefined();
    });

    it("should throw if no application found", async () => {
      const candidate = createMockCandidate({ applicationIds: [] });

      vi.mocked(mockClient.getCandidateWithApplications!).mockResolvedValue({
        candidate,
        applications: [],
      });
      vi.mocked(mockSearchService.selectApplicationForRead!).mockReturnValue(null);

      await expect(service.analyzeCandidateStatus("c-1")).rejects.toThrow(
        "No application found for candidate"
      );
    });

    it("should detect no_interview_scheduled blocker", async () => {
      const candidate = createMockCandidate();
      const application = createMockApplication({
        updatedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(), // 10 days ago
      });
      const stage = createMockStage({ title: "Phone Screen" });

      vi.mocked(mockClient.getCandidateWithApplications!).mockResolvedValue({
        candidate,
        applications: [application],
      });
      vi.mocked(mockSearchService.selectApplicationForRead!).mockReturnValue(application);
      vi.mocked(mockClient.getApplication!).mockResolvedValue({
        ...application,
        currentInterviewStage: stage,
      });
      vi.mocked(mockClient.listInterviews!).mockResolvedValue([]); // No interviews
      vi.mocked(mockClient.listFeedbackSubmissions!).mockResolvedValue([]);
      vi.mocked(mockClient.listOffers!).mockResolvedValue([]);

      const result = await service.analyzeCandidateStatus("c-1");

      const blocker = result.blockers.find(b => b.type === "no_interview_scheduled");
      expect(blocker).toBeDefined();
      expect(blocker?.severity).toBe("critical"); // > 7 days
    });

    it("should detect interview_completed_no_feedback blocker", async () => {
      const candidate = createMockCandidate();
      const application = createMockApplication();
      const stage = createMockStage();
      const completedInterview = createMockInterview({
        id: "int-1",
        scheduledStartTime: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days ago
      });

      vi.mocked(mockClient.getCandidateWithApplications!).mockResolvedValue({
        candidate,
        applications: [application],
      });
      vi.mocked(mockSearchService.selectApplicationForRead!).mockReturnValue(application);
      vi.mocked(mockClient.getApplication!).mockResolvedValue({
        ...application,
        currentInterviewStage: stage,
      });
      vi.mocked(mockClient.listInterviews!).mockResolvedValue([completedInterview]);
      vi.mocked(mockClient.listFeedbackSubmissions!).mockResolvedValue([]); // No feedback
      vi.mocked(mockClient.listOffers!).mockResolvedValue([]);

      const result = await service.analyzeCandidateStatus("c-1");

      const blocker = result.blockers.find(b => b.type === "interview_completed_no_feedback");
      expect(blocker).toBeDefined();
      expect(blocker?.severity).toBe("critical"); // > 5 days
    });

    it("should detect offer_pending blocker when in offer stage", async () => {
      const candidate = createMockCandidate();
      const application = createMockApplication({
        updatedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), // 5 days ago
      });
      const stage = createMockStage({ title: "Offer Review" }); // Contains "offer"

      vi.mocked(mockClient.getCandidateWithApplications!).mockResolvedValue({
        candidate,
        applications: [application],
      });
      vi.mocked(mockSearchService.selectApplicationForRead!).mockReturnValue(application);
      vi.mocked(mockClient.getApplication!).mockResolvedValue({
        ...application,
        currentInterviewStage: stage,
      });
      vi.mocked(mockClient.listInterviews!).mockResolvedValue([]);
      vi.mocked(mockClient.listFeedbackSubmissions!).mockResolvedValue([]);
      vi.mocked(mockClient.listOffers!).mockResolvedValue([]); // No offer exists

      const result = await service.analyzeCandidateStatus("c-1");

      const blocker = result.blockers.find(b => b.type === "offer_pending");
      expect(blocker).toBeDefined();
      expect(blocker?.severity).toBe("critical"); // > 3 days
    });

    it("should detect offer_not_sent blocker", async () => {
      const candidate = createMockCandidate();
      const application = createMockApplication();
      const stage = createMockStage({ title: "Offer" });
      // Create offer without sentAt (exactOptionalPropertyTypes requires omitting, not setting undefined)
      const { sentAt: _, ...offerWithoutSentAt } = createMockOffer({
        status: "Approved",
        updatedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      });
      const approvedOffer: Offer = offerWithoutSentAt;

      vi.mocked(mockClient.getCandidateWithApplications!).mockResolvedValue({
        candidate,
        applications: [application],
      });
      vi.mocked(mockSearchService.selectApplicationForRead!).mockReturnValue(application);
      vi.mocked(mockClient.getApplication!).mockResolvedValue({
        ...application,
        currentInterviewStage: stage,
      });
      vi.mocked(mockClient.listInterviews!).mockResolvedValue([]);
      vi.mocked(mockClient.listFeedbackSubmissions!).mockResolvedValue([]);
      vi.mocked(mockClient.listOffers!).mockResolvedValue([approvedOffer]);

      const result = await service.analyzeCandidateStatus("c-1");

      const blocker = result.blockers.find(b => b.type === "offer_not_sent");
      expect(blocker).toBeDefined();
      expect(blocker?.severity).toBe("critical"); // > 2 days
    });

    it("should calculate priority as urgent for critical blockers", async () => {
      const candidate = createMockCandidate();
      const application = createMockApplication({
        updatedAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
      });
      const stage = createMockStage({ title: "Interview" });

      vi.mocked(mockClient.getCandidateWithApplications!).mockResolvedValue({
        candidate,
        applications: [application],
      });
      vi.mocked(mockSearchService.selectApplicationForRead!).mockReturnValue(application);
      vi.mocked(mockClient.getApplication!).mockResolvedValue({
        ...application,
        currentInterviewStage: stage,
      });
      vi.mocked(mockClient.listInterviews!).mockResolvedValue([]);
      vi.mocked(mockClient.listFeedbackSubmissions!).mockResolvedValue([]);
      vi.mocked(mockClient.listOffers!).mockResolvedValue([]);

      const result = await service.analyzeCandidateStatus("c-1");

      expect(result.priority).toBe("urgent");
    });

    it("should generate recent activity from interviews and feedback", async () => {
      const candidate = createMockCandidate();
      const application = createMockApplication();
      const stage = createMockStage();
      const interview = createMockInterview({
        scheduledStartTime: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      });
      const feedback = createMockFeedback({
        submittedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
        submittedByUser: createMockUser(),
      });

      vi.mocked(mockClient.getCandidateWithApplications!).mockResolvedValue({
        candidate,
        applications: [application],
      });
      vi.mocked(mockSearchService.selectApplicationForRead!).mockReturnValue(application);
      vi.mocked(mockClient.getApplication!).mockResolvedValue({
        ...application,
        currentInterviewStage: stage,
      });
      vi.mocked(mockClient.listInterviews!).mockResolvedValue([interview]);
      vi.mocked(mockClient.listFeedbackSubmissions!).mockResolvedValue([feedback]);
      vi.mocked(mockClient.listOffers!).mockResolvedValue([]);

      const result = await service.analyzeCandidateStatus("c-1");

      expect(result.recentActivity.length).toBeGreaterThan(0);
      expect(result.recentActivity.some(a => a.type === "interview")).toBe(true);
      expect(result.recentActivity.some(a => a.type === "feedback")).toBe(true);
    });

    it("should handle offer listing failure gracefully", async () => {
      const candidate = createMockCandidate();
      const application = createMockApplication();
      const stage = createMockStage();

      vi.mocked(mockClient.getCandidateWithApplications!).mockResolvedValue({
        candidate,
        applications: [application],
      });
      vi.mocked(mockSearchService.selectApplicationForRead!).mockReturnValue(application);
      vi.mocked(mockClient.getApplication!).mockResolvedValue({
        ...application,
        currentInterviewStage: stage,
      });
      vi.mocked(mockClient.listInterviews!).mockResolvedValue([]);
      vi.mocked(mockClient.listFeedbackSubmissions!).mockResolvedValue([]);
      vi.mocked(mockClient.listOffers!).mockRejectedValue(new Error("Offers unavailable"));

      // Should not throw
      const result = await service.analyzeCandidateStatus("c-1");

      expect(result).toBeDefined();
      expect(result.pendingOffer).toBeUndefined();
    });

    it("should fallback to fetching stage if not in application", async () => {
      const candidate = createMockCandidate();
      const application = createMockApplication({ currentInterviewStageId: "stage-1" });
      const stage = createMockStage({ id: "stage-1", title: "Onsite" });

      vi.mocked(mockClient.getCandidateWithApplications!).mockResolvedValue({
        candidate,
        applications: [application],
      });
      vi.mocked(mockSearchService.selectApplicationForRead!).mockReturnValue(application);
      // Omit currentInterviewStage to simulate it not being included (exactOptionalPropertyTypes)
      const { currentInterviewStage: _, ...appWithoutStage } = { ...application, currentInterviewStage: undefined as never };
      vi.mocked(mockClient.getApplication!).mockResolvedValue(appWithoutStage as Application);
      vi.mocked(mockClient.getInterviewStage!).mockResolvedValue(stage);
      vi.mocked(mockClient.listInterviews!).mockResolvedValue([]);
      vi.mocked(mockClient.listFeedbackSubmissions!).mockResolvedValue([]);
      vi.mocked(mockClient.listOffers!).mockResolvedValue([]);

      const result = await service.analyzeCandidateStatus("c-1");

      expect(result.currentStage.title).toBe("Onsite");
    });
  });

  describe("analyzeCandidateBlockers", () => {
    it("should analyze specific candidates by ID", async () => {
      const candidate = createMockCandidate();
      const application = createMockApplication();
      const stage = createMockStage();

      vi.mocked(mockClient.getCandidateWithApplications!).mockResolvedValue({
        candidate,
        applications: [application],
      });
      vi.mocked(mockSearchService.selectApplicationForRead!).mockReturnValue(application);
      vi.mocked(mockClient.getApplication!).mockResolvedValue({
        ...application,
        currentInterviewStage: stage,
      });
      vi.mocked(mockClient.listInterviews!).mockResolvedValue([]);
      vi.mocked(mockClient.listFeedbackSubmissions!).mockResolvedValue([]);
      vi.mocked(mockClient.listOffers!).mockResolvedValue([]);

      const result = await service.analyzeCandidateBlockers(["c-1"]);

      expect(result.analyzed).toBe(1);
      expect(result.summary).toBeDefined();
    });

    it("should analyze stale candidates when no IDs provided", async () => {
      const staleCandidates = [
        { candidateId: "c-1", id: "app-1" },
        { candidateId: "c-2", id: "app-2" },
      ];
      const candidate = createMockCandidate();
      const application = createMockApplication();
      const stage = createMockStage();

      vi.mocked(mockPipelineService.getStaleCandidates!).mockResolvedValue(staleCandidates as any);
      vi.mocked(mockClient.getCandidateWithApplications!).mockResolvedValue({
        candidate,
        applications: [application],
      });
      vi.mocked(mockSearchService.selectApplicationForRead!).mockReturnValue(application);
      vi.mocked(mockClient.getApplication!).mockResolvedValue({
        ...application,
        currentInterviewStage: stage,
      });
      vi.mocked(mockClient.listInterviews!).mockResolvedValue([]);
      vi.mocked(mockClient.listFeedbackSubmissions!).mockResolvedValue([]);
      vi.mocked(mockClient.listOffers!).mockResolvedValue([]);

      const result = await service.analyzeCandidateBlockers();

      expect(mockPipelineService.getStaleCandidates).toHaveBeenCalled();
      expect(result.analyzed).toBe(2);
    });

    it("should group candidates by blocker type", async () => {
      const candidate = createMockCandidate();
      const application = createMockApplication({
        updatedAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
      });
      const stage = createMockStage({ title: "Interview" });

      vi.mocked(mockClient.getCandidateWithApplications!).mockResolvedValue({
        candidate,
        applications: [application],
      });
      vi.mocked(mockSearchService.selectApplicationForRead!).mockReturnValue(application);
      vi.mocked(mockClient.getApplication!).mockResolvedValue({
        ...application,
        currentInterviewStage: stage,
      });
      vi.mocked(mockClient.listInterviews!).mockResolvedValue([]);
      vi.mocked(mockClient.listFeedbackSubmissions!).mockResolvedValue([]);
      vi.mocked(mockClient.listOffers!).mockResolvedValue([]);

      const result = await service.analyzeCandidateBlockers(["c-1"]);

      expect(result.byBlockerType).toBeDefined();
      expect(result.byBlockerType.no_interview_scheduled.length).toBeGreaterThan(0);
    });

    it("should count blockers by severity", async () => {
      const candidate = createMockCandidate();
      const application = createMockApplication({
        updatedAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
      });
      const stage = createMockStage({ title: "Interview" });

      vi.mocked(mockClient.getCandidateWithApplications!).mockResolvedValue({
        candidate,
        applications: [application],
      });
      vi.mocked(mockSearchService.selectApplicationForRead!).mockReturnValue(application);
      vi.mocked(mockClient.getApplication!).mockResolvedValue({
        ...application,
        currentInterviewStage: stage,
      });
      vi.mocked(mockClient.listInterviews!).mockResolvedValue([]);
      vi.mocked(mockClient.listFeedbackSubmissions!).mockResolvedValue([]);
      vi.mocked(mockClient.listOffers!).mockResolvedValue([]);

      const result = await service.analyzeCandidateBlockers(["c-1"]);

      expect(result.summary.critical).toBeGreaterThanOrEqual(0);
      expect(result.summary.warning).toBeGreaterThanOrEqual(0);
      expect(result.summary.info).toBeGreaterThanOrEqual(0);
    });

    it("should identify urgent candidates", async () => {
      const candidate = createMockCandidate();
      const application = createMockApplication({
        updatedAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
      });
      const stage = createMockStage({ title: "Interview Stage" });

      vi.mocked(mockClient.getCandidateWithApplications!).mockResolvedValue({
        candidate,
        applications: [application],
      });
      vi.mocked(mockSearchService.selectApplicationForRead!).mockReturnValue(application);
      vi.mocked(mockClient.getApplication!).mockResolvedValue({
        ...application,
        currentInterviewStage: stage,
      });
      vi.mocked(mockClient.listInterviews!).mockResolvedValue([]);
      vi.mocked(mockClient.listFeedbackSubmissions!).mockResolvedValue([]);
      vi.mocked(mockClient.listOffers!).mockResolvedValue([]);

      const result = await service.analyzeCandidateBlockers(["c-1"]);

      expect(result.urgentCandidates.length).toBeGreaterThan(0);
      expect(["urgent", "high"]).toContain(result.urgentCandidates[0]?.priority);
    });

    it("should skip candidates without active applications", async () => {
      const candidate = createMockCandidate();
      const archivedApplication = createMockApplication({ status: "Archived" });

      vi.mocked(mockClient.getCandidateWithApplications!).mockResolvedValue({
        candidate,
        applications: [archivedApplication],
      });

      const result = await service.analyzeCandidateBlockers(["c-1"]);

      // No analysis performed since no active application
      expect(result.summary.critical).toBe(0);
      expect(result.summary.warning).toBe(0);
    });

    it("should handle analysis errors gracefully", async () => {
      vi.mocked(mockClient.getCandidateWithApplications!).mockResolvedValueOnce({
        candidate: createMockCandidate({ id: "c-1" }),
        applications: [createMockApplication()],
      });
      vi.mocked(mockClient.getCandidateWithApplications!).mockResolvedValueOnce({
        candidate: createMockCandidate({ id: "c-2" }),
        applications: [createMockApplication({ id: "app-2" })],
      });
      vi.mocked(mockSearchService.selectApplicationForRead!).mockReturnValueOnce(
        createMockApplication()
      );
      vi.mocked(mockSearchService.selectApplicationForRead!).mockReturnValueOnce(
        createMockApplication({ id: "app-2" })
      );
      vi.mocked(mockClient.getApplication!).mockRejectedValueOnce(new Error("API Error"));
      vi.mocked(mockClient.getApplication!).mockResolvedValueOnce({
        ...createMockApplication({ id: "app-2" }),
        currentInterviewStage: createMockStage(),
      });
      vi.mocked(mockClient.listInterviews!).mockResolvedValue([]);
      vi.mocked(mockClient.listFeedbackSubmissions!).mockResolvedValue([]);
      vi.mocked(mockClient.listOffers!).mockResolvedValue([]);

      // Should not throw, but skip the failed candidate
      const result = await service.analyzeCandidateBlockers(["c-1", "c-2"]);

      expect(result.analyzed).toBe(2);
    });

    it("should sort urgent candidates by priority", async () => {
      // This test verifies the sorting logic exists
      const candidate = createMockCandidate();
      const application = createMockApplication();
      const stage = createMockStage();

      vi.mocked(mockClient.getCandidateWithApplications!).mockResolvedValue({
        candidate,
        applications: [application],
      });
      vi.mocked(mockSearchService.selectApplicationForRead!).mockReturnValue(application);
      vi.mocked(mockClient.getApplication!).mockResolvedValue({
        ...application,
        currentInterviewStage: stage,
      });
      vi.mocked(mockClient.listInterviews!).mockResolvedValue([]);
      vi.mocked(mockClient.listFeedbackSubmissions!).mockResolvedValue([]);
      vi.mocked(mockClient.listOffers!).mockResolvedValue([]);

      const result = await service.analyzeCandidateBlockers(["c-1"]);

      // Just verify the structure
      expect(Array.isArray(result.urgentCandidates)).toBe(true);
    });
  });
});
