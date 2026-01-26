/**
 * Analytics Service Tests
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { AnalyticsService } from "./analytics-service.js";
import type { AshbyClient } from "../client.js";
import type { SearchService } from "./search-service.js";
import type { CandidateService } from "./candidate-service.js";
import type { FeedbackService } from "./feedback-service.js";
import type { InterviewService } from "./interview-service.js";
import type { Application, ApplicationWithContext, Candidate, InterviewStage, Job, Note } from "../../types/index.js";

const createMockClient = (): Partial<AshbyClient> => ({
  listApplications: vi.fn(),
  getJob: vi.fn(),
  getApplicationsForJob: vi.fn(),
  listInterviewStages: vi.fn(),
  listJobs: vi.fn(),
});

const createMockSearchService = (): Partial<SearchService> => ({
  selectApplicationForRead: vi.fn(),
});

const createMockCandidateService = (): Partial<CandidateService> => ({
  getCandidateFullContext: vi.fn(),
});

const createMockFeedbackService = (): Partial<FeedbackService> => ({
  getCandidateScorecard: vi.fn(),
});

const createMockInterviewService = (): Partial<InterviewService> => ({
  getInterviewSchedulesForCandidate: vi.fn(),
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
  applicationIds: ["app-1"],
  socialLinks: [],
  tags: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  profileUrl: "https://ashby.com/candidate/c-1",
  ...overrides,
});

const createMockJob = (overrides?: Partial<Job>): Job => ({
  id: "job-1",
  title: "Software Engineer",
  status: "Open",
  employmentType: "FullTime",
  hiringTeam: [],
  jobPostings: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

const createMockStage = (overrides?: Partial<InterviewStage>): InterviewStage => ({
  id: "stage-1",
  title: "Phone Screen",
  orderInInterviewPlan: 1,
  interviewStageType: "Interview",
  ...overrides,
});

const createMockApplicationWithContext = (overrides?: Partial<ApplicationWithContext>): ApplicationWithContext => ({
  id: "app-1",
  candidateId: "c-1",
  status: "Active",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  currentInterviewStageId: "stage-1",
  jobId: "job-1",
  job: createMockJob(),
  candidate: createMockCandidate(),
  currentInterviewStage: createMockStage(),
  daysInCurrentStage: 0,
  isStale: false,
  ...overrides,
});

const createMockNote = (overrides?: Partial<Note>): Note => ({
  id: "n1",
  content: "Test note",
  createdAt: new Date().toISOString(),
  authorId: "user-1",
  visibility: "Public",
  ...overrides,
});

describe("AnalyticsService", () => {
  let service: AnalyticsService;
  let mockClient: Partial<AshbyClient>;
  let mockSearchService: Partial<SearchService>;
  let mockCandidateService: Partial<CandidateService>;
  let mockFeedbackService: Partial<FeedbackService>;
  let mockInterviewService: Partial<InterviewService>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = createMockClient();
    mockSearchService = createMockSearchService();
    mockCandidateService = createMockCandidateService();
    mockFeedbackService = createMockFeedbackService();
    mockInterviewService = createMockInterviewService();
    service = new AnalyticsService(
      mockClient as AshbyClient,
      mockSearchService as SearchService,
      mockCandidateService as CandidateService,
      mockFeedbackService as FeedbackService,
      mockInterviewService as InterviewService
    );
  });

  describe("getSourceAnalytics", () => {
    it("should return source analytics for recent applications", async () => {
      const source = { id: "source-1", title: "LinkedIn", type: "referral" };
      const recentDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

      const activeApps = [
        createMockApplication({ id: "a1", source, createdAt: recentDate }),
        createMockApplication({ id: "a2", source, createdAt: recentDate }),
      ];
      const hiredApps = [
        createMockApplication({
          id: "a3",
          status: "Hired",
          source,
          createdAt: recentDate,
          updatedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
        }),
      ];
      const archivedApps = [
        createMockApplication({ id: "a4", status: "Archived", source, createdAt: recentDate }),
      ];

      vi.mocked(mockClient.listApplications!).mockImplementation((params) => {
        const status = params?.status;
        if (status === "Active") return Promise.resolve(activeApps);
        if (status === "Hired") return Promise.resolve(hiredApps);
        if (status === "Archived") return Promise.resolve(archivedApps);
        return Promise.resolve([]);
      });

      const result = await service.getSourceAnalytics(90);

      expect(result).toHaveLength(1);
      expect(result[0]?.sourceName).toBe("LinkedIn");
      expect(result[0]?.totalApplications).toBe(4);
      expect(result[0]?.activeCount).toBe(2);
      expect(result[0]?.hiredCount).toBe(1);
      expect(result[0]?.archivedCount).toBe(1);
      expect(result[0]?.conversionRate).toBe(25); // 1/4 = 25%
    });

    it("should filter out applications older than days parameter", async () => {
      const oldDate = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString();
      const recentDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const source = { id: "source-1", title: "LinkedIn", type: "referral" };

      vi.mocked(mockClient.listApplications!).mockImplementation((params) => {
        const status = params?.status;
        if (status === "Active") {
          return Promise.resolve([
            createMockApplication({ id: "old", source, createdAt: oldDate }),
            createMockApplication({ id: "recent", source, createdAt: recentDate }),
          ]);
        }
        return Promise.resolve([]);
      });

      const result = await service.getSourceAnalytics(90);

      expect(result[0]?.totalApplications).toBe(1); // Only the recent one
    });

    it("should group applications by source and handle unknown sources", async () => {
      const recentDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

      vi.mocked(mockClient.listApplications!).mockImplementation((params) => {
        const status = params?.status;
        if (status === "Active") {
          const appWithSource = createMockApplication({
            id: "a1",
            source: { id: "s1", title: "LinkedIn", type: "referral" },
            createdAt: recentDate
          });
          const appWithoutSource = createMockApplication({
            id: "a2",
            createdAt: recentDate
          });
          // Remove source property entirely instead of setting to undefined
          delete (appWithoutSource as Partial<Application>).source;
          return Promise.resolve([appWithSource, appWithoutSource]);
        }
        return Promise.resolve([]);
      });

      const result = await service.getSourceAnalytics(90);

      expect(result).toHaveLength(2);
      const unknownSource = result.find(r => r.sourceName === "Unknown Source");
      expect(unknownSource).toBeDefined();
    });

    it("should calculate average days to hire correctly", async () => {
      const createdDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const hiredDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
      const source = { id: "source-1", title: "LinkedIn", type: "referral" };

      vi.mocked(mockClient.listApplications!).mockImplementation((params) => {
        const status = params?.status;
        if (status === "Hired") {
          return Promise.resolve([
            createMockApplication({
              id: "a1",
              status: "Hired",
              source,
              createdAt: createdDate.toISOString(),
              updatedAt: hiredDate.toISOString(),
            }),
          ]);
        }
        return Promise.resolve([]);
      });

      const result = await service.getSourceAnalytics(90);

      expect(result[0]?.avgDaysToHire).toBe(20); // 30 - 10 = 20 days
    });

    it("should sort results by total applications descending", async () => {
      const recentDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

      vi.mocked(mockClient.listApplications!).mockImplementation((params) => {
        const status = params?.status;
        if (status === "Active") {
          return Promise.resolve([
            createMockApplication({
              id: "a1",
              source: { id: "s1", title: "LinkedIn", type: "referral" },
              createdAt: recentDate
            }),
            createMockApplication({
              id: "a2",
              source: { id: "s2", title: "Referral", type: "referral" },
              createdAt: recentDate
            }),
            createMockApplication({
              id: "a3",
              source: { id: "s2", title: "Referral", type: "referral" },
              createdAt: recentDate
            }),
          ]);
        }
        return Promise.resolve([]);
      });

      const result = await service.getSourceAnalytics(90);

      expect(result[0]?.sourceName).toBe("Referral");
      expect(result[0]?.totalApplications).toBe(2);
      expect(result[1]?.sourceName).toBe("LinkedIn");
      expect(result[1]?.totalApplications).toBe(1);
    });
  });

  describe("compareCandidates", () => {
    it("should compare specific candidates by ID", async () => {
      const candidate = createMockCandidate();
      const applications = [createMockApplicationWithContext({ job: createMockJob() })];
      const notes: Note[] = [createMockNote()];

      vi.mocked(mockCandidateService.getCandidateFullContext!).mockResolvedValue({
        candidate,
        applications,
        notes,
      });

      const result = await service.compareCandidates(["c-1"], undefined, 3);

      expect(result.candidates).toHaveLength(1);
      expect(result.candidates[0]?.name).toBe("John Doe");
      expect(result.comparisonFields).toContain("name");
    });

    it("should limit candidates to specified limit", async () => {
      vi.mocked(mockCandidateService.getCandidateFullContext!).mockResolvedValue({
        candidate: createMockCandidate(),
        applications: [],
        notes: [],
      });

      await service.compareCandidates(["c-1", "c-2", "c-3", "c-4"], undefined, 2);

      expect(mockCandidateService.getCandidateFullContext).toHaveBeenCalledTimes(2);
    });

    it("should get job from first candidate active application", async () => {
      const job = createMockJob({ title: "Senior Engineer" });
      vi.mocked(mockCandidateService.getCandidateFullContext!).mockResolvedValue({
        candidate: createMockCandidate(),
        applications: [createMockApplicationWithContext({ status: "Active", job })],
        notes: [],
      });

      const result = await service.compareCandidates(["c-1"]);

      expect(result.job?.title).toBe("Senior Engineer");
    });

    it("should get top candidates for a job when jobId is provided", async () => {
      const job = createMockJob({ id: "job-1", title: "Engineer" });
      const stages = [createMockStage()];
      const jobs = [job];
      const applications = [
        createMockApplication({ candidateId: "c-1" }),
        createMockApplication({ candidateId: "c-2", id: "app-2" }),
      ];

      vi.mocked(mockClient.getJob!).mockResolvedValue(job);
      vi.mocked(mockClient.getApplicationsForJob!).mockResolvedValue(applications);
      vi.mocked(mockClient.listInterviewStages!).mockResolvedValue(stages);
      vi.mocked(mockClient.listJobs!).mockResolvedValue(jobs);
      vi.mocked(mockCandidateService.getCandidateFullContext!).mockResolvedValue({
        candidate: createMockCandidate(),
        applications: [],
        notes: [],
      });

      const result = await service.compareCandidates(undefined, "job-1", 3);

      expect(result.job?.title).toBe("Engineer");
      expect(mockCandidateService.getCandidateFullContext).toHaveBeenCalledTimes(2);
    });

    it("should return empty candidates when no IDs or jobId provided", async () => {
      const result = await service.compareCandidates(undefined, undefined);

      expect(result.candidates).toHaveLength(0);
      expect(result.job).toBeNull();
    });
  });

  describe("getInterviewPrepPacket", () => {
    it("should return prep packet with candidate context", async () => {
      const candidate = createMockCandidate({
        socialLinks: [{ type: "LinkedIn", url: "https://linkedin.com/in/johndoe" }],
        profileUrl: "https://ashby.com/candidate/c-1",
      });
      const job = createMockJob();
      const stage = createMockStage();
      const applications = [createMockApplicationWithContext({
        job,
        currentInterviewStage: stage,
        daysInCurrentStage: 5,
      })];
      const notes: Note[] = [createMockNote({ content: "Good candidate" })];

      vi.mocked(mockCandidateService.getCandidateFullContext!).mockResolvedValue({
        candidate,
        applications,
        notes,
      });
      vi.mocked(mockFeedbackService.getCandidateScorecard!).mockResolvedValue({
        candidate,
        job,
        overallRating: 4.5,
        feedbackCount: 3,
        pros: [],
        cons: [],
        recommendations: [],
        submissions: [],
        attributeRatings: [],
        interviewerScorecards: [],
      });
      vi.mocked(mockInterviewService.getInterviewSchedulesForCandidate!).mockResolvedValue([]);
      vi.mocked(mockSearchService.selectApplicationForRead!).mockReturnValue(applications[0]!);

      const result = await service.getInterviewPrepPacket("c-1");

      expect(result.candidate.name).toBe("John Doe");
      expect(result.job?.title).toBe("Software Engineer");
      expect(result.highlights).toContain("LinkedIn: https://linkedin.com/in/johndoe");
      expect(result.highlights).toContain("Current Stage: Phone Screen");
      expect(result.notes).toHaveLength(1);
    });

    it("should handle feedback service failure gracefully", async () => {
      const candidate = createMockCandidate();
      const applications = [createMockApplicationWithContext()];

      vi.mocked(mockCandidateService.getCandidateFullContext!).mockResolvedValue({
        candidate,
        applications,
        notes: [],
      });
      vi.mocked(mockFeedbackService.getCandidateScorecard!).mockRejectedValue(
        new Error("Scorecard unavailable")
      );
      vi.mocked(mockInterviewService.getInterviewSchedulesForCandidate!).mockResolvedValue([]);
      vi.mocked(mockSearchService.selectApplicationForRead!).mockReturnValue(applications[0]!);

      const result = await service.getInterviewPrepPacket("c-1");

      expect(result.candidate).toBeDefined();
      expect(result.priorFeedback).toBeNull();
    });

    it("should find upcoming interviews", async () => {
      const candidate = createMockCandidate();
      const applications = [createMockApplicationWithContext()];
      const futureTime = new Date(Date.now() + 24 * 60 * 60 * 1000);

      vi.mocked(mockCandidateService.getCandidateFullContext!).mockResolvedValue({
        candidate,
        applications,
        notes: [],
      });
      vi.mocked(mockFeedbackService.getCandidateScorecard!).mockResolvedValue({
        candidate,
        job: null,
        overallRating: null,
        feedbackCount: 0,
        pros: [],
        cons: [],
        recommendations: [],
        submissions: [],
        attributeRatings: [],
        interviewerScorecards: [],
      });
      vi.mocked(mockInterviewService.getInterviewSchedulesForCandidate!).mockResolvedValue([
        {
          id: "schedule-1",
          applicationId: "app-1",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          interviewEvents: [
            {
              id: "event-1",
              startTime: futureTime.toISOString(),
              endTime: new Date(futureTime.getTime() + 60 * 60 * 1000).toISOString(),
              interviewerIds: [],
              interviewers: [],
            },
          ],
        },
      ]);
      vi.mocked(mockSearchService.selectApplicationForRead!).mockReturnValue(applications[0]!);

      const result = await service.getInterviewPrepPacket("c-1");

      expect(result.upcomingInterview).toBeDefined();
      expect(result.upcomingInterview?.id).toBe("event-1");
    });

    it("should throw if candidate context fails", async () => {
      const candidate = createMockCandidate();
      vi.mocked(mockCandidateService.getCandidateFullContext!).mockRejectedValue(
        new Error("Candidate not found")
      );
      vi.mocked(mockFeedbackService.getCandidateScorecard!).mockResolvedValue({
        candidate,
        job: null,
        overallRating: null,
        feedbackCount: 0,
        pros: [],
        cons: [],
        recommendations: [],
        submissions: [],
        attributeRatings: [],
        interviewerScorecards: [],
      });
      vi.mocked(mockInterviewService.getInterviewSchedulesForCandidate!).mockResolvedValue([]);

      await expect(service.getInterviewPrepPacket("c-1")).rejects.toThrow("Candidate not found");
    });

    it("should include source in highlights", async () => {
      const candidate = createMockCandidate({
        source: { id: "s1", title: "LinkedIn", type: "referral" },
        socialLinks: [],
      });
      const applications = [createMockApplicationWithContext()];

      vi.mocked(mockCandidateService.getCandidateFullContext!).mockResolvedValue({
        candidate,
        applications,
        notes: [],
      });
      vi.mocked(mockFeedbackService.getCandidateScorecard!).mockResolvedValue({
        candidate,
        job: null,
        overallRating: null,
        feedbackCount: 0,
        pros: [],
        cons: [],
        recommendations: [],
        submissions: [],
        attributeRatings: [],
        interviewerScorecards: [],
      });
      vi.mocked(mockInterviewService.getInterviewSchedulesForCandidate!).mockResolvedValue([]);
      vi.mocked(mockSearchService.selectApplicationForRead!).mockReturnValue(applications[0]!);

      const result = await service.getInterviewPrepPacket("c-1");

      expect(result.highlights).toContain("Source: LinkedIn");
    });

    it("should include rating in highlights when available", async () => {
      const candidate = createMockCandidate({ socialLinks: [] });
      const applications = [createMockApplicationWithContext()];

      vi.mocked(mockCandidateService.getCandidateFullContext!).mockResolvedValue({
        candidate,
        applications,
        notes: [],
      });
      vi.mocked(mockFeedbackService.getCandidateScorecard!).mockResolvedValue({
        candidate,
        job: null,
        overallRating: 4,
        feedbackCount: 2,
        pros: [],
        cons: [],
        recommendations: [],
        submissions: [],
        attributeRatings: [],
        interviewerScorecards: [],
      });
      vi.mocked(mockInterviewService.getInterviewSchedulesForCandidate!).mockResolvedValue([]);
      vi.mocked(mockSearchService.selectApplicationForRead!).mockReturnValue(applications[0]!);

      const result = await service.getInterviewPrepPacket("c-1");

      expect(result.highlights.some(h => h.includes("Interview Rating:"))).toBe(true);
    });
  });
});
