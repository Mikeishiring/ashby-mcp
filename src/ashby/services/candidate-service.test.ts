/**
 * Candidate Service Tests
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { CandidateService } from "./candidate-service.js";
import type { AshbyClient } from "../client.js";
import type { Application, Candidate, Note } from "../../types/index.js";

const createMockClient = (): Partial<AshbyClient> => ({
  getCandidateWithApplications: vi.fn(),
  getCandidateNotes: vi.fn(),
  listInterviewStages: vi.fn(),
  listJobs: vi.fn(),
  createCandidate: vi.fn(),
  updateCandidate: vi.fn(),
  addCandidateTag: vi.fn(),
  listCandidateTags: vi.fn(),
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
  profileUrl: "https://app.ashbyhq.com/candidates/c-1",
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

describe("CandidateService", () => {
  let service: CandidateService;
  let mockClient: Partial<AshbyClient>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = createMockClient();
    service = new CandidateService(mockClient as AshbyClient);
  });

  describe("getCandidateFullContext", () => {
    it("should return candidate with all context", async () => {
      const candidate = createMockCandidate();
      const applications = [createMockApplication()];
      const notes: Note[] = [{ id: "n1", content: "Test note", createdAt: new Date().toISOString(), authorId: "user-1", visibility: "Public" }];

      vi.mocked(mockClient.getCandidateWithApplications!).mockResolvedValue({
        candidate,
        applications,
      });
      vi.mocked(mockClient.getCandidateNotes!).mockResolvedValue(notes);
      vi.mocked(mockClient.listInterviewStages!).mockResolvedValue([
        { id: "stage-1", title: "Phone Screen", orderInInterviewPlan: 1, interviewStageType: "Interview" },
      ]);
      vi.mocked(mockClient.listJobs!).mockResolvedValue([
        { id: "job-1", title: "Engineer", status: "Open", employmentType: "FullTime", hiringTeam: [], jobPostings: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      ]);

      const result = await service.getCandidateFullContext("c-1");

      expect(result.candidate).toEqual(candidate);
      expect(result.applications).toHaveLength(1);
      expect(result.notes).toHaveLength(1);
    });

    it("should enrich applications with stage and job info", async () => {
      const candidate = createMockCandidate();
      const applications = [createMockApplication({ currentInterviewStageId: "s1", jobId: "j1" })];

      vi.mocked(mockClient.getCandidateWithApplications!).mockResolvedValue({
        candidate,
        applications,
      });
      vi.mocked(mockClient.getCandidateNotes!).mockResolvedValue([]);
      vi.mocked(mockClient.listInterviewStages!).mockResolvedValue([
        { id: "s1", title: "Onsite Interview", orderInInterviewPlan: 2, interviewStageType: "Interview" },
      ]);
      vi.mocked(mockClient.listJobs!).mockResolvedValue([
        { id: "j1", title: "Senior Engineer", status: "Open", employmentType: "FullTime", hiringTeam: [], jobPostings: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      ]);

      const result = await service.getCandidateFullContext("c-1");

      expect(result.applications[0]!.currentInterviewStage?.title).toBe("Onsite Interview");
      expect(result.applications[0]!.job?.title).toBe("Senior Engineer");
    });

    it("should handle partial failures gracefully", async () => {
      const candidate = createMockCandidate();
      const applications = [createMockApplication()];

      vi.mocked(mockClient.getCandidateWithApplications!).mockResolvedValue({
        candidate,
        applications,
      });
      vi.mocked(mockClient.getCandidateNotes!).mockRejectedValue(new Error("Notes unavailable"));
      vi.mocked(mockClient.listInterviewStages!).mockResolvedValue([]);
      vi.mocked(mockClient.listJobs!).mockResolvedValue([]);

      // Should not throw despite notes failure
      const result = await service.getCandidateFullContext("c-1");

      expect(result.candidate).toEqual(candidate);
      expect(result.notes).toEqual([]);
    });
  });

  describe("createCandidate", () => {
    it("should create a new candidate", async () => {
      const newCandidate = createMockCandidate({ id: "new-c" });
      vi.mocked(mockClient.createCandidate!).mockResolvedValue(newCandidate);

      const result = await service.createCandidate({
        name: "Jane Doe",
        email: "jane@example.com",
      });

      expect(result.id).toBe("new-c");
      expect(mockClient.createCandidate).toHaveBeenCalledWith({
        name: "Jane Doe",
        email: "jane@example.com",
      });
    });
  });

  describe("updateCandidate", () => {
    it("should update candidate fields", async () => {
      const updatedCandidate = createMockCandidate({ name: "John Updated" });
      vi.mocked(mockClient.updateCandidate!).mockResolvedValue(updatedCandidate);

      const result = await service.updateCandidate("c-1", { name: "John Updated" });

      expect(result.name).toBe("John Updated");
      expect(mockClient.updateCandidate).toHaveBeenCalledWith("c-1", { name: "John Updated" });
    });
  });

  describe("addCandidateTag", () => {
    it("should add tag to candidate", async () => {
      const candidate = createMockCandidate();
      vi.mocked(mockClient.addCandidateTag!).mockResolvedValue(candidate);

      await service.addCandidateTag("c-1", "tag-1");

      expect(mockClient.addCandidateTag).toHaveBeenCalledWith("c-1", "tag-1");
    });
  });

  describe("listCandidateTags", () => {
    it("should return all available tags", async () => {
      const tags = [
        { id: "t1", title: "VIP" },
        { id: "t2", title: "Referral" },
      ];
      vi.mocked(mockClient.listCandidateTags!).mockResolvedValue(tags);

      const result = await service.listCandidateTags();

      expect(result).toHaveLength(2);
      expect(result[0]!.title).toBe("VIP");
    });
  });

  describe("isHiredCandidate", () => {
    it("should return true for hired candidates (status)", async () => {
      const candidate = createMockCandidate();
      const applications = [createMockApplication({ status: "Hired" })];

      vi.mocked(mockClient.getCandidateWithApplications!).mockResolvedValue({
        candidate,
        applications,
      });

      const result = await service.isHiredCandidate("c-1");

      expect(result).toBe(true);
    });

    it("should return true for hired candidates (stage title)", async () => {
      const candidate = createMockCandidate();
      const applications = [
        createMockApplication({
          status: "Active",
          currentInterviewStage: {
            id: "hired-stage",
            title: "Hired",
            orderInInterviewPlan: 10,
            interviewStageType: "Interview",
          },
        }),
      ];

      vi.mocked(mockClient.getCandidateWithApplications!).mockResolvedValue({
        candidate,
        applications,
      });

      const result = await service.isHiredCandidate("c-1");

      expect(result).toBe(true);
    });

    it("should return false for non-hired candidates", async () => {
      const candidate = createMockCandidate();
      const applications = [createMockApplication({ status: "Active" })];

      vi.mocked(mockClient.getCandidateWithApplications!).mockResolvedValue({
        candidate,
        applications,
      });

      const result = await service.isHiredCandidate("c-1");

      expect(result).toBe(false);
    });

    it("should return true if any application is hired", async () => {
      const candidate = createMockCandidate({ applicationIds: ["app-1", "app-2"] });
      const applications = [
        createMockApplication({ status: "Archived" }),
        createMockApplication({ id: "app-2", status: "Hired" }),
      ];

      vi.mocked(mockClient.getCandidateWithApplications!).mockResolvedValue({
        candidate,
        applications,
      });

      const result = await service.isHiredCandidate("c-1");

      expect(result).toBe(true);
    });
  });
});
