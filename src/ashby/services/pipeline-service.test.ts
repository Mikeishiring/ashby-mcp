/**
 * Pipeline Service Tests
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { PipelineService } from "./pipeline-service.js";
import type { AshbyClient } from "../client.js";
import type { Application, InterviewStage, Job } from "../../types/index.js";

const createMockClient = (): Partial<AshbyClient> => ({
  listApplications: vi.fn(),
  listInterviewStages: vi.fn(),
  listJobs: vi.fn(),
  getOpenJobs: vi.fn(),
});

const createMockApplication = (overrides?: Partial<Application>): Application => ({
  id: "app-1",
  candidateId: "c-1",
  status: "Active",
  createdAt: new Date().toISOString(),
  updatedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), // 5 days ago
  currentInterviewStageId: "stage-1",
  jobId: "job-1",
  ...overrides,
});

const createMockStage = (overrides?: Partial<InterviewStage>): InterviewStage => ({
  id: "stage-1",
  title: "Phone Screen",
  orderInInterviewPlan: 1,
  interviewStageType: "Interview",
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

describe("PipelineService", () => {
  let service: PipelineService;
  let mockClient: Partial<AshbyClient>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = createMockClient();
    service = new PipelineService(mockClient as AshbyClient, 14);
  });

  describe("getPipelineSummary", () => {
    it("should return pipeline summary with counts by stage", async () => {
      const stages = [
        createMockStage({ id: "s1", title: "Phone Screen" }),
        createMockStage({ id: "s2", title: "Onsite" }),
      ];
      const jobs = [createMockJob()];
      const applications = [
        createMockApplication({ currentInterviewStageId: "s1" }),
        createMockApplication({ id: "app-2", currentInterviewStageId: "s1" }),
        createMockApplication({ id: "app-3", currentInterviewStageId: "s2" }),
      ];

      vi.mocked(mockClient.listApplications!).mockResolvedValue(applications);
      vi.mocked(mockClient.listInterviewStages!).mockResolvedValue(stages);
      vi.mocked(mockClient.getOpenJobs!).mockResolvedValue(jobs);

      const result = await service.getPipelineSummary();

      expect(result.totalCandidates).toBe(3);
      expect(result.byStage).toHaveLength(2);
      expect(result.byStage.find(s => s.stage.id === "s1")?.count).toBe(2);
      expect(result.byStage.find(s => s.stage.id === "s2")?.count).toBe(1);
    });

    it("should include stale count", async () => {
      const stages = [createMockStage()];
      const jobs = [createMockJob()];
      const staleDate = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString();
      const applications = [
        createMockApplication({ updatedAt: staleDate }),
        createMockApplication({ id: "app-2" }), // Not stale (5 days)
      ];

      vi.mocked(mockClient.listApplications!).mockResolvedValue(applications);
      vi.mocked(mockClient.listInterviewStages!).mockResolvedValue(stages);
      vi.mocked(mockClient.getOpenJobs!).mockResolvedValue(jobs);

      const result = await service.getPipelineSummary();

      expect(result.staleCount).toBe(1);
    });

    it("should include breakdown by job", async () => {
      const stages = [createMockStage()];
      const jobs = [
        createMockJob({ id: "j1", title: "Engineer" }),
        createMockJob({ id: "j2", title: "Designer" }),
      ];
      const applications = [
        createMockApplication({ jobId: "j1" }),
        createMockApplication({ id: "app-2", jobId: "j1" }),
        createMockApplication({ id: "app-3", jobId: "j2" }),
      ];

      vi.mocked(mockClient.listApplications!).mockResolvedValue(applications);
      vi.mocked(mockClient.listInterviewStages!).mockResolvedValue(stages);
      vi.mocked(mockClient.getOpenJobs!).mockResolvedValue(jobs);

      const result = await service.getPipelineSummary();

      expect(result.byJob).toHaveLength(2);
      expect(result.byJob.find(j => j.job.id === "j1")?.count).toBe(2);
      expect(result.byJob.find(j => j.job.id === "j2")?.count).toBe(1);
    });
  });

  describe("getStaleCandidates", () => {
    it("should return applications older than staleDays", async () => {
      const stages = [createMockStage()];
      const jobs = [createMockJob()];
      const staleDate = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString();
      const recentDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
      const applications = [
        createMockApplication({ id: "stale-1", updatedAt: staleDate }),
        createMockApplication({ id: "recent-1", updatedAt: recentDate }),
        createMockApplication({ id: "stale-2", updatedAt: staleDate }),
      ];

      vi.mocked(mockClient.listApplications!).mockResolvedValue(applications);
      vi.mocked(mockClient.listInterviewStages!).mockResolvedValue(stages);
      vi.mocked(mockClient.listJobs!).mockResolvedValue(jobs);

      const result = await service.getStaleCandidates();

      expect(result).toHaveLength(2);
      expect(result.map(a => a.id)).toContain("stale-1");
      expect(result.map(a => a.id)).toContain("stale-2");
    });

    it("should respect limit parameter", async () => {
      const stages = [createMockStage()];
      const jobs = [createMockJob()];
      const staleDate = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString();
      const applications = [
        createMockApplication({ id: "s1", updatedAt: staleDate }),
        createMockApplication({ id: "s2", updatedAt: staleDate }),
        createMockApplication({ id: "s3", updatedAt: staleDate }),
      ];

      vi.mocked(mockClient.listApplications!).mockResolvedValue(applications);
      vi.mocked(mockClient.listInterviewStages!).mockResolvedValue(stages);
      vi.mocked(mockClient.listJobs!).mockResolvedValue(jobs);

      const result = await service.getStaleCandidates(2);

      expect(result).toHaveLength(2);
    });

    it("should sort by oldest first", async () => {
      const stages = [createMockStage()];
      const jobs = [createMockJob()];
      const older = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const newer = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString();
      const applications = [
        createMockApplication({ id: "newer", updatedAt: newer }),
        createMockApplication({ id: "older", updatedAt: older }),
      ];

      vi.mocked(mockClient.listApplications!).mockResolvedValue(applications);
      vi.mocked(mockClient.listInterviewStages!).mockResolvedValue(stages);
      vi.mocked(mockClient.listJobs!).mockResolvedValue(jobs);

      const result = await service.getStaleCandidates();

      expect(result[0]!.id).toBe("older");
    });
  });

  describe("getCandidatesNeedingDecision", () => {
    it("should return applications in decision stages", async () => {
      const stages = [
        createMockStage({ id: "s1", title: "Phone Screen", interviewStageType: "Interview" }),
        createMockStage({ id: "s2", title: "Final Round", interviewStageType: "Interview" }),
        createMockStage({ id: "s3", title: "Offer", interviewStageType: "Offer" }),
      ];
      const jobs = [createMockJob()];
      const applications = [
        createMockApplication({ currentInterviewStageId: "s1" }),
        createMockApplication({ id: "app-2", currentInterviewStageId: "s2" }),
        createMockApplication({ id: "app-3", currentInterviewStageId: "s3" }),
      ];

      vi.mocked(mockClient.listApplications!).mockResolvedValue(applications);
      vi.mocked(mockClient.listInterviewStages!).mockResolvedValue(stages);
      vi.mocked(mockClient.listJobs!).mockResolvedValue(jobs);

      const result = await service.getCandidatesNeedingDecision();

      // "Final Round" and "Offer" stages need decision
      expect(result.length).toBe(2);
    });
  });

  describe("getRecentApplications", () => {
    it("should return applications from recent days", async () => {
      const stages = [createMockStage()];
      const jobs = [createMockJob()];
      const recent = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
      const old = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
      const applications = [
        createMockApplication({ createdAt: recent }),
        createMockApplication({ id: "app-2", createdAt: old }),
      ];

      vi.mocked(mockClient.listApplications!).mockResolvedValue(applications);
      vi.mocked(mockClient.listInterviewStages!).mockResolvedValue(stages);
      vi.mocked(mockClient.listJobs!).mockResolvedValue(jobs);

      const result = await service.getRecentApplications(5);

      expect(result).toHaveLength(1);
    });

    it("should default to 7 days if not specified", async () => {
      const stages = [createMockStage()];
      const jobs = [createMockJob()];
      const recent = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
      const applications = [createMockApplication({ createdAt: recent })];

      vi.mocked(mockClient.listApplications!).mockResolvedValue(applications);
      vi.mocked(mockClient.listInterviewStages!).mockResolvedValue(stages);
      vi.mocked(mockClient.listJobs!).mockResolvedValue(jobs);

      const result = await service.getRecentApplications();

      expect(result).toHaveLength(1);
    });
  });

  describe("getDailySummaryData", () => {
    it("should aggregate all pipeline data", async () => {
      const stages = [createMockStage()];
      const jobs = [createMockJob()];
      const staleDate = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString();
      const applications = [
        createMockApplication(),
        createMockApplication({ id: "app-2", updatedAt: staleDate }),
      ];

      vi.mocked(mockClient.listApplications!).mockResolvedValue(applications);
      vi.mocked(mockClient.listInterviewStages!).mockResolvedValue(stages);
      vi.mocked(mockClient.listJobs!).mockResolvedValue(jobs);
      vi.mocked(mockClient.getOpenJobs!).mockResolvedValue(jobs);

      const result = await service.getDailySummaryData();

      expect(result.staleCandidate).toBeDefined();
      expect(result.needsDecision).toBeDefined();
      expect(result.stats).toBeDefined();
    });
  });

  describe("enrichApplication", () => {
    it("should add stage and job context to application", () => {
      const app = createMockApplication({
        currentInterviewStageId: "s1",
        jobId: "j1",
      });
      const stageMap = new Map([["s1", createMockStage({ id: "s1", title: "Phone Screen" })]]);
      const jobMap = new Map([["j1", createMockJob({ id: "j1", title: "Engineer" })]]);

      const result = service.enrichApplication(app, stageMap, jobMap);

      expect(result.currentInterviewStage?.title).toBe("Phone Screen");
      expect(result.job?.title).toBe("Engineer");
    });

    it("should calculate days in stage", () => {
      const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
      const app = createMockApplication({ updatedAt: tenDaysAgo });

      const result = service.enrichApplication(app, new Map(), new Map());

      expect(result.daysInCurrentStage).toBe(10);
    });

    it("should mark application as stale when past staleDays", () => {
      const twentyDaysAgo = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString();
      const app = createMockApplication({ updatedAt: twentyDaysAgo });

      const result = service.enrichApplication(app, new Map(), new Map());

      expect(result.isStale).toBe(true);
    });

    it("should not mark application review stage as stale", () => {
      const twentyDaysAgo = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString();
      const app = createMockApplication({
        updatedAt: twentyDaysAgo,
        currentInterviewStageId: "review",
      });
      const stageMap = new Map([
        ["review", createMockStage({ id: "review", title: "Application Review" })],
      ]);

      const result = service.enrichApplication(app, stageMap, new Map());

      expect(result.isStale).toBe(false);
    });
  });
});
