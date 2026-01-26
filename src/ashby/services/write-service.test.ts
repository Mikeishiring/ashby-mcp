/**
 * Write Service Tests
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { WriteService } from "./write-service.js";
import type { AshbyClient } from "../client.js";
import type { SearchService } from "./search-service.js";
import type { Application, Note } from "../../types/index.js";
import { AppError, ErrorCode } from "../../utils/errors.js";

const createMockClient = (): Partial<AshbyClient> => ({
  addNote: vi.fn(),
  moveApplicationStage: vi.fn(),
  createApplication: vi.fn(),
  transferApplication: vi.fn(),
  archiveApplication: vi.fn(),
});

const createMockSearchService = (): Partial<SearchService> => ({
  getActiveApplicationForCandidate: vi.fn(),
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

describe("WriteService", () => {
  let service: WriteService;
  let mockClient: Partial<AshbyClient>;
  let mockSearchService: Partial<SearchService>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = createMockClient();
    mockSearchService = createMockSearchService();
    service = new WriteService(
      mockClient as AshbyClient,
      mockSearchService as SearchService
    );
  });

  describe("addNote", () => {
    it("should add a note to a candidate", async () => {
      const note: Note = {
        id: "note-1",
        content: "Test note",
        createdAt: new Date().toISOString(),
        authorId: "user-1",
        visibility: "Public",
      };
      vi.mocked(mockClient.addNote!).mockResolvedValue(note);

      const result = await service.addNote("c-1", "Test note");

      expect(result).toEqual(note);
      expect(mockClient.addNote).toHaveBeenCalledWith("c-1", "Test note");
    });
  });

  describe("moveToStage", () => {
    it("should move application to specified stage", async () => {
      const movedApp = createMockApplication({ currentInterviewStageId: "stage-2" });
      vi.mocked(mockClient.moveApplicationStage!).mockResolvedValue(movedApp);

      const result = await service.moveToStage("app-1", "stage-2");

      expect(result.currentInterviewStageId).toBe("stage-2");
      expect(mockClient.moveApplicationStage).toHaveBeenCalledWith("app-1", "stage-2");
    });
  });

  describe("createApplication", () => {
    it("should create a new application", async () => {
      const newApp = createMockApplication({ id: "new-app" });
      vi.mocked(mockClient.createApplication!).mockResolvedValue(newApp);

      const result = await service.createApplication({
        candidateId: "c-1",
        jobId: "j-1",
      });

      expect(result.id).toBe("new-app");
      expect(mockClient.createApplication).toHaveBeenCalledWith({
        candidateId: "c-1",
        jobId: "j-1",
      });
    });

    it("should pass optional sourceId and creditedToUserId", async () => {
      const newApp = createMockApplication();
      vi.mocked(mockClient.createApplication!).mockResolvedValue(newApp);

      await service.createApplication({
        candidateId: "c-1",
        jobId: "j-1",
        sourceId: "src-1",
        creditedToUserId: "user-1",
      });

      expect(mockClient.createApplication).toHaveBeenCalledWith({
        candidateId: "c-1",
        jobId: "j-1",
        sourceId: "src-1",
        creditedToUserId: "user-1",
      });
    });
  });

  describe("transferApplication", () => {
    it("should transfer application to a different job", async () => {
      const transferredApp = createMockApplication({ jobId: "new-job" });
      vi.mocked(mockClient.transferApplication!).mockResolvedValue(transferredApp);

      const result = await service.transferApplication("app-1", "new-job");

      expect(result.jobId).toBe("new-job");
      expect(mockClient.transferApplication).toHaveBeenCalledWith("app-1", "new-job");
    });
  });

  describe("rejectCandidate", () => {
    it("should reject candidate with active application", async () => {
      const activeApp = createMockApplication();
      const archivedApp = createMockApplication({ status: "Archived" });

      vi.mocked(mockSearchService.getActiveApplicationForCandidate!).mockResolvedValue(activeApp);
      vi.mocked(mockClient.archiveApplication!).mockResolvedValue(archivedApp);

      const result = await service.rejectCandidate("c-1", "reason-1");

      expect(result.status).toBe("Archived");
      expect(mockClient.archiveApplication).toHaveBeenCalledWith("app-1", "reason-1");
    });

    it("should use specified applicationId if provided", async () => {
      const specificApp = createMockApplication({ id: "specific-app" });
      const archivedApp = createMockApplication({ id: "specific-app", status: "Archived" });

      vi.mocked(mockSearchService.getActiveApplicationForCandidate!).mockResolvedValue(specificApp);
      vi.mocked(mockClient.archiveApplication!).mockResolvedValue(archivedApp);

      await service.rejectCandidate("c-1", "reason-1", "specific-app");

      expect(mockSearchService.getActiveApplicationForCandidate).toHaveBeenCalledWith("c-1", "specific-app");
      expect(mockClient.archiveApplication).toHaveBeenCalledWith("specific-app", "reason-1");
    });

    it("should throw error if no active application found", async () => {
      vi.mocked(mockSearchService.getActiveApplicationForCandidate!).mockResolvedValue(null);

      await expect(service.rejectCandidate("c-1", "reason-1")).rejects.toThrow(AppError);
      await expect(service.rejectCandidate("c-1", "reason-1")).rejects.toThrow(
        "No active application found"
      );
    });

    it("should throw AppError with correct error code", async () => {
      vi.mocked(mockSearchService.getActiveApplicationForCandidate!).mockResolvedValue(null);

      try {
        await service.rejectCandidate("c-1", "reason-1");
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        expect((error as AppError).code).toBe(ErrorCode.NO_ACTIVE_APPLICATION);
      }
    });
  });
});
