/**
 * Ashby Client Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AshbyClient, AshbyApiError } from "./client.js";
import type { Config } from "../config/index.js";

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Mock setTimeout/clearTimeout for rate limiter tests
vi.useFakeTimers({ shouldAdvanceTime: true });

const createMockConfig = (): Config => ({
  slack: { botToken: "test", appToken: "test" },
  anthropic: { apiKey: "test", model: "test", maxTokens: 4096 },
  ashby: { apiKey: "test-api-key", baseUrl: "https://api.ashbyhq.com" },
  safety: {
    mode: "CONFIRM_ALL",
    batchLimit: 10,
    confirmationTimeoutMs: 300000,
  },
  dailySummary: { enabled: false, time: "09:00", timezone: "America/New_York" },
  staleDays: 14,
});

const createMockResponse = (data: unknown, ok = true, status = 200): Response => {
  return {
    ok,
    status,
    statusText: ok ? "OK" : "Error",
    headers: new Headers(),
    json: vi.fn().mockResolvedValue(data),
    text: vi.fn().mockResolvedValue(JSON.stringify(data)),
  } as unknown as Response;
};

describe("AshbyClient", () => {
  let client: AshbyClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new AshbyClient(createMockConfig());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  describe("HTTP Layer", () => {
    it("should make authenticated POST requests", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ success: true, results: { id: "123", name: "Test" } })
      );

      const result = await client.getCandidate("123");

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.ashbyhq.com/candidate.info",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "Content-Type": "application/json",
            Authorization: expect.stringMatching(/^Basic /),
          }),
        })
      );
      expect(result).toEqual({ id: "123", name: "Test" });
    });

    it("should throw AshbyApiError on non-ok response", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ error: "Not Found" }, false, 404)
      );

      await expect(client.getCandidate("invalid")).rejects.toThrow(AshbyApiError);
    });

    it("should throw AshbyApiError when API returns success: false", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({
          success: false,
          errors: [{ message: "Invalid candidate ID" }],
        })
      );

      await expect(client.getCandidate("invalid")).rejects.toThrow(
        /Invalid candidate ID/
      );
    });

    it("should format multiple errors correctly", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({
          success: false,
          errors: [{ message: "Error 1" }, { message: "Error 2" }],
        })
      );

      await expect(client.getCandidate("invalid")).rejects.toThrow(
        /Error 1, Error 2/
      );
    });

    it("should handle string errors", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({
          success: false,
          errors: ["String error message"],
        })
      );

      await expect(client.getCandidate("invalid")).rejects.toThrow(
        /String error message/
      );
    });

    it("should retry on 5xx errors for read endpoints", async () => {
      mockFetch
        .mockResolvedValueOnce(createMockResponse({}, false, 500))
        .mockResolvedValueOnce(
          createMockResponse({ success: true, results: [] })
        );

      // Fast-forward timers for retry delays
      const promise = client.searchCandidates("test");
      await vi.advanceTimersByTimeAsync(1000);
      const result = await promise;

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result).toEqual([]);
    });

    it("should not retry write operations on 5xx errors", async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({}, false, 500));

      await expect(
        client.addNote("123", "test note")
      ).rejects.toThrow(AshbyApiError);

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe("Rate Limiting", () => {
    it("should handle 429 rate limit response", async () => {
      const rateLimitResponse = {
        ok: false,
        status: 429,
        statusText: "Too Many Requests",
        headers: new Headers({ "Retry-After": "1" }),
        json: vi.fn().mockResolvedValue({}),
        text: vi.fn().mockResolvedValue("Rate limited"),
      } as unknown as Response;

      mockFetch
        .mockResolvedValueOnce(rateLimitResponse)
        .mockResolvedValueOnce(
          createMockResponse({ success: true, results: [] })
        );

      const promise = client.searchCandidates("test");
      await vi.advanceTimersByTimeAsync(2000);
      const result = await promise;

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result).toEqual([]);
    });
  });

  describe("Caching", () => {
    it("should cache job listings", async () => {
      mockFetch.mockResolvedValue(
        createMockResponse({
          success: true,
          results: [{ id: "job-1", title: "Engineer" }],
          moreDataAvailable: false,
        })
      );

      // First call
      await client.listJobs();
      // Second call should use cache
      await client.listJobs();

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("should cache users list", async () => {
      mockFetch.mockResolvedValue(
        createMockResponse({
          success: true,
          results: [{ id: "user-1", email: "test@example.com" }],
          moreDataAvailable: false,
        })
      );

      await client.listUsers();
      await client.listUsers();

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("should clear cache when requested", async () => {
      mockFetch.mockResolvedValue(
        createMockResponse({
          success: true,
          results: [{ id: "job-1" }],
          moreDataAvailable: false,
        })
      );

      await client.listJobs();
      client.clearCache();
      await client.listJobs();

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe("Pagination", () => {
    it("should handle paginated responses", async () => {
      mockFetch
        .mockResolvedValueOnce(
          createMockResponse({
            success: true,
            results: [{ id: "1" }, { id: "2" }],
            moreDataAvailable: true,
            nextCursor: "cursor-1",
          })
        )
        .mockResolvedValueOnce(
          createMockResponse({
            success: true,
            results: [{ id: "3" }],
            moreDataAvailable: false,
          })
        );

      const result = await client.listApplications();

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result).toHaveLength(3);
    });
  });

  describe("Candidate Operations", () => {
    it("should search candidates by email", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ success: true, results: [{ id: "1", email: "test@example.com" }] })
      );

      await client.searchCandidates("test@example.com");

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.ashbyhq.com/candidate.search",
        expect.objectContaining({
          body: JSON.stringify({ email: "test@example.com" }),
        })
      );
    });

    it("should search candidates by name", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ success: true, results: [{ id: "1", name: "John Doe" }] })
      );

      await client.searchCandidates("John Doe");

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.ashbyhq.com/candidate.search",
        expect.objectContaining({
          body: JSON.stringify({ name: "John Doe" }),
        })
      );
    });

    it("should get candidate with applications", async () => {
      mockFetch
        .mockResolvedValueOnce(
          createMockResponse({
            success: true,
            results: { id: "c1", name: "Test", applicationIds: ["app1", "app2"] },
          })
        )
        .mockResolvedValueOnce(
          createMockResponse({ success: true, results: { id: "app1" } })
        )
        .mockResolvedValueOnce(
          createMockResponse({ success: true, results: { id: "app2" } })
        );

      const result = await client.getCandidateWithApplications("c1");

      expect(result.candidate.id).toBe("c1");
      expect(result.applications).toHaveLength(2);
    });

    it("should handle partial application failures gracefully", async () => {
      mockFetch
        .mockResolvedValueOnce(
          createMockResponse({
            success: true,
            results: { id: "c1", name: "Test", applicationIds: ["app1", "app2"] },
          })
        )
        .mockResolvedValueOnce(
          createMockResponse({ success: true, results: { id: "app1" } })
        )
        .mockRejectedValueOnce(new Error("Application not found"));

      const result = await client.getCandidateWithApplications("c1");

      expect(result.candidate.id).toBe("c1");
      expect(result.applications).toHaveLength(1);
    });
  });

  describe("Application Operations", () => {
    it("should get application by ID", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ success: true, results: { id: "app1", status: "Active" } })
      );

      const result = await client.getApplication("app1");

      expect(result.id).toBe("app1");
    });

    it("should move application to stage", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({
          success: true,
          results: { id: "app1", currentInterviewStageId: "stage2" },
        })
      );

      const result = await client.moveApplicationStage("app1", "stage2");

      expect(result.currentInterviewStageId).toBe("stage2");
    });

    it("should create application", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ success: true, results: { id: "new-app" } })
      );

      const result = await client.createApplication({
        candidateId: "c1",
        jobId: "j1",
      });

      expect(result.id).toBe("new-app");
    });

    it("should archive application", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ success: true, results: { id: "app1", status: "Archived" } })
      );

      const result = await client.archiveApplication("app1", "reason1");

      expect(result.id).toBe("app1");
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.ashbyhq.com/application.changeStage",
        expect.objectContaining({
          body: JSON.stringify({ applicationId: "app1", archiveReasonId: "reason1" }),
        })
      );
    });
  });

  describe("Job Operations", () => {
    it("should get job by ID", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ success: true, results: { id: "j1", title: "Engineer" } })
      );

      const result = await client.getJob("j1");

      expect(result.id).toBe("j1");
    });

    it("should get open jobs", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({
          success: true,
          results: [
            { id: "j1", status: "Open" },
            { id: "j2", status: "Closed" },
          ],
          moreDataAvailable: false,
        })
      );

      const result = await client.getOpenJobs();

      expect(result).toHaveLength(1);
      expect(result[0]!.status).toBe("Open");
    });
  });

  describe("Interview Operations", () => {
    it("should list interviews with filters", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({
          success: true,
          results: [{ id: "int1" }],
          moreDataAvailable: false,
        })
      );

      await client.listInterviews({ applicationId: "app1" });

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.ashbyhq.com/interview.list",
        expect.objectContaining({
          body: JSON.stringify({ applicationId: "app1" }),
        })
      );
    });

    it("should create interview schedule", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ success: true, results: { id: "sched1" } })
      );

      const result = await client.createInterviewSchedule("app1", [
        {
          startTime: "2024-01-01T10:00:00Z",
          endTime: "2024-01-01T11:00:00Z",
          interviewers: [{ email: "test@example.com" }],
        },
      ]);

      expect(result.id).toBe("sched1");
    });

    it("should cancel interview schedule", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ success: true, results: { success: true } })
      );

      const result = await client.cancelInterviewSchedule("sched1", "No longer needed");

      expect(result.success).toBe(true);
    });
  });

  describe("Note Operations", () => {
    it("should add note with timestamp tag", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ success: true, results: { id: "note1" } })
      );

      await client.addNote("c1", "Test note content");

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.ashbyhq.com/candidate.createNote",
        expect.objectContaining({
          body: expect.stringContaining("[via Slack Bot"),
        })
      );
    });

    it("should get candidate notes", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ success: true, results: [{ id: "note1" }] })
      );

      const result = await client.getCandidateNotes("c1");

      expect(result).toHaveLength(1);
    });
  });

  describe("Offer Operations", () => {
    it("should list offers", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({
          success: true,
          results: [{ id: "offer1" }],
          moreDataAvailable: false,
        })
      );

      const result = await client.listOffers({ applicationId: "app1" });

      expect(result).toHaveLength(1);
    });

    it("should create offer", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ success: true, results: { id: "offer1" } })
      );

      const result = await client.createOffer({
        applicationId: "app1",
        offerProcessId: "proc1",
        startDate: "2024-02-01",
        salary: 100000,
      });

      expect(result.id).toBe("offer1");
    });

    it("should approve offer", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ success: true, results: { id: "offer1", status: "Approved" } })
      );

      const result = await client.approveOffer("offer1", "approver1");

      expect(result.status).toBe("Approved");
    });
  });

  describe("Feedback Operations", () => {
    it("should list feedback submissions", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({
          success: true,
          results: [{ id: "fb1" }],
          moreDataAvailable: false,
        })
      );

      const result = await client.listFeedbackSubmissions({ applicationId: "app1" });

      expect(result).toHaveLength(1);
    });

    it("should get application feedback", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ success: true, results: [{ id: "fb1" }] })
      );

      const result = await client.getApplicationFeedback("app1");

      expect(result).toHaveLength(1);
    });

    it("should handle feedback response with feedbackSubmissions wrapper", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({
          success: true,
          results: { feedbackSubmissions: [{ id: "fb1" }] },
        })
      );

      const result = await client.getApplicationFeedback("app1");

      expect(result).toHaveLength(1);
    });
  });

  describe("User Operations", () => {
    it("should get user by ID", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ success: true, results: { id: "u1", email: "test@example.com" } })
      );

      const result = await client.getUser("u1");

      expect(result.id).toBe("u1");
    });

    it("should search users", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ success: true, results: { users: [{ id: "u1" }] } })
      );

      const result = await client.searchUsers({ email: "test@example.com" });

      expect(result).toHaveLength(1);
    });
  });

  describe("Metadata Operations", () => {
    it("should list archive reasons", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({
          success: true,
          results: { archiveReasons: [{ id: "r1", text: "Not qualified" }] },
        })
      );

      const result = await client.listArchiveReasons();

      expect(result).toHaveLength(1);
    });

    it("should list sources", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({
          success: true,
          results: { sources: [{ id: "s1", title: "LinkedIn" }] },
        })
      );

      const result = await client.listSources();

      expect(result).toHaveLength(1);
    });

    it("should list hiring team roles", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({
          success: true,
          results: { hiringTeamRoles: [{ id: "r1", label: "Hiring Manager" }] },
        })
      );

      const result = await client.listHiringTeamRoles();

      expect(result).toHaveLength(1);
    });

    it("should list locations", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({
          success: true,
          results: { locations: [{ id: "l1", name: "New York" }] },
        })
      );

      const result = await client.listLocations();

      expect(result).toHaveLength(1);
    });

    it("should list departments", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({
          success: true,
          results: { departments: [{ id: "d1", name: "Engineering" }] },
        })
      );

      const result = await client.listDepartments();

      expect(result).toHaveLength(1);
    });

    it("should list custom fields", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({
          success: true,
          results: { customFields: [{ id: "cf1", title: "Start Date", fieldType: "Date" }] },
        })
      );

      const result = await client.listCustomFields();

      expect(result).toHaveLength(1);
    });

    it("should list candidate tags", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({
          success: true,
          results: { candidateTags: [{ id: "t1", title: "VIP" }] },
        })
      );

      const result = await client.listCandidateTags();

      expect(result).toHaveLength(1);
    });
  });
});

describe("AshbyApiError", () => {
  it("should store status code and response body", () => {
    const error = new AshbyApiError("Test error", 404, "Not found");

    expect(error.message).toBe("Test error");
    expect(error.statusCode).toBe(404);
    expect(error.responseBody).toBe("Not found");
    expect(error.name).toBe("AshbyApiError");
  });
});
