/**
 * Interview Service Tests
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { InterviewService } from "./interview-service.js";
import type { AshbyClient } from "../client.js";
import type { SearchService } from "./search-service.js";
import type { Application, Candidate, Interview, InterviewEvent, InterviewPlan, InterviewSchedule, User } from "../../types/index.js";

const createMockClient = (): Partial<AshbyClient> => ({
  listInterviewPlans: vi.fn(),
  listUsers: vi.fn(),
  listInterviewSchedules: vi.fn(),
  createInterviewSchedule: vi.fn(),
  listInterviews: vi.fn(),
  getInterview: vi.fn(),
  updateInterviewSchedule: vi.fn(),
  cancelInterviewSchedule: vi.fn(),
  listInterviewEvents: vi.fn(),
  getCandidateWithApplications: vi.fn(),
  getApplication: vi.fn(),
});

const createMockSearchService = (): Partial<SearchService> => ({
  getActiveApplicationForCandidate: vi.fn(),
});

const createMockCandidate = (overrides?: Partial<Candidate>): Candidate => ({
  id: "c-1",
  name: "John Doe",
  primaryEmailAddress: { value: "john@example.com", type: "personal", isPrimary: true },
  phoneNumbers: [],
  socialLinks: [],
  tags: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  profileUrl: "https://app.ashbyhq.com/candidates/c-1",
  applicationIds: ["app-1"],
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

const createMockInterview = (overrides?: Partial<Interview>): Interview => ({
  id: "int-1",
  applicationId: "app-1",
  interviewStageId: "stage-1",
  status: "Scheduled",
  feedbackSubmissions: [],
  interviewers: [],
  scheduledStartTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // Tomorrow
  scheduledEndTime: new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString(),
  ...overrides,
});

describe("InterviewService", () => {
  let service: InterviewService;
  let mockClient: Partial<AshbyClient>;
  let mockSearchService: Partial<SearchService>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = createMockClient();
    mockSearchService = createMockSearchService();
    service = new InterviewService(
      mockClient as AshbyClient,
      mockSearchService as SearchService
    );
  });

  describe("listInterviewPlans", () => {
    it("should return all interview plans", async () => {
      const plans: InterviewPlan[] = [
        {
          id: "plan-1",
          interviewStages: [
            { id: "s1", title: "Phone Screen", orderInInterviewPlan: 1, interviewStageType: "Interview" },
          ],
        },
      ];
      vi.mocked(mockClient.listInterviewPlans!).mockResolvedValue(plans);

      const result = await service.listInterviewPlans();

      expect(result).toHaveLength(1);
      expect(result[0]!.id).toBe("plan-1");
    });
  });

  describe("listUsers", () => {
    it("should return all users", async () => {
      const users: User[] = [
        { id: "u1", email: "john@example.com", firstName: "John", lastName: "Doe", globalRole: "Interviewer", isEnabled: true },
      ];
      vi.mocked(mockClient.listUsers!).mockResolvedValue(users);

      const result = await service.listUsers();

      expect(result).toHaveLength(1);
      expect(result[0]!.email).toBe("john@example.com");
    });
  });

  describe("getUserByEmail", () => {
    it("should find user by exact email match", async () => {
      const users: User[] = [
        { id: "u1", email: "john@example.com", firstName: "John", lastName: "Doe", globalRole: "Interviewer", isEnabled: true },
        { id: "u2", email: "jane@example.com", firstName: "Jane", lastName: "Smith", globalRole: "Admin", isEnabled: true },
      ];
      vi.mocked(mockClient.listUsers!).mockResolvedValue(users);

      const result = await service.getUserByEmail("jane@example.com");

      expect(result).not.toBeNull();
      expect(result!.id).toBe("u2");
      expect(result!.firstName).toBe("Jane");
    });

    it("should be case-insensitive", async () => {
      const users: User[] = [
        { id: "u1", email: "John@Example.COM", firstName: "John", lastName: "Doe", globalRole: "Interviewer", isEnabled: true },
      ];
      vi.mocked(mockClient.listUsers!).mockResolvedValue(users);

      const result = await service.getUserByEmail("john@example.com");

      expect(result).not.toBeNull();
      expect(result!.id).toBe("u1");
    });

    it("should return null if no user found", async () => {
      const users: User[] = [
        { id: "u1", email: "john@example.com", firstName: "John", lastName: "Doe", globalRole: "Interviewer", isEnabled: true },
      ];
      vi.mocked(mockClient.listUsers!).mockResolvedValue(users);

      const result = await service.getUserByEmail("unknown@example.com");

      expect(result).toBeNull();
    });
  });

  describe("getUpcomingInterviewsForUser", () => {
    const futureDate = new Date(Date.now() + 86400000).toISOString(); // Tomorrow
    const pastDate = new Date(Date.now() - 86400000).toISOString(); // Yesterday

    it("should return upcoming interviews for user", async () => {
      const interviews: Interview[] = [
        {
          id: "int-1",
          applicationId: "app-1",
          interviewStageId: "stage-1",
          status: "Scheduled",
          scheduledStartTime: futureDate,
          feedbackSubmissions: [],
          interviewers: [],
        },
      ];
      vi.mocked(mockClient.listInterviews!).mockResolvedValue(interviews);

      const result = await service.getUpcomingInterviewsForUser("u1");

      expect(result).toHaveLength(1);
      expect(result[0]!.id).toBe("int-1");
      expect(mockClient.listInterviews).toHaveBeenCalledWith({
        userId: "u1",
        startDate: expect.any(String),
      });
    });

    it("should filter out past interviews", async () => {
      const interviews: Interview[] = [
        {
          id: "int-past",
          applicationId: "app-1",
          interviewStageId: "stage-1",
          status: "Completed",
          scheduledStartTime: pastDate,
          feedbackSubmissions: [],
          interviewers: [],
        },
        {
          id: "int-future",
          applicationId: "app-2",
          interviewStageId: "stage-1",
          status: "Scheduled",
          scheduledStartTime: futureDate,
          feedbackSubmissions: [],
          interviewers: [],
        },
      ];
      vi.mocked(mockClient.listInterviews!).mockResolvedValue(interviews);

      const result = await service.getUpcomingInterviewsForUser("u1");

      expect(result).toHaveLength(1);
      expect(result[0]!.id).toBe("int-future");
    });

    it("should sort by scheduled time", async () => {
      const soonDate = new Date(Date.now() + 3600000).toISOString(); // 1 hour
      const laterDate = new Date(Date.now() + 86400000).toISOString(); // Tomorrow
      const interviews: Interview[] = [
        {
          id: "int-later",
          applicationId: "app-1",
          interviewStageId: "stage-1",
          status: "Scheduled",
          scheduledStartTime: laterDate,
          feedbackSubmissions: [],
          interviewers: [],
        },
        {
          id: "int-soon",
          applicationId: "app-2",
          interviewStageId: "stage-1",
          status: "Scheduled",
          scheduledStartTime: soonDate,
          feedbackSubmissions: [],
          interviewers: [],
        },
      ];
      vi.mocked(mockClient.listInterviews!).mockResolvedValue(interviews);

      const result = await service.getUpcomingInterviewsForUser("u1");

      expect(result).toHaveLength(2);
      expect(result[0]!.id).toBe("int-soon");
      expect(result[1]!.id).toBe("int-later");
    });

    it("should filter by candidate name when provided", async () => {
      const candidate = createMockCandidate({ name: "Alice Johnson" });
      const application = createMockApplication({ candidate });
      const interviews: Interview[] = [
        {
          id: "int-1",
          applicationId: "app-1",
          interviewStageId: "stage-1",
          status: "Scheduled",
          scheduledStartTime: futureDate,
          feedbackSubmissions: [],
          interviewers: [],
        },
      ];
      vi.mocked(mockClient.listInterviews!).mockResolvedValue(interviews);
      vi.mocked(mockClient.getApplication!).mockResolvedValue(application);

      const result = await service.getUpcomingInterviewsForUser("u1", { candidateName: "alice" });

      expect(result).toHaveLength(1);
      expect(result[0]!.id).toBe("int-1");
    });

    it("should filter out non-matching candidates when candidate name provided", async () => {
      const candidate = createMockCandidate({ name: "Bob Smith" });
      const application = createMockApplication({ candidate });
      const interviews: Interview[] = [
        {
          id: "int-1",
          applicationId: "app-1",
          interviewStageId: "stage-1",
          status: "Scheduled",
          scheduledStartTime: futureDate,
          feedbackSubmissions: [],
          interviewers: [],
        },
      ];
      vi.mocked(mockClient.listInterviews!).mockResolvedValue(interviews);
      vi.mocked(mockClient.getApplication!).mockResolvedValue(application);

      const result = await service.getUpcomingInterviewsForUser("u1", { candidateName: "alice" });

      expect(result).toHaveLength(0);
    });

    it("should respect limit option", async () => {
      const interviews: Interview[] = Array(5).fill(null).map((_, i) => ({
        id: `int-${i}`,
        applicationId: `app-${i}`,
        interviewStageId: "stage-1",
        status: "Scheduled" as const,
        scheduledStartTime: new Date(Date.now() + (i + 1) * 3600000).toISOString(),
        feedbackSubmissions: [],
        interviewers: [],
      }));
      vi.mocked(mockClient.listInterviews!).mockResolvedValue(interviews);

      const result = await service.getUpcomingInterviewsForUser("u1", { limit: 3 });

      expect(result).toHaveLength(3);
    });
  });

  describe("getInterviewSchedulesForCandidate", () => {
    it("should return interview schedules for candidate", async () => {
      const candidate = createMockCandidate();
      const application = createMockApplication();
      const schedules: InterviewSchedule[] = [
        { id: "sched-1", applicationId: "app-1", interviewEvents: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      ];

      vi.mocked(mockClient.getCandidateWithApplications!).mockResolvedValue({
        candidate,
        applications: [application],
      });
      vi.mocked(mockClient.listInterviewSchedules!).mockResolvedValue(schedules);

      const result = await service.getInterviewSchedulesForCandidate("c-1");

      expect(result).toHaveLength(1);
      expect(mockClient.listInterviewSchedules).toHaveBeenCalledWith("app-1");
    });

    it("should return empty array if candidate has no applications", async () => {
      const candidate = createMockCandidate({ applicationIds: [] });

      vi.mocked(mockClient.getCandidateWithApplications!).mockResolvedValue({
        candidate,
        applications: [],
      });

      const result = await service.getInterviewSchedulesForCandidate("c-1");

      expect(result).toEqual([]);
    });

    it("should handle multiple applications", async () => {
      const candidate = createMockCandidate({ applicationIds: ["app-1", "app-2"] });
      const applications = [
        createMockApplication({ id: "app-1" }),
        createMockApplication({ id: "app-2" }),
      ];

      vi.mocked(mockClient.getCandidateWithApplications!).mockResolvedValue({
        candidate,
        applications,
      });
      vi.mocked(mockClient.listInterviewSchedules!)
        .mockResolvedValueOnce([{ id: "sched-1", applicationId: "app-1", interviewEvents: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }])
        .mockResolvedValueOnce([{ id: "sched-2", applicationId: "app-2", interviewEvents: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }]);

      const result = await service.getInterviewSchedulesForCandidate("c-1");

      expect(result).toHaveLength(2);
    });
  });

  describe("scheduleInterview", () => {
    it("should schedule an interview for candidate", async () => {
      const application = createMockApplication();
      const schedule: InterviewSchedule = {
        id: "sched-1",
        applicationId: "app-1",
        interviewEvents: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const users: User[] = [
        { id: "u1", email: "interviewer@example.com", firstName: "Test", lastName: "User", globalRole: "Interviewer", isEnabled: true },
      ];

      vi.mocked(mockSearchService.getActiveApplicationForCandidate!).mockResolvedValue(application);
      vi.mocked(mockClient.listUsers!).mockResolvedValue(users);
      vi.mocked(mockClient.createInterviewSchedule!).mockResolvedValue(schedule);

      const result = await service.scheduleInterview(
        "c-1",
        "2024-01-15T10:00:00Z",
        "2024-01-15T11:00:00Z",
        ["u1"]
      );

      expect(result.id).toBe("sched-1");
      expect(mockClient.createInterviewSchedule).toHaveBeenCalledWith(
        "app-1",
        expect.arrayContaining([
          expect.objectContaining({
            startTime: "2024-01-15T10:00:00Z",
            endTime: "2024-01-15T11:00:00Z",
            interviewers: [{ email: "interviewer@example.com", feedbackRequired: true }],
          }),
        ])
      );
    });

    it("should use specified applicationId if provided", async () => {
      const application = createMockApplication({ id: "specific-app" });
      const users: User[] = [{ id: "u1", email: "test@example.com", firstName: "T", lastName: "U", globalRole: "Interviewer", isEnabled: true }];

      vi.mocked(mockSearchService.getActiveApplicationForCandidate!).mockResolvedValue(application);
      vi.mocked(mockClient.listUsers!).mockResolvedValue(users);
      vi.mocked(mockClient.createInterviewSchedule!).mockResolvedValue({
        id: "sched-1",
        applicationId: "specific-app",
        interviewEvents: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      await service.scheduleInterview(
        "c-1",
        "2024-01-15T10:00:00Z",
        "2024-01-15T11:00:00Z",
        ["u1"],
        undefined,
        undefined,
        "specific-app"
      );

      expect(mockSearchService.getActiveApplicationForCandidate).toHaveBeenCalledWith("c-1", "specific-app");
    });

    it("should include meeting link and location if provided", async () => {
      const application = createMockApplication();
      const users: User[] = [{ id: "u1", email: "test@example.com", firstName: "T", lastName: "U", globalRole: "Interviewer", isEnabled: true }];

      vi.mocked(mockSearchService.getActiveApplicationForCandidate!).mockResolvedValue(application);
      vi.mocked(mockClient.listUsers!).mockResolvedValue(users);
      vi.mocked(mockClient.createInterviewSchedule!).mockResolvedValue({
        id: "sched-1",
        applicationId: "app-1",
        interviewEvents: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      await service.scheduleInterview(
        "c-1",
        "2024-01-15T10:00:00Z",
        "2024-01-15T11:00:00Z",
        ["u1"],
        "https://zoom.us/j/123",
        "Conference Room A"
      );

      expect(mockClient.createInterviewSchedule).toHaveBeenCalledWith(
        "app-1",
        expect.arrayContaining([
          expect.objectContaining({
            meetingLink: "https://zoom.us/j/123",
            location: "Conference Room A",
          }),
        ])
      );
    });

    it("should throw error if no application found", async () => {
      vi.mocked(mockSearchService.getActiveApplicationForCandidate!).mockResolvedValue(null);

      await expect(
        service.scheduleInterview("c-1", "2024-01-15T10:00:00Z", "2024-01-15T11:00:00Z", ["u1"])
      ).rejects.toThrow("No active application");
    });
  });

  describe("listAllInterviews", () => {
    it("should list interviews without filters", async () => {
      const interviews = [createMockInterview()];
      vi.mocked(mockClient.listInterviews!).mockResolvedValue(interviews);

      const result = await service.listAllInterviews();

      expect(result).toHaveLength(1);
      expect(mockClient.listInterviews).toHaveBeenCalledWith(undefined);
    });

    it("should apply filters when provided", async () => {
      const interviews = [createMockInterview()];
      vi.mocked(mockClient.listInterviews!).mockResolvedValue(interviews);

      await service.listAllInterviews({ applicationId: "app-1", userId: "u1" });

      expect(mockClient.listInterviews).toHaveBeenCalledWith({
        applicationId: "app-1",
        userId: "u1",
      });
    });
  });

  describe("getInterview", () => {
    it("should get interview by ID", async () => {
      const interview = createMockInterview({ id: "int-123" });
      vi.mocked(mockClient.getInterview!).mockResolvedValue(interview);

      const result = await service.getInterview("int-123");

      expect(result.id).toBe("int-123");
    });
  });

  describe("getUpcomingInterviews", () => {
    it("should return interviews scheduled in the future", async () => {
      const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      const interviews = [
        createMockInterview({ id: "future", scheduledStartTime: futureDate }),
        createMockInterview({ id: "past", scheduledStartTime: pastDate }),
      ];
      vi.mocked(mockClient.listInterviews!).mockResolvedValue(interviews);

      const result = await service.getUpcomingInterviews();

      expect(result).toHaveLength(1);
      expect(result[0]!.id).toBe("future");
    });

    it("should respect limit parameter", async () => {
      const futureDate1 = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const futureDate2 = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
      const futureDate3 = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();

      const interviews = [
        createMockInterview({ id: "i1", scheduledStartTime: futureDate1 }),
        createMockInterview({ id: "i2", scheduledStartTime: futureDate2 }),
        createMockInterview({ id: "i3", scheduledStartTime: futureDate3 }),
      ];
      vi.mocked(mockClient.listInterviews!).mockResolvedValue(interviews);

      const result = await service.getUpcomingInterviews(2);

      expect(result).toHaveLength(2);
    });

    it("should sort by start time ascending", async () => {
      const sooner = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
      const later = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      const interviews = [
        createMockInterview({ id: "later", scheduledStartTime: later }),
        createMockInterview({ id: "sooner", scheduledStartTime: sooner }),
      ];
      vi.mocked(mockClient.listInterviews!).mockResolvedValue(interviews);

      const result = await service.getUpcomingInterviews();

      expect(result[0]!.id).toBe("sooner");
      expect(result[1]!.id).toBe("later");
    });
  });

  describe("rescheduleInterview", () => {
    it("should update interview schedule", async () => {
      const users: User[] = [{ id: "u1", email: "test@example.com", firstName: "T", lastName: "U", globalRole: "Interviewer", isEnabled: true }];
      const updatedSchedule: InterviewSchedule = {
        id: "sched-1",
        applicationId: "app-1",
        interviewEvents: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      vi.mocked(mockClient.listUsers!).mockResolvedValue(users);
      vi.mocked(mockClient.updateInterviewSchedule!).mockResolvedValue(updatedSchedule);

      const result = await service.rescheduleInterview(
        "sched-1",
        "2024-01-20T10:00:00Z",
        "2024-01-20T11:00:00Z",
        ["u1"]
      );

      expect(result.id).toBe("sched-1");
      expect(mockClient.updateInterviewSchedule).toHaveBeenCalledWith(
        "sched-1",
        expect.arrayContaining([
          expect.objectContaining({
            startTime: "2024-01-20T10:00:00Z",
            endTime: "2024-01-20T11:00:00Z",
          }),
        ])
      );
    });
  });

  describe("cancelInterview", () => {
    it("should cancel interview schedule", async () => {
      vi.mocked(mockClient.cancelInterviewSchedule!).mockResolvedValue({ success: true });

      const result = await service.cancelInterview("sched-1", "Candidate withdrew");

      expect(result.success).toBe(true);
      expect(mockClient.cancelInterviewSchedule).toHaveBeenCalledWith("sched-1", "Candidate withdrew");
    });

    it("should work without cancellation reason", async () => {
      vi.mocked(mockClient.cancelInterviewSchedule!).mockResolvedValue({ success: true });

      await service.cancelInterview("sched-1");

      expect(mockClient.cancelInterviewSchedule).toHaveBeenCalledWith("sched-1", undefined);
    });
  });

  describe("listInterviewEvents", () => {
    it("should list interview events", async () => {
      const events: InterviewEvent[] = [
        {
          id: "evt-1",
          startTime: new Date().toISOString(),
          endTime: new Date().toISOString(),
          interviewerIds: [],
        },
      ];
      vi.mocked(mockClient.listInterviewEvents!).mockResolvedValue(events);

      const result = await service.listInterviewEvents("sched-1");

      expect(result).toHaveLength(1);
      expect(mockClient.listInterviewEvents).toHaveBeenCalledWith("sched-1");
    });
  });
});
