/**
 * Search Service Tests
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { SearchService } from "./search-service.js";
import type { AshbyClient } from "../client.js";
import type { Candidate, Application } from "../../types/index.js";

// Mock the AshbyClient
const createMockClient = (): Partial<AshbyClient> => ({
  searchCandidates: vi.fn(),
  getCandidateWithApplications: vi.fn(),
  getApplication: vi.fn(),
});

const mockCandidate = (id: string, name: string, email: string): Candidate => ({
  id,
  name,
  primaryEmailAddress: { value: email, type: "personal", isPrimary: true },
  phoneNumbers: [],
  socialLinks: [],
  tags: [],
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
  applicationIds: [],
  profileUrl: `https://ashby.io/candidates/${id}`,
});

const mockApplication = (id: string, candidateId: string, status: Application["status"]): Application => ({
  id,
  candidateId,
  jobId: "job-1",
  status,
  currentInterviewStageId: "stage-1",
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
});

describe("SearchService", () => {
  let service: SearchService;
  let mockClient: Partial<AshbyClient>;

  beforeEach(() => {
    mockClient = createMockClient();
    service = new SearchService(mockClient as AshbyClient);
  });

  describe("searchCandidates", () => {
    it("should delegate to client", async () => {
      const candidates = [mockCandidate("1", "John Doe", "john@example.com")];
      vi.mocked(mockClient.searchCandidates!).mockResolvedValue(candidates);

      const result = await service.searchCandidates("john");

      expect(mockClient.searchCandidates).toHaveBeenCalledWith("john");
      expect(result).toEqual(candidates);
    });
  });

  describe("findCandidateByNameOrEmail", () => {
    it("should return single match", async () => {
      const candidate = mockCandidate("1", "John Doe", "john@example.com");
      vi.mocked(mockClient.searchCandidates!).mockResolvedValue([candidate]);

      const result = await service.findCandidateByNameOrEmail("john");

      expect(result).toEqual(candidate);
    });

    it("should return null for no results", async () => {
      vi.mocked(mockClient.searchCandidates!).mockResolvedValue([]);

      const result = await service.findCandidateByNameOrEmail("unknown");

      expect(result).toBeNull();
    });

    it("should match by exact email", async () => {
      const john = mockCandidate("1", "John Doe", "john@example.com");
      const johnny = mockCandidate("2", "Johnny Smith", "johnny@example.com");
      vi.mocked(mockClient.searchCandidates!).mockResolvedValue([john, johnny]);

      const result = await service.findCandidateByNameOrEmail("john@example.com");

      expect(result).toEqual(john);
    });

    it("should throw for multiple matches without exact email", async () => {
      const john = mockCandidate("1", "John Doe", "john1@example.com");
      const johnny = mockCandidate("2", "John Smith", "john2@example.com");
      vi.mocked(mockClient.searchCandidates!).mockResolvedValue([john, johnny]);

      await expect(service.findCandidateByNameOrEmail("john")).rejects.toThrow("Multiple candidates");
    });
  });

  describe("selectActiveApplication", () => {
    it("should return single active application", () => {
      const apps = [mockApplication("1", "c1", "Active")];

      const result = service.selectActiveApplication(apps);

      expect(result).toEqual(apps[0]);
    });

    it("should return null for no active applications", () => {
      const apps = [mockApplication("1", "c1", "Archived")];

      const result = service.selectActiveApplication(apps);

      expect(result).toBeNull();
    });

    it("should return specific application when ID provided", () => {
      const apps = [
        mockApplication("1", "c1", "Active"),
        mockApplication("2", "c1", "Active"),
      ];

      const result = service.selectActiveApplication(apps, "2");

      expect(result?.id).toBe("2");
    });

    it("should throw for multiple active without application_id", () => {
      const apps = [
        mockApplication("1", "c1", "Active"),
        mockApplication("2", "c1", "Active"),
      ];

      expect(() => service.selectActiveApplication(apps)).toThrow("Multiple active applications");
    });

    it("should throw if specified application not found", () => {
      const apps = [mockApplication("1", "c1", "Active")];

      expect(() => service.selectActiveApplication(apps, "999")).toThrow("does not belong");
    });

    it("should throw if specified application not active", () => {
      const apps = [mockApplication("1", "c1", "Archived")];

      expect(() => service.selectActiveApplication(apps, "1")).toThrow("not active");
    });
  });

  describe("selectApplicationForRead", () => {
    it("should return single active application", () => {
      const apps = [
        { ...mockApplication("1", "c1", "Active"), updatedAt: "2024-01-01T00:00:00Z" },
      ];

      const result = service.selectApplicationForRead(apps);

      expect(result?.id).toBe("1");
    });

    it("should return most recently updated when no active", () => {
      const apps = [
        { ...mockApplication("1", "c1", "Archived"), updatedAt: "2024-01-01T00:00:00Z" },
        { ...mockApplication("2", "c1", "Archived"), updatedAt: "2024-01-15T00:00:00Z" },
      ];

      const result = service.selectApplicationForRead(apps);

      expect(result?.id).toBe("2");
    });

    it("should prefer non-archived over archived", () => {
      const apps = [
        { ...mockApplication("1", "c1", "Archived"), updatedAt: "2024-01-15T00:00:00Z" },
        { ...mockApplication("2", "c1", "Hired"), updatedAt: "2024-01-01T00:00:00Z" },
      ];

      const result = service.selectApplicationForRead(apps);

      expect(result?.id).toBe("2");
    });
  });
});
