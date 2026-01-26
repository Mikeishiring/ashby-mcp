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
  formatCandidateName,
  formatResumeLink,
  formatInterviewBriefing,
  formatRelativeTime,
  formatDuration,
} from "./formatter.js";
import type { DailySummaryData, ApplicationWithContext } from "../types/index.js";

describe("Slack Formatter", () => {
  describe("formatDailySummary", () => {
    it("should format daily summary with stale candidates", () => {
      const data: DailySummaryData = {
        staleCandidate: [
          { name: "John Doe", email: "john@example.com", stage: "Phone Screen", daysInStage: 20, job: "Engineer", profileUrl: "https://app.ashbyhq.com/candidates/c-1" },
          { name: "Jane Smith", email: "jane@example.com", stage: "Onsite", daysInStage: 15, job: "Designer", profileUrl: "https://app.ashbyhq.com/candidates/c-2" },
        ],
        needsDecision: [
          { name: "Bob Wilson", email: "bob@example.com", stage: "Final Round", daysWaiting: 5, job: "Manager", profileUrl: "https://app.ashbyhq.com/candidates/c-3" },
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
      // Verify names are hyperlinked
      expect(result).toContain("<https://app.ashbyhq.com/candidates/c-1|John Doe>");
      expect(result).toContain("<https://app.ashbyhq.com/candidates/c-3|Bob Wilson>");
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

  describe("formatCandidateName", () => {
    it("should create hyperlink when profileUrl is provided", () => {
      const result = formatCandidateName(
        "John Doe",
        "https://app.ashbyhq.com/candidates/c-1"
      );

      expect(result).toBe("<https://app.ashbyhq.com/candidates/c-1|John Doe>");
    });

    it("should return just the name when profileUrl is undefined", () => {
      const result = formatCandidateName("John Doe");

      expect(result).toBe("John Doe");
    });

    it("should return just the name when profileUrl is empty", () => {
      const result = formatCandidateName("John Doe", "");

      expect(result).toBe("John Doe");
    });

    it("should escape special characters in name", () => {
      const result = formatCandidateName(
        "John <Doe> & Sons",
        "https://app.ashbyhq.com/candidates/c-1"
      );

      expect(result).toBe("<https://app.ashbyhq.com/candidates/c-1|John &lt;Doe&gt; &amp; Sons>");
    });

    it("should escape special characters even without profileUrl", () => {
      const result = formatCandidateName("John <Doe> & Sons");

      expect(result).toBe("John &lt;Doe&gt; &amp; Sons");
    });
  });

  describe("formatResumeLink", () => {
    it("should format resume download link with candidate name", () => {
      const result = formatResumeLink(
        "John Doe",
        "https://files.ashbyhq.com/resume.pdf"
      );

      expect(result).toContain("Resume for John Doe");
      expect(result).toContain("<https://files.ashbyhq.com/resume.pdf|Download Resume>");
      expect(result).toContain(":page_facing_up:");
    });

    it("should escape special characters in candidate name", () => {
      const result = formatResumeLink(
        "John <Doe> & Sons",
        "https://files.ashbyhq.com/resume.pdf"
      );

      expect(result).toContain("John &lt;Doe&gt; &amp; Sons");
      expect(result).not.toContain("<Doe>");
    });

    it("should handle URL with query parameters", () => {
      const result = formatResumeLink(
        "Jane Smith",
        "https://files.ashbyhq.com/resume.pdf?token=abc123&expires=123456"
      );

      expect(result).toContain("https://files.ashbyhq.com/resume.pdf?token=abc123&expires=123456");
    });
  });

  describe("formatInterviewBriefing", () => {
    const baseBriefing = {
      candidate: {
        name: "John Doe",
        primaryEmailAddress: { value: "john@example.com" },
        profileUrl: "https://app.ashbyhq.com/candidates/c-1",
      },
      job: { title: "Senior Engineer" },
      highlights: ["Source: Referral", "Current Stage: Technical Interview"],
      priorFeedback: null,
      upcomingInterview: null,
      notes: [],
      resumeUrl: null,
      interviewStageName: null,
      scheduledTime: null,
      scheduledEndTime: null,
      meetingLink: null,
      location: null,
      interviewerNames: [],
    };

    it("should format briefing with candidate name linked to profile", () => {
      const result = formatInterviewBriefing(baseBriefing);

      expect(result).toContain("Interview Briefing:");
      expect(result).toContain("<https://app.ashbyhq.com/candidates/c-1|John Doe>");
    });

    it("should include job title", () => {
      const result = formatInterviewBriefing(baseBriefing);

      expect(result).toContain("*Role:* Senior Engineer");
    });

    it("should include highlights", () => {
      const result = formatInterviewBriefing(baseBriefing);

      expect(result).toContain("*Quick Facts*");
      expect(result).toContain("Source: Referral");
      expect(result).toContain("Current Stage: Technical Interview");
    });

    it("should include interview details when present", () => {
      const briefing = {
        ...baseBriefing,
        interviewStageName: "Technical Interview",
        scheduledTime: "2024-01-15T14:00:00Z",
      };

      const result = formatInterviewBriefing(briefing);

      expect(result).toContain("*Interview Details*");
      expect(result).toContain("Type: Technical Interview");
      expect(result).toContain("When:");
    });

    it("should include resume link when available", () => {
      const briefing = {
        ...baseBriefing,
        resumeUrl: "https://files.ashby.com/resume.pdf",
      };

      const result = formatInterviewBriefing(briefing);

      expect(result).toContain(":page_facing_up:");
      expect(result).toContain("<https://files.ashby.com/resume.pdf|Download Resume>");
    });

    it("should include prior feedback when available", () => {
      const briefing = {
        ...baseBriefing,
        priorFeedback: { overallRating: 4, feedbackCount: 3 },
      };

      const result = formatInterviewBriefing(briefing);

      expect(result).toContain("*Prior Interview Feedback*");
      expect(result).toContain("Overall Rating: 4/5 (3 reviews)");
    });

    it("should show feedback count without rating when no numeric rating", () => {
      const briefing = {
        ...baseBriefing,
        priorFeedback: { overallRating: null, feedbackCount: 2 },
      };

      const result = formatInterviewBriefing(briefing);

      expect(result).toContain("2 prior reviews (no numeric rating)");
    });

    it("should include recent notes", () => {
      const briefing = {
        ...baseBriefing,
        notes: [
          { content: "Great communication skills", createdAt: "2024-01-10T10:00:00Z" },
          { content: "Strong technical background", createdAt: "2024-01-09T10:00:00Z" },
        ],
      };

      const result = formatInterviewBriefing(briefing);

      expect(result).toContain("*Recent Notes*");
      expect(result).toContain("Great communication skills");
      expect(result).toContain("Strong technical background");
    });

    it("should truncate long notes", () => {
      const longNote = "A".repeat(100);
      const briefing = {
        ...baseBriefing,
        notes: [{ content: longNote, createdAt: "2024-01-10T10:00:00Z" }],
      };

      const result = formatInterviewBriefing(briefing);

      expect(result).toContain("...");
      // Should be truncated to 80 chars + "..."
      expect(result).not.toContain("A".repeat(100));
    });

    it("should only show first 3 notes", () => {
      const briefing = {
        ...baseBriefing,
        notes: Array(5).fill(null).map((_, i) => ({
          content: `Note ${i}`,
          createdAt: new Date().toISOString(),
        })),
      };

      const result = formatInterviewBriefing(briefing);

      expect(result).toContain("Note 0");
      expect(result).toContain("Note 1");
      expect(result).toContain("Note 2");
      expect(result).not.toContain("Note 3");
      expect(result).not.toContain("Note 4");
    });

    it("should escape special characters in highlights", () => {
      const briefing = {
        ...baseBriefing,
        highlights: ["Source: <script>alert('xss')</script>"],
      };

      const result = formatInterviewBriefing(briefing);

      expect(result).toContain("&lt;script&gt;");
      expect(result).not.toContain("<script>");
    });

    it("should include footer", () => {
      const result = formatInterviewBriefing(baseBriefing);

      expect(result).toContain("Good luck with your interview!");
    });

    it("should handle briefing without job", () => {
      const briefing = {
        ...baseBriefing,
        job: null,
      };

      const result = formatInterviewBriefing(briefing);

      expect(result).not.toContain("*Role:*");
    });

    it("should include interview duration when end time present", () => {
      const briefing = {
        ...baseBriefing,
        interviewStageName: "Technical Interview",
        scheduledTime: "2024-01-15T14:00:00Z",
        scheduledEndTime: "2024-01-15T15:00:00Z",
      };

      const result = formatInterviewBriefing(briefing);

      expect(result).toContain("Duration: 1 hr");
    });

    it("should include meeting link when present", () => {
      const briefing = {
        ...baseBriefing,
        interviewStageName: "Technical Interview",
        scheduledTime: "2024-01-15T14:00:00Z",
        meetingLink: "https://zoom.us/j/123456",
      };

      const result = formatInterviewBriefing(briefing);

      expect(result).toContain("Join:");
      expect(result).toContain("<https://zoom.us/j/123456|Meeting Link>");
    });

    it("should include location for in-person interviews", () => {
      const briefing = {
        ...baseBriefing,
        interviewStageName: "Onsite Interview",
        scheduledTime: "2024-01-15T14:00:00Z",
        location: "Conference Room A",
      };

      const result = formatInterviewBriefing(briefing);

      expect(result).toContain("Location: Conference Room A");
    });

    it("should include interviewer names", () => {
      const briefing = {
        ...baseBriefing,
        interviewStageName: "Panel Interview",
        scheduledTime: "2024-01-15T14:00:00Z",
        interviewerNames: ["Alice Smith", "Bob Jones"],
      };

      const result = formatInterviewBriefing(briefing);

      expect(result).toContain("Panel: Alice Smith, Bob Jones");
    });

    it("should show single interviewer label", () => {
      const briefing = {
        ...baseBriefing,
        interviewStageName: "Technical Interview",
        scheduledTime: "2024-01-15T14:00:00Z",
        interviewerNames: ["Alice Smith"],
      };

      const result = formatInterviewBriefing(briefing);

      expect(result).toContain("Interviewer: Alice Smith");
    });
  });

  describe("formatRelativeTime", () => {
    it("should format past times", () => {
      const pastDate = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago
      const result = formatRelativeTime(pastDate);

      expect(result).toContain("(past)");
    });

    it("should format times in minutes", () => {
      const futureDate = new Date(Date.now() + 30 * 60 * 1000); // 30 mins from now
      const result = formatRelativeTime(futureDate);

      expect(result).toContain("in 30 minute");
    });

    it("should format times in hours", () => {
      const futureDate = new Date(Date.now() + 3 * 60 * 60 * 1000); // 3 hours from now
      const result = formatRelativeTime(futureDate);

      expect(result).toContain("in 3 hours");
    });

    it("should format tomorrow", () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const result = formatRelativeTime(tomorrow);

      expect(result).toContain("tomorrow at");
    });

    it("should format day names for this week", () => {
      const dayAfterTomorrow = new Date();
      dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 3);
      const result = formatRelativeTime(dayAfterTomorrow);

      // Should contain a day name like "Monday", "Tuesday", etc.
      expect(result).toMatch(/(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday) at/);
    });
  });

  describe("formatDuration", () => {
    it("should format duration in minutes", () => {
      const result = formatDuration("2024-01-15T14:00:00Z", "2024-01-15T14:30:00Z");

      expect(result).toBe("30 min");
    });

    it("should format duration in hours", () => {
      const result = formatDuration("2024-01-15T14:00:00Z", "2024-01-15T15:00:00Z");

      expect(result).toBe("1 hr");
    });

    it("should format duration with hours and minutes", () => {
      const result = formatDuration("2024-01-15T14:00:00Z", "2024-01-15T15:30:00Z");

      expect(result).toBe("1 hr 30 min");
    });

    it("should format multi-hour duration", () => {
      const result = formatDuration("2024-01-15T14:00:00Z", "2024-01-15T16:00:00Z");

      expect(result).toBe("2 hr");
    });
  });
});
