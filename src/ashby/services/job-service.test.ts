/**
 * Job Service Tests
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { JobService } from "./job-service.js";
import type { AshbyClient } from "../client.js";
import type { PipelineService } from "./pipeline-service.js";
import type { Application, ArchiveReason, InterviewStage, Job } from "../../types/index.js";

const createMockClient = (): Partial<AshbyClient> => ({
  getOpenJobs: vi.fn(),
  getJob: vi.fn(),
  getApplicationsForJob: vi.fn(),
  listInterviewStages: vi.fn(),
  listJobs: vi.fn(),
  listArchiveReasons: vi.fn(),
  listSources: vi.fn(),
  listHiringTeamRoles: vi.fn(),
  listApplicationHiringTeam: vi.fn(),
  listCustomFields: vi.fn(),
  listLocations: vi.fn(),
  listDepartments: vi.fn(),
  getApplicationHistory: vi.fn(),
  getInterviewStage: vi.fn(),
});

const createMockPipelineService = (): Partial<PipelineService> => ({
  enrichApplication: vi.fn(),
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

const createMockStage = (overrides?: Partial<InterviewStage>): InterviewStage => ({
  id: "stage-1",
  title: "Phone Screen",
  orderInInterviewPlan: 1,
  interviewStageType: "Interview",
  ...overrides,
});

describe("JobService", () => {
  let service: JobService;
  let mockClient: Partial<AshbyClient>;
  let mockPipelineService: Partial<PipelineService>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = createMockClient();
    mockPipelineService = createMockPipelineService();
    service = new JobService(
      mockClient as AshbyClient,
      mockPipelineService as PipelineService
    );
  });

  describe("getOpenJobs", () => {
    it("should return all open jobs", async () => {
      const jobs = [
        createMockJob({ id: "j1", status: "Open" }),
        createMockJob({ id: "j2", status: "Open" }),
      ];
      vi.mocked(mockClient.getOpenJobs!).mockResolvedValue(jobs);

      const result = await service.getOpenJobs();

      expect(result).toHaveLength(2);
    });
  });

  describe("getJob", () => {
    it("should return job by ID", async () => {
      const job = createMockJob({ id: "j123" });
      vi.mocked(mockClient.getJob!).mockResolvedValue(job);

      const result = await service.getJob("j123");

      expect(result.id).toBe("j123");
    });
  });

  describe("getJobWithCandidates", () => {
    it("should return job with enriched applications", async () => {
      const job = createMockJob();
      const applications = [createMockApplication()];
      const stages = [createMockStage()];
      const jobs = [job];

      vi.mocked(mockClient.getJob!).mockResolvedValue(job);
      vi.mocked(mockClient.getApplicationsForJob!).mockResolvedValue(applications);
      vi.mocked(mockClient.listInterviewStages!).mockResolvedValue(stages);
      vi.mocked(mockClient.listJobs!).mockResolvedValue(jobs);
      vi.mocked(mockPipelineService.enrichApplication!).mockImplementation((app) => ({
        ...app,
        job: job,
        candidate: { id: "c-1", name: "Test Candidate", primaryEmailAddress: null, phoneNumbers: [], socialLinks: [], tags: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), applicationIds: [], profileUrl: "" },
        currentInterviewStage: stages[0] ?? null,
        daysInCurrentStage: 5,
        isStale: false,
      }));

      const result = await service.getJobWithCandidates("job-1");

      expect(result.job.id).toBe("job-1");
      expect(result.candidates).toHaveLength(1);
      expect(mockPipelineService.enrichApplication).toHaveBeenCalled();
    });
  });

  describe("findStageByName", () => {
    it("should find stage by exact name match", async () => {
      const stages = [
        createMockStage({ id: "s1", title: "Phone Screen" }),
        createMockStage({ id: "s2", title: "Onsite" }),
      ];
      vi.mocked(mockClient.listInterviewStages!).mockResolvedValue(stages);

      const result = await service.findStageByName("Phone Screen");

      expect(result?.id).toBe("s1");
    });

    it("should find stage by partial match (case insensitive)", async () => {
      const stages = [
        createMockStage({ id: "s1", title: "Phone Screen" }),
        createMockStage({ id: "s2", title: "Onsite Interview" }),
      ];
      vi.mocked(mockClient.listInterviewStages!).mockResolvedValue(stages);

      const result = await service.findStageByName("phone");

      expect(result?.id).toBe("s1");
    });

    it("should return null if stage not found", async () => {
      const stages = [createMockStage({ title: "Phone Screen" })];
      vi.mocked(mockClient.listInterviewStages!).mockResolvedValue(stages);

      const result = await service.findStageByName("Final Round");

      expect(result).toBeNull();
    });
  });

  describe("getArchiveReasons", () => {
    it("should return all archive reasons", async () => {
      const reasons: ArchiveReason[] = [
        { id: "r1", title: "Not qualified", reasonType: "Rejection" },
        { id: "r2", title: "Position filled", reasonType: "Rejection" },
      ];
      vi.mocked(mockClient.listArchiveReasons!).mockResolvedValue(reasons);

      const result = await service.getArchiveReasons();

      expect(result).toHaveLength(2);
    });
  });

  describe("listSources", () => {
    it("should return all sources", async () => {
      const sources = [
        { id: "src1", title: "LinkedIn" },
        { id: "src2", title: "Referral" },
      ];
      vi.mocked(mockClient.listSources!).mockResolvedValue(sources);

      const result = await service.listSources();

      expect(result).toHaveLength(2);
      expect(result[0]!.title).toBe("LinkedIn");
    });
  });

  describe("listHiringTeamRoles", () => {
    it("should return all hiring team roles", async () => {
      const roles = [
        { id: "role1", label: "Hiring Manager" },
        { id: "role2", label: "Recruiter" },
      ];
      vi.mocked(mockClient.listHiringTeamRoles!).mockResolvedValue(roles);

      const result = await service.listHiringTeamRoles();

      expect(result).toHaveLength(2);
    });
  });

  describe("getApplicationHiringTeam", () => {
    it("should return hiring team for application", async () => {
      const team = [
        { userId: "u1", roleId: "r1", role: { id: "r1", label: "Hiring Manager" } },
      ];
      vi.mocked(mockClient.listApplicationHiringTeam!).mockResolvedValue(team);

      const result = await service.getApplicationHiringTeam("app-1");

      expect(result).toHaveLength(1);
      expect(result[0]!.role.label).toBe("Hiring Manager");
    });
  });

  describe("listCustomFields", () => {
    it("should return all custom fields", async () => {
      const fields = [
        { id: "cf1", title: "Start Date", fieldType: "Date" },
        { id: "cf2", title: "Experience Level", fieldType: "SingleSelect" },
      ];
      vi.mocked(mockClient.listCustomFields!).mockResolvedValue(fields);

      const result = await service.listCustomFields();

      expect(result).toHaveLength(2);
    });
  });

  describe("listLocations", () => {
    it("should return all locations", async () => {
      const locations = [
        { id: "loc1", name: "New York" },
        { id: "loc2", name: "San Francisco" },
      ];
      vi.mocked(mockClient.listLocations!).mockResolvedValue(locations);

      const result = await service.listLocations();

      expect(result).toHaveLength(2);
    });
  });

  describe("listDepartments", () => {
    it("should return all departments", async () => {
      const departments = [
        { id: "dept1", name: "Engineering" },
        { id: "dept2", name: "Product" },
      ];
      vi.mocked(mockClient.listDepartments!).mockResolvedValue(departments);

      const result = await service.listDepartments();

      expect(result).toHaveLength(2);
    });
  });

  describe("getApplicationHistory", () => {
    it("should return application history", async () => {
      const history = [
        { action: "created", timestamp: new Date().toISOString() },
        { action: "stage_changed", timestamp: new Date().toISOString() },
      ];
      vi.mocked(mockClient.getApplicationHistory!).mockResolvedValue(history);

      const result = await service.getApplicationHistory("app-1");

      expect(result).toHaveLength(2);
    });
  });

  describe("getInterviewStageDetails", () => {
    it("should return stage details by ID", async () => {
      const stage = createMockStage({ id: "stage-123" });
      vi.mocked(mockClient.getInterviewStage!).mockResolvedValue(stage);

      const result = await service.getInterviewStageDetails("stage-123");

      expect(result?.id).toBe("stage-123");
    });

    it("should return null if stage not found", async () => {
      vi.mocked(mockClient.getInterviewStage!).mockResolvedValue(null);

      const result = await service.getInterviewStageDetails("invalid");

      expect(result).toBeNull();
    });
  });
});
