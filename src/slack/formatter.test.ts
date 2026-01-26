/**
 * Slack Formatter Tests
 */

import { describe, it, expect } from "vitest";
import {
  formatDailySummary,
  formatCandidateList,
  formatCandidateDetails,
  formatPipelineSummary,
  escapeSlack,
} from "./formatter.js";
import type { DailySummaryData, ApplicationWithContext } from "../types/index.js";

describe("Slack Formatter", () => {
  describe("formatDailySummary", () => {
    it("should format daily summary with stale candidates", () => {
      const data: DailySummaryData = {
        staleCandidate: [
          { name: "John Doe", email: "john@example.com", stage: "Phone Screen", daysInStage: 20, job: "Engineer" },
          { name: "Jane Smith", email: "jane@example.com", stage: "Onsite", daysInStage: 15, job: "Designer" },
        ],
        needsDecision: [
          { name: "Bob Wilson", email: "bob@example.com", stage: "Final Round", daysWaiting: 5, job: "Manager" },
        ],
        stats: {
          totalActive: 50,
          openRoles: 10,
          newApplications: 5,
        },
      };

      const result = formatDailySummary(data);

      expect(result).toContain("Daily Pipeline Summary");
      expect(result).toContain("Stale Candidates");
      expect(result).toContain("John Doe");
      expect(result).toContain("20 days");
      expect(result).toContain("Jane Smith");
      expect(result).toContain("Needs Decision");
      expect(result).toContain("Bob Wilson");
      expect(result).toContain("50 active candidates");
      expect(result).toContain("10 open roles");
      expect(result).toContain("5 new applications");
    });

    it("should show celebration when no stale candidates", () => {
      const data: DailySummaryData = {
        staleCandidate: [],
        needsDecision: [],
        stats: {
          totalActive: 25,
          openRoles: 5,
          newApplications: 3,
        },
      };

      const result = formatDailySummary(data);

      expect(result).toContain("None! 🎉");
      expect(result).toContain("None pending");
    });

    it("should include call to action", () => {
      const data: DailySummaryData = {
        staleCandidate: [],
        needsDecision: [],
        stats: { totalActive: 0, openRoles: 0, newApplications: 0 },
      };

      const result = formatDailySummary(data);

      expect(result).toContain("Reply to this thread or @mention me");
    });
  });

  describe("formatCandidateList", () => {
    it("should format empty list", () => {
      const result = formatCandidateList([], "Test List");

      expect(result).toContain("Test List");
      expect(result).toContain("No candidates found");
    });

    it("should format candidate list with details", () => {
      const candidates: ApplicationWithContext[] = [
        {
          id: "app-1",
          candidateId: "c-1",
          status: "Active",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          currentInterviewStageId: "stage-1",
          jobId: "job-1",
          candidate: {
            id: "c-1",
            name: "John Doe",
            primaryEmailAddress: { value: "john@example.com" },
          } as any,
          currentInterviewStage: { id: "s1", title: "Phone Screen" } as any,
          job: { id: "j1", title: "Engineer" } as any,
          daysInCurrentStage: 5,
          isStale: false,
        },
      ];

      const result = formatCandidateList(candidates, "Active Candidates");

      expect(result).toContain("Active Candidates");
      expect(result).toContain("1 total");
      expect(result).toContain("John Doe");
      expect(result).toContain("john@example.com");
      expect(result).toContain("Phone Screen");
      expect(result).toContain("Engineer");
      expect(result).toContain("5 days in stage");
    });

    it("should truncate list at 10 candidates", () => {
      const candidates: ApplicationWithContext[] = Array(15)
        .fill(null)
        .map((_, i) => ({
          id: `app-${i}`,
          candidateId: `c-${i}`,
          status: "Active" as const,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          currentInterviewStageId: "stage-1",
          jobId: "job-1",
          candidate: { id: `c-${i}`, name: `Candidate ${i}` } as any,
          currentInterviewStage: { id: "s1", title: "Stage" } as any,
          job: { id: "j1", title: "Job" } as any,
          daysInCurrentStage: i,
          isStale: false,
        }));

      const result = formatCandidateList(candidates, "All Candidates");

      expect(result).toContain("15 total");
      expect(result).toContain("...and 5 more");
    });

    it("should handle missing candidate data gracefully", () => {
      const candidates: ApplicationWithContext[] = [
        {
          id: "app-1",
          candidateId: "c-1",
          status: "Active",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          currentInterviewStageId: "stage-1",
          jobId: "job-1",
          // Missing candidate, stage, job - use undefined cast to simulate missing data
          candidate: undefined as any,
          currentInterviewStage: null,
          job: undefined as any,
          daysInCurrentStage: 5,
          isStale: false,
        },
      ];

      const result = formatCandidateList(candidates, "Test");

      expect(result).toContain("Unknown");
      expect(result).toContain("No email");
      expect(result).toContain("Unknown stage");
      expect(result).toContain("Unknown job");
    });
  });

  describe("formatCandidateDetails", () => {
    it("should format candidate with full details", () => {
      const context = {
        candidate: {
          name: "John Doe",
          primaryEmailAddress: { value: "john@example.com" },
        },
        applications: [
          {
            id: "app-1",
            status: "Active",
            currentInterviewStage: { id: "s1", title: "Onsite" },
            job: { id: "j1", title: "Senior Engineer" },
            daysInCurrentStage: 3,
            isStale: false,
          } as any,
        ],
        notes: [
          { content: "Great interview performance", createdAt: new Date().toISOString() },
        ],
      };

      const result = formatCandidateDetails(context);

      expect(result).toContain("John Doe");
      expect(result).toContain("john@example.com");
      expect(result).toContain("Applications:");
      expect(result).toContain("Senior Engineer");
      expect(result).toContain("Onsite");
      expect(result).toContain("3 days in current stage");
      expect(result).toContain("Recent Notes:");
      expect(result).toContain("Great interview performance");
    });

    it("should show stale flag for stale applications", () => {
      const context = {
        candidate: { name: "John Doe" },
        applications: [
          {
            id: "app-1",
            status: "Active",
            currentInterviewStage: { id: "s1", title: "Phone Screen" },
            job: { id: "j1", title: "Engineer" },
            daysInCurrentStage: 20,
            isStale: true,
          } as any,
        ],
        notes: [],
      };

      const result = formatCandidateDetails(context);

      expect(result).toContain("⚠️ STALE");
    });

    it("should truncate long notes", () => {
      const longNote = "A".repeat(150);
      const context = {
        candidate: { name: "John Doe" },
        applications: [],
        notes: [{ content: longNote, createdAt: new Date().toISOString() }],
      };

      const result = formatCandidateDetails(context);

      expect(result).toContain("...");
      expect(result.length).toBeLessThan(longNote.length + 200);
    });

    it("should only show first 3 notes", () => {
      const context = {
        candidate: { name: "John Doe" },
        applications: [],
        notes: Array(5)
          .fill(null)
          .map((_, i) => ({ content: `Note ${i}`, createdAt: new Date().toISOString() })),
      };

      const result = formatCandidateDetails(context);

      expect(result).toContain("Note 0");
      expect(result).toContain("Note 1");
      expect(result).toContain("Note 2");
      expect(result).not.toContain("Note 3");
      expect(result).not.toContain("Note 4");
    });

    it("should handle candidate without email", () => {
      const context = {
        candidate: { name: "John Doe", primaryEmailAddress: null },
        applications: [],
        notes: [],
      };

      const result = formatCandidateDetails(context);

      expect(result).toContain("John Doe");
      expect(result).not.toContain("null");
    });
  });

  describe("formatPipelineSummary", () => {
    it("should format complete pipeline summary", () => {
      const summary = {
        totalCandidates: 100,
        staleCount: 15,
        needsDecisionCount: 8,
        byStage: [
          { stage: { title: "Phone Screen" }, count: 30 },
          { stage: { title: "Onsite" }, count: 25 },
          { stage: { title: "Offer" }, count: 5 },
        ],
        byJob: [
          { job: { title: "Engineer" }, count: 60 },
          { job: { title: "Designer" }, count: 40 },
        ],
      };

      const result = formatPipelineSummary(summary);

      expect(result).toContain("Pipeline Overview");
      expect(result).toContain("Total Active Candidates:* 100");
      expect(result).toContain("Stale (>14 days):* 15");
      expect(result).toContain("Needs Decision:* 8");
      expect(result).toContain("By Stage:");
      expect(result).toContain("Phone Screen: 30");
      expect(result).toContain("Onsite: 25");
      expect(result).toContain("Offer: 5");
      expect(result).toContain("By Job:");
      expect(result).toContain("Engineer: 60");
      expect(result).toContain("Designer: 40");
    });

    it("should handle empty stages and jobs", () => {
      const summary = {
        totalCandidates: 0,
        staleCount: 0,
        needsDecisionCount: 0,
        byStage: [],
        byJob: [],
      };

      const result = formatPipelineSummary(summary);

      expect(result).toContain("Total Active Candidates:* 0");
      expect(result).toContain("By Stage:");
      expect(result).toContain("By Job:");
    });
  });

  describe("escapeSlack", () => {
    it("should escape ampersand", () => {
      expect(escapeSlack("AT&T")).toBe("AT&amp;T");
    });

    it("should escape less than", () => {
      expect(escapeSlack("a < b")).toBe("a &lt; b");
    });

    it("should escape greater than", () => {
      expect(escapeSlack("a > b")).toBe("a &gt; b");
    });

    it("should escape multiple characters", () => {
      expect(escapeSlack("<script>alert('XSS')</script>")).toBe(
        "&lt;script&gt;alert('XSS')&lt;/script&gt;"
      );
    });

    it("should handle empty string", () => {
      expect(escapeSlack("")).toBe("");
    });

    it("should not modify safe text", () => {
      expect(escapeSlack("Hello World")).toBe("Hello World");
    });

    it("should escape combined special characters", () => {
      expect(escapeSlack("a < b & c > d")).toBe("a &lt; b &amp; c &gt; d");
    });
  });
});
