/**
 * Feedback Service Tests
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { FeedbackService } from "./feedback-service.js";
import type { AshbyClient } from "../client.js";
import type { SearchService } from "./search-service.js";
import type { Application, Candidate, FeedbackSubmission } from "../../types/index.js";

const createMockClient = (): Partial<AshbyClient> => ({
  listFeedbackSubmissions: vi.fn(),
  getFeedbackSubmission: vi.fn(),
  getApplicationFeedback: vi.fn(),
  getCandidateWithApplications: vi.fn(),
  listJobs: vi.fn(),
});

const createMockSearchService = (): Partial<SearchService> => ({
  selectApplicationForRead: vi.fn(),
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
  profileUrl: "https://app.ashby.com/candidates/c-1",
  ...overrides,
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

const createMockFeedback = (overrides?: Partial<FeedbackSubmission>): FeedbackSubmission => ({
  id: "fb-1",
  applicationId: "app-1",
  submittedAt: new Date().toISOString(),
  overallRating: 4,
  ...overrides,
});

describe("FeedbackService", () => {
  let service: FeedbackService;
  let mockClient: Partial<AshbyClient>;
  let mockSearchService: Partial<SearchService>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = createMockClient();
    mockSearchService = createMockSearchService();
    service = new FeedbackService(
      mockClient as AshbyClient,
      mockSearchService as SearchService
    );
  });

  describe("getCandidateScorecard", () => {
    it("should return scorecard for candidate with feedback", async () => {
      const candidate = createMockCandidate();
      const application = createMockApplication();
      const feedback = [
        createMockFeedback({ overallRating: 4 }),
        createMockFeedback({ id: "fb-2", overallRating: 5 }),
      ];

      vi.mocked(mockClient.getCandidateWithApplications!).mockResolvedValue({
        candidate,
        applications: [application],
      });
      vi.mocked(mockClient.listJobs!).mockResolvedValue([]);
      vi.mocked(mockSearchService.selectApplicationForRead!).mockReturnValue(application);
      vi.mocked(mockClient.getApplicationFeedback!).mockResolvedValue(feedback);

      const result = await service.getCandidateScorecard("c-1");

      expect(result.feedbackCount).toBe(2);
    });

    it("should use specified applicationId when provided", async () => {
      const candidate = createMockCandidate();
      const application = createMockApplication({ id: "specific-app" });

      vi.mocked(mockClient.getCandidateWithApplications!).mockResolvedValue({
        candidate,
        applications: [application],
      });
      vi.mocked(mockClient.listJobs!).mockResolvedValue([]);
      vi.mocked(mockSearchService.selectApplicationForRead!).mockReturnValue(application);
      vi.mocked(mockClient.getApplicationFeedback!).mockResolvedValue([]);

      await service.getCandidateScorecard("c-1", "specific-app");

      expect(mockSearchService.selectApplicationForRead).toHaveBeenCalledWith(
        [application],
        "specific-app"
      );
    });

    it("should handle candidates with no feedback", async () => {
      const candidate = createMockCandidate();
      const application = createMockApplication();

      vi.mocked(mockClient.getCandidateWithApplications!).mockResolvedValue({
        candidate,
        applications: [application],
      });
      vi.mocked(mockClient.listJobs!).mockResolvedValue([]);
      vi.mocked(mockSearchService.selectApplicationForRead!).mockReturnValue(application);
      vi.mocked(mockClient.getApplicationFeedback!).mockResolvedValue([]);

      const result = await service.getCandidateScorecard("c-1");

      expect(result.feedbackCount).toBe(0);
      expect(result.overallRating).toBeNull();
    });

    it("should throw error if no application found", async () => {
      const candidate = createMockCandidate();

      vi.mocked(mockClient.getCandidateWithApplications!).mockResolvedValue({
        candidate,
        applications: [],
      });
      vi.mocked(mockClient.listJobs!).mockResolvedValue([]);
      vi.mocked(mockSearchService.selectApplicationForRead!).mockReturnValue(null);

      await expect(service.getCandidateScorecard("c-1")).rejects.toThrow(
        "No application found"
      );
    });

    it("should include feedback details in scorecard", async () => {
      const candidate = createMockCandidate();
      const application = createMockApplication();
      const feedback = [
        createMockFeedback({
          overallRating: 4,
          submittedByUser: { id: "u1", firstName: "John", lastName: "Doe", email: "john@example.com", globalRole: "Interviewer", isEnabled: true },
        }),
      ];

      vi.mocked(mockClient.getCandidateWithApplications!).mockResolvedValue({
        candidate,
        applications: [application],
      });
      vi.mocked(mockClient.listJobs!).mockResolvedValue([]);
      vi.mocked(mockSearchService.selectApplicationForRead!).mockReturnValue(application);
      vi.mocked(mockClient.getApplicationFeedback!).mockResolvedValue(feedback);

      const result = await service.getCandidateScorecard("c-1");

      expect(result.submissions).toHaveLength(1);
    });
  });

  describe("listFeedbackSubmissions", () => {
    it("should list feedback with no filters", async () => {
      const feedback = [createMockFeedback()];
      vi.mocked(mockClient.listFeedbackSubmissions!).mockResolvedValue(feedback);

      const result = await service.listFeedbackSubmissions();

      expect(result).toHaveLength(1);
      expect(mockClient.listFeedbackSubmissions).toHaveBeenCalledWith(undefined);
    });

    it("should filter by applicationId", async () => {
      const feedback = [createMockFeedback()];
      vi.mocked(mockClient.listFeedbackSubmissions!).mockResolvedValue(feedback);

      await service.listFeedbackSubmissions({ applicationId: "app-1" });

      expect(mockClient.listFeedbackSubmissions).toHaveBeenCalledWith({ applicationId: "app-1" });
    });

    it("should filter by interviewId", async () => {
      const feedback = [createMockFeedback({ interviewId: "int-1" })];
      vi.mocked(mockClient.listFeedbackSubmissions!).mockResolvedValue(feedback);

      await service.listFeedbackSubmissions({ interviewId: "int-1" });

      expect(mockClient.listFeedbackSubmissions).toHaveBeenCalledWith({ interviewId: "int-1" });
    });

    it("should filter by authorId", async () => {
      const feedback = [createMockFeedback()];
      vi.mocked(mockClient.listFeedbackSubmissions!).mockResolvedValue(feedback);

      await service.listFeedbackSubmissions({ authorId: "author-1" });

      expect(mockClient.listFeedbackSubmissions).toHaveBeenCalledWith({ authorId: "author-1" });
    });
  });

  describe("getFeedbackDetails", () => {
    it("should get feedback details by ID", async () => {
      const feedback = createMockFeedback({ id: "fb-123" });
      vi.mocked(mockClient.getFeedbackSubmission!).mockResolvedValue(feedback);

      const result = await service.getFeedbackDetails("fb-123");

      expect(result.id).toBe("fb-123");
      expect(mockClient.getFeedbackSubmission).toHaveBeenCalledWith("fb-123");
    });
  });
});
