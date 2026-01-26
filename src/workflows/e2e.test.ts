/**
 * Workflow E2E Tests
 *
 * End-to-end tests for complete workflow scenarios.
 * These tests simulate full user journeys through the workflow system
 * without external dependencies - all Ashby/Slack interactions are mocked.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { WorkflowManager } from "./manager.js";
import { WorkflowTriggerService } from "./trigger-service.js";
import type { AshbyService } from "../ashby/service.js";
import type {
  Application,
  Candidate,
  Interview,
  Offer,
  User,
  Job,
  Scorecard,
  FeedbackSubmission,
} from "../types/index.js";
import type { WorkflowState, WorkflowType } from "./types.js";

// ============================================================================
// E2E Test Utilities
// ============================================================================

/**
 * Simulates a complete workflow journey from trigger to completion
 */
interface WorkflowJourney {
  manager: WorkflowManager;
  triggerService: WorkflowTriggerService;
  mockAshby: MockAshbyService;
}

type MockAshbyService = {
  [K in keyof AshbyService]?: ReturnType<typeof vi.fn>;
};

const createMockAshbyService = (): MockAshbyService => ({
  getJob: vi.fn(),
  getApplication: vi.fn(),
  getCandidateWithApplications: vi.fn(),
  analyzeCandidateBlockers: vi.fn(),
  getJobWithCandidates: vi.fn(),
  getInterviewStageDetails: vi.fn(),
  getCandidateScorecard: vi.fn(),
  listFeedbackSubmissions: vi.fn(),
  listUsers: vi.fn(),
  getStaleCandidates: vi.fn(),
  listAllInterviews: vi.fn(),
  getUpcomingInterviews: vi.fn(),
  rejectCandidate: vi.fn(),
  moveToStage: vi.fn(),
  approveOffer: vi.fn(),
  sendOffer: vi.fn(),
});

const createJourney = (): WorkflowJourney => {
  const mockAshby = createMockAshbyService();
  const manager = new WorkflowManager();
  const triggerService = new WorkflowTriggerService(mockAshby as unknown as AshbyService);
  return { manager, triggerService, mockAshby };
};

/**
 * Helper to create a session and return it
 */
const createSession = (
  manager: WorkflowManager,
  state: WorkflowState,
  channelId: string,
  messageTs: string,
  userId: string
) => {
  return manager.create({
    type: state.type as WorkflowType,
    state,
    channelId,
    messageTs,
    userId,
  });
};

// Mock data factories
const mockUser = (id = "user-1"): User => ({
  id,
  email: `${id}@example.com`,
  firstName: "Test",
  lastName: "User",
  globalRole: "Interviewer",
  isEnabled: true,
});

const mockCandidate = (id = "candidate-1", name = "John Doe"): Candidate => ({
  id,
  name,
  primaryEmailAddress: { value: `${name.toLowerCase().replace(" ", ".")}@example.com`, type: "work", isPrimary: true },
  phoneNumbers: [],
  socialLinks: [],
  tags: [],
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
  applicationIds: ["app-1"],
  profileUrl: `https://app.ashbyhq.com/candidate/${id}`,
});

const mockJob = (id = "job-1", title = "Software Engineer"): Job => ({
  id,
  title,
  status: "Open",
  employmentType: "FullTime",
  hiringTeam: [],
  jobPostings: [],
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
});

const mockApplication = (overrides: Partial<Application> = {}): Application => ({
  id: "app-1",
  candidateId: "candidate-1",
  jobId: "job-1",
  status: "Active",
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
  currentInterviewStageId: "stage-1",
  job: mockJob(),
  ...overrides,
});

const mockInterview = (overrides: Partial<Interview> = {}): Interview => ({
  id: "interview-1",
  applicationId: "app-1",
  interviewStageId: "stage-1",
  status: "Scheduled",
  scheduledStartTime: "2024-01-15T10:00:00Z",
  scheduledEndTime: "2024-01-15T11:00:00Z",
  interviewStage: { id: "stage-1", title: "Technical Interview", orderInInterviewPlan: 1, interviewStageType: "Interview" },
  interviewers: [{ userId: "user-1" }],
  feedbackSubmissions: [],
  ...overrides,
});

const mockOffer = (overrides: Partial<Offer> = {}): Offer => ({
  id: "offer-1",
  applicationId: "app-1",
  status: "Draft",
  offerProcessId: "process-1",
  salary: 150000,
  salaryFrequency: "Annual",
  currency: "USD",
  startDate: "2024-03-01",
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
  ...overrides,
});

const mockScorecard = (): Scorecard => ({
  candidate: mockCandidate(),
  job: mockJob(),
  overallRating: 4.5,
  feedbackCount: 3,
  pros: [],
  cons: [],
  recommendations: ["Strong hire"],
  submissions: [],
  attributeRatings: [],
  interviewerScorecards: [],
});

// ============================================================================
// E2E Test Scenarios
// ============================================================================

describe("Workflow E2E: Quick Feedback Journey", () => {
  let journey: WorkflowJourney;

  beforeEach(() => {
    vi.clearAllMocks();
    journey = createJourney();
  });

  afterEach(() => {
    journey.manager.shutdown();
  });

  it("should complete quick feedback journey: interview → reaction → result", async () => {
    // Step 1: Trigger workflow after interview completes
    const state = await journey.triggerService.createQuickFeedbackState({
      interview: mockInterview(),
      interviewer: mockUser(),
      candidate: mockCandidate(),
      application: mockApplication(),
    });

    expect(state.type).toBe("quick_feedback");
    expect(state.candidateName).toBe("John Doe");

    // Step 2: Create session (simulating Slack message post)
    const session = createSession(
      journey.manager,
      state,
      "C123456",
      "1234567890.123456",
      "user-1"
    );

    expect(session.type).toBe("quick_feedback");
    expect(journey.manager.get(session.id)).not.toBeNull();

    // Step 3: Interviewer reacts with double_vertical_bar (thinking - completes immediately)
    const reaction1 = await journey.manager.handleReaction(
      session,
      "double_vertical_bar",
      "user-1"
    );

    expect(reaction1.handled).toBe(true);
    expect(reaction1.message?.toLowerCase()).toContain("no rush");
    expect(reaction1.completed).toBe(true);
  });

  it("should reject reactions from non-interviewers", async () => {
    const state = await journey.triggerService.createQuickFeedbackState({
      interview: mockInterview(),
      interviewer: mockUser("interviewer-1"),
      candidate: mockCandidate(),
      application: mockApplication(),
    });

    const session = createSession(
      journey.manager,
      state,
      "C123456",
      "1234567890.123456",
      "interviewer-1"
    );

    // Different user tries to react - should not be handled
    const reaction = await journey.manager.handleReaction(
      session,
      "thumbsup",
      "other-user"
    );

    expect(reaction.handled).toBe(false);
  });

  it("should handle all feedback reaction types", async () => {
    const testCases = [
      { emoji: "thumbsup", expectedContains: "stood out" },
      { emoji: "thinking_face", expectedContains: "pause" },
      { emoji: "thumbsdown", expectedContains: "concerns" },
      { emoji: "double_vertical_bar", expectedContains: "no rush" },
    ];

    for (const { emoji, expectedContains } of testCases) {
      const testJourney = createJourney();

      const state = await testJourney.triggerService.createQuickFeedbackState({
        interview: mockInterview(),
        interviewer: mockUser(),
        candidate: mockCandidate(),
        application: mockApplication(),
      });

      const session = createSession(
        testJourney.manager,
        state,
        "C123456",
        `ts-${emoji}`,
        "user-1"
      );

      const reaction = await testJourney.manager.handleReaction(session, emoji, "user-1");

      expect(reaction.handled).toBe(true);
      expect(reaction.message?.toLowerCase()).toContain(expectedContains);

      testJourney.manager.shutdown();
    }
  });
});

describe("Workflow E2E: Offer Approval Journey", () => {
  let journey: WorkflowJourney;

  beforeEach(() => {
    vi.clearAllMocks();
    journey = createJourney();

    // Setup mock responses
    (journey.mockAshby.getApplication as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockApplication()
    );
    (journey.mockAshby.getCandidateWithApplications as ReturnType<typeof vi.fn>).mockResolvedValue({
      candidate: mockCandidate(),
      applications: [],
    });
  });

  afterEach(() => {
    journey.manager.shutdown();
  });

  it("should complete offer approval journey: create → approve → send", async () => {
    // Step 1: Create offer approval workflow
    const state = await journey.triggerService.createOfferApprovalState({
      offer: mockOffer(),
      approverUserId: "approver-1",
    });

    expect(state.type).toBe("offer_approval");
    expect(state.salary).toBe(150000);
    expect(state.phase).toBe("approval");

    // Step 2: Create session
    const session = createSession(
      journey.manager,
      state,
      "C123456",
      "1234567890.123456",
      "approver-1"
    );

    // Step 3: Approver clicks approve
    const approveResult = await journey.manager.handleReaction(
      session,
      "white_check_mark",
      "approver-1"
    );

    expect(approveResult.handled).toBe(true);
    expect(approveResult.apiAction).toMatchObject({
      type: "approve_offer",
      params: { offerId: "offer-1", approverId: "approver-1" },
    });
    // After approval, workflow transitions to send phase
    expect(approveResult.followUp).toBeDefined();
  });

  it("should handle offer rejection", async () => {
    const state = await journey.triggerService.createOfferApprovalState({
      offer: mockOffer(),
      approverUserId: "approver-1",
    });

    const session = createSession(
      journey.manager,
      state,
      "C123456",
      "1234567890.123456",
      "approver-1"
    );

    const rejectResult = await journey.manager.handleReaction(
      session,
      "x",
      "approver-1"
    );

    expect(rejectResult.handled).toBe(true);
    expect(rejectResult.message).toContain("not approved");
    expect(rejectResult.completed).toBe(true);
  });

  it("should handle request for comments", async () => {
    const state = await journey.triggerService.createOfferApprovalState({
      offer: mockOffer(),
      approverUserId: "approver-1",
    });

    const session = createSession(
      journey.manager,
      state,
      "C123456",
      "1234567890.123456",
      "approver-1"
    );

    const commentResult = await journey.manager.handleReaction(
      session,
      "speech_balloon",
      "approver-1"
    );

    expect(commentResult.handled).toBe(true);
    expect(commentResult.message).toContain("comment");
  });
});

describe("Workflow E2E: Daily Digest Journey", () => {
  let journey: WorkflowJourney;

  beforeEach(() => {
    vi.clearAllMocks();
    journey = createJourney();
  });

  afterEach(() => {
    journey.manager.shutdown();
  });

  it("should create digest and respond to actions", async () => {
    // Setup mock blocker analysis
    (journey.mockAshby.analyzeCandidateBlockers as ReturnType<typeof vi.fn>).mockResolvedValue({
      totalCandidates: 5,
      byBlockerType: {
        no_blocker: [
          { candidate: mockCandidate("c1"), applicationId: "app-1", blocker: { type: "no_blocker", message: "", severity: "info", suggestedAction: "" } },
          { candidate: mockCandidate("c2"), applicationId: "app-2", blocker: { type: "no_blocker", message: "", severity: "info", suggestedAction: "" } },
        ],
        missing_feedback: [
          { candidate: mockCandidate("c3", "Alice"), applicationId: "app-3", blocker: { type: "missing_feedback", message: "Needs feedback", severity: "warning", suggestedAction: "Follow up" } },
        ],
        ready_to_move: [
          { candidate: mockCandidate("c4", "Bob"), applicationId: "app-4", blocker: { type: "ready_to_move", message: "Ready", severity: "info", suggestedAction: "Move forward" } },
        ],
      },
      summary: { critical: 0, warning: 1, info: 2 },
    });

    // Step 1: Create daily digest
    const state = await journey.triggerService.createDailyDigestState();

    expect(state.type).toBe("daily_digest");
    expect(state.onTrack).toBe(2);
    expect(state.readyToMove).toHaveLength(1);

    // Step 2: Create session
    const session = createSession(
      journey.manager,
      state,
      "C123456",
      "1234567890.123456",
      "manager-1"
    );

    // Step 3: Manager clicks to show who needs decisions
    const result = await journey.manager.handleReaction(
      session,
      "white_check_mark",
      "manager-1"
    );

    expect(result.handled).toBe(true);
    expect(result.message?.toLowerCase()).toContain("decision");
  });

  it("should show today's interviews on date emoji", async () => {
    (journey.mockAshby.analyzeCandidateBlockers as ReturnType<typeof vi.fn>).mockResolvedValue({
      totalCandidates: 0,
      byBlockerType: {},
      summary: { critical: 0, warning: 0, info: 0 },
    });

    const state = await journey.triggerService.createDailyDigestState();
    const session = createSession(
      journey.manager,
      state,
      "C123456",
      "1234567890.123456",
      "manager-1"
    );

    const result = await journey.manager.handleReaction(
      session,
      "date",
      "manager-1"
    );

    expect(result.handled).toBe(true);
    expect(result.message?.toLowerCase()).toContain("interview");
  });
});

describe("Workflow E2E: Scheduling Confirm Journey", () => {
  let journey: WorkflowJourney;

  beforeEach(() => {
    vi.clearAllMocks();
    journey = createJourney();
  });

  afterEach(() => {
    journey.manager.shutdown();
  });

  it("should complete scheduling confirmation journey", async () => {
    // Step 1: Create scheduling confirmation (sync, no API calls needed)
    const state = journey.triggerService.createSchedulingConfirmState({
      interviewScheduleId: "sched-1",
      interviewer: mockUser(),
      candidate: mockCandidate(),
      jobTitle: "Software Engineer",
      scheduledTime: "2024-01-20T14:00:00Z",
      duration: "60 minutes",
      meetingLink: "https://zoom.us/j/123",
    });

    expect(state.type).toBe("scheduling_confirm");

    // Step 2: Create session
    const session = createSession(
      journey.manager,
      state,
      "C123456",
      "1234567890.123456",
      "user-1"
    );

    // Step 3: Interviewer confirms
    const confirmResult = await journey.manager.handleReaction(
      session,
      "white_check_mark",
      "user-1"
    );

    expect(confirmResult.handled).toBe(true);
    expect(confirmResult.message).toContain("confirmed");
    expect(confirmResult.completed).toBe(true);
  });

  it("should handle reschedule request", async () => {
    const state = journey.triggerService.createSchedulingConfirmState({
      interviewScheduleId: "sched-1",
      interviewer: mockUser(),
      candidate: mockCandidate(),
      jobTitle: "Software Engineer",
      scheduledTime: "2024-01-20T14:00:00Z",
      duration: "60 minutes",
    });

    const session = createSession(
      journey.manager,
      state,
      "C123456",
      "1234567890.123456",
      "user-1"
    );

    const rescheduleResult = await journey.manager.handleReaction(
      session,
      "arrows_counterclockwise",
      "user-1"
    );

    expect(rescheduleResult.handled).toBe(true);
    expect(rescheduleResult.message?.toLowerCase()).toContain("works better");
  });
});

describe("Workflow E2E: Rejection Options Journey", () => {
  let journey: WorkflowJourney;

  beforeEach(() => {
    vi.clearAllMocks();
    journey = createJourney();

    (journey.mockAshby.getApplication as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockApplication()
    );
    (journey.mockAshby.getCandidateWithApplications as ReturnType<typeof vi.fn>).mockResolvedValue({
      candidate: mockCandidate(),
      applications: [],
    });
  });

  afterEach(() => {
    journey.manager.shutdown();
  });

  it("should complete rejection with standard email", async () => {
    const state = await journey.triggerService.createRejectionOptionsState({
      candidateId: "candidate-1",
      applicationId: "app-1",
      archiveReasonId: "not-qualified",
    });

    expect(state.type).toBe("rejection_options");

    const session = createSession(
      journey.manager,
      state,
      "C123456",
      "1234567890.123456",
      "recruiter-1"
    );

    const result = await journey.manager.handleReaction(
      session,
      "email",
      "recruiter-1"
    );

    expect(result.handled).toBe(true);
    expect(result.apiAction).toMatchObject({
      type: "archive_candidate",
    });
  });

  it("should handle reconsider action", async () => {
    const state = await journey.triggerService.createRejectionOptionsState({
      candidateId: "candidate-1",
      applicationId: "app-1",
      archiveReasonId: "not-qualified",
    });

    const session = createSession(
      journey.manager,
      state,
      "C123456",
      "1234567890.123456",
      "recruiter-1"
    );

    const result = await journey.manager.handleReaction(
      session,
      "double_vertical_bar",
      "recruiter-1"
    );

    expect(result.handled).toBe(true);
    expect(result.message?.toLowerCase()).toContain("cancelled");
    expect(result.completed).toBe(true);
    expect(result.apiAction).toBeUndefined(); // No API action on reconsider
  });
});

describe("Workflow E2E: Session Management", () => {
  let journey: WorkflowJourney;

  beforeEach(() => {
    vi.clearAllMocks();
    journey = createJourney();
  });

  afterEach(() => {
    journey.manager.shutdown();
  });

  it("should track active sessions", () => {
    const state = journey.triggerService.createSchedulingConfirmState({
      interviewScheduleId: "sched-1",
      interviewer: mockUser(),
      candidate: mockCandidate(),
      jobTitle: "Software Engineer",
      scheduledTime: "2024-01-20T14:00:00Z",
      duration: "60 minutes",
    });

    const session = createSession(
      journey.manager,
      state,
      "C123456",
      "1234567890.123456",
      "user-1"
    );

    expect(journey.manager.get(session.id)).not.toBeNull();
    expect(journey.manager.getActiveSessionCount()).toBe(1);
  });

  it("should handle unknown reactions gracefully", async () => {
    const state = journey.triggerService.createSchedulingConfirmState({
      interviewScheduleId: "sched-1",
      interviewer: mockUser(),
      candidate: mockCandidate(),
      jobTitle: "Software Engineer",
      scheduledTime: "2024-01-20T14:00:00Z",
      duration: "60 minutes",
    });

    const session = createSession(
      journey.manager,
      state,
      "C123456",
      "1234567890.123456",
      "user-1"
    );

    const result = await journey.manager.handleReaction(
      session,
      "random_unknown_emoji",
      "user-1"
    );

    expect(result.handled).toBe(false);
  });

  it("should find sessions by message timestamp", () => {
    const state = journey.triggerService.createSchedulingConfirmState({
      interviewScheduleId: "sched-1",
      interviewer: mockUser(),
      candidate: mockCandidate(),
      jobTitle: "Software Engineer",
      scheduledTime: "2024-01-20T14:00:00Z",
      duration: "60 minutes",
    });

    const session = createSession(
      journey.manager,
      state,
      "C123456",
      "unique-timestamp",
      "user-1"
    );

    const found = journey.manager.findByMessage("C123456", "unique-timestamp");

    expect(found).toBeDefined();
    expect(found?.id).toBe(session.id);
  });

  it("should return null for non-existent sessions", () => {
    const found = journey.manager.findByMessage("C123456", "nonexistent");
    expect(found).toBeNull();
  });
});

describe("Workflow E2E: Interview Prep Journey", () => {
  let journey: WorkflowJourney;

  beforeEach(() => {
    vi.clearAllMocks();
    journey = createJourney();

    (journey.mockAshby.getApplication as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockApplication()
    );
    (journey.mockAshby.getCandidateWithApplications as ReturnType<typeof vi.fn>).mockResolvedValue({
      candidate: mockCandidate(),
      applications: [],
    });
    (journey.mockAshby.getCandidateScorecard as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockScorecard()
    );
  });

  afterEach(() => {
    journey.manager.shutdown();
  });

  it("should complete interview prep journey", async () => {
    const futureInterview = mockInterview({
      scheduledStartTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    });

    const state = await journey.triggerService.createInterviewPrepState({
      interview: futureInterview,
      interviewer: mockUser(),
    });

    expect(state.type).toBe("interview_prep");
    expect(state.previousScores).toBe("Previous: 4.5");

    const session = createSession(
      journey.manager,
      state,
      "C123456",
      "1234567890.123456",
      "user-1"
    );

    // Interviewer confirms they've reviewed
    const result = await journey.manager.handleReaction(
      session,
      "eyes",
      "user-1"
    );

    expect(result.handled).toBe(true);
    expect(result.message?.toLowerCase()).toContain("good luck");
  });

  it("should handle request for more details", async () => {
    const state = await journey.triggerService.createInterviewPrepState({
      interview: mockInterview(),
      interviewer: mockUser(),
    });

    const session = createSession(
      journey.manager,
      state,
      "C123456",
      "1234567890.123456",
      "user-1"
    );

    const result = await journey.manager.handleReaction(
      session,
      "question",
      "user-1"
    );

    expect(result.handled).toBe(true);
    expect(result.message?.toLowerCase()).toContain("fetching");
  });
});

describe("Workflow E2E: Debrief Kickoff Journey", () => {
  let journey: WorkflowJourney;

  beforeEach(() => {
    vi.clearAllMocks();
    journey = createJourney();

    (journey.mockAshby.getApplication as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockApplication()
    );
    (journey.mockAshby.getCandidateWithApplications as ReturnType<typeof vi.fn>).mockResolvedValue({
      candidate: mockCandidate(),
      applications: [],
    });
    (journey.mockAshby.listFeedbackSubmissions as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: "fb-1",
        applicationId: "app-1",
        submittedByUser: { id: "user-1", firstName: "Jane", lastName: "Smith" },
      } as FeedbackSubmission,
    ]);
    (journey.mockAshby.listUsers as ReturnType<typeof vi.fn>).mockResolvedValue([
      mockUser(),
    ]);
    (journey.mockAshby.getCandidateScorecard as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockScorecard()
    );
  });

  afterEach(() => {
    journey.manager.shutdown();
  });

  it("should create debrief kickoff with interviewers", async () => {
    const state = await journey.triggerService.createDebriefKickoffState({
      candidateId: "candidate-1",
      applicationId: "app-1",
    });

    expect(state.type).toBe("debrief_kickoff");
    expect(state.interviewers).toHaveLength(1);
    expect(state.overallScores).toBe("4.5 (3 reviews)");

    const session = createSession(
      journey.manager,
      state,
      "C123456",
      "1234567890.123456",
      "user-1"
    );

    // Team member votes yes
    const result = await journey.manager.handleReaction(
      session,
      "thumbsup",
      "user-1"
    );

    expect(result.handled).toBe(true);
  });
});

describe("Workflow E2E: Weekly Pulse Journey", () => {
  let journey: WorkflowJourney;

  beforeEach(() => {
    vi.clearAllMocks();
    journey = createJourney();
  });

  afterEach(() => {
    journey.manager.shutdown();
  });

  it("should create weekly pulse for specific job", async () => {
    (journey.mockAshby.getJobWithCandidates as ReturnType<typeof vi.fn>).mockResolvedValue({
      job: mockJob("job-1", "Senior Engineer"),
      candidates: [
        {
          ...mockApplication(),
          candidate: mockCandidate("c1", "Active Candidate"),
          job: mockJob(),
          currentInterviewStage: { id: "stage-1", title: "Onsite" },
          daysInCurrentStage: 5,
          isStale: false,
        },
        {
          ...mockApplication({ id: "app-2", candidateId: "c2" }),
          candidate: mockCandidate("c2", "Stale Candidate"),
          job: mockJob(),
          currentInterviewStage: { id: "stage-2", title: "Waiting" },
          daysInCurrentStage: 20,
          isStale: true,
        },
      ],
    });

    const state = await journey.triggerService.createWeeklyPulseState("job-1");

    expect(state.type).toBe("weekly_pulse");
    expect(state.jobTitle).toBe("Senior Engineer");
    expect(state.activelyInterviewing).toHaveLength(1);
    expect(state.waitingOn).toHaveLength(1);

    const session = createSession(
      journey.manager,
      state,
      "C123456",
      "1234567890.123456",
      "manager-1"
    );

    // Manager clicks to see full breakdown
    const result = await journey.manager.handleReaction(
      session,
      "bar_chart",
      "manager-1"
    );

    expect(result.handled).toBe(true);
    expect(result.message?.toLowerCase()).toContain("breakdown");
  });
});

describe("Workflow E2E: Error Handling", () => {
  let journey: WorkflowJourney;

  beforeEach(() => {
    vi.clearAllMocks();
    journey = createJourney();
  });

  afterEach(() => {
    journey.manager.shutdown();
  });

  it("should handle API errors during workflow creation gracefully", async () => {
    (journey.mockAshby.getApplication as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("API unavailable")
    );

    await expect(
      journey.triggerService.createOfferApprovalState({
        offer: mockOffer(),
        approverUserId: "approver-1",
      })
    ).rejects.toThrow("API unavailable");
  });

  it("should return not handled for unknown workflow type in session", async () => {
    // Create a session with a valid state
    const state = journey.triggerService.createSchedulingConfirmState({
      interviewScheduleId: "sched-1",
      interviewer: mockUser(),
      candidate: mockCandidate(),
      jobTitle: "Software Engineer",
      scheduledTime: "2024-01-20T14:00:00Z",
      duration: "60 minutes",
    });

    const session = createSession(
      journey.manager,
      state,
      "C123456",
      "1234567890.123456",
      "user-1"
    );

    // Trying to react with an invalid emoji returns not handled
    const result = await journey.manager.handleReaction(
      session,
      "invalid_emoji",
      "user-1"
    );

    expect(result.handled).toBe(false);
  });

  it("should handle missing workflow data gracefully", async () => {
    (journey.mockAshby.getApplication as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...mockApplication(),
      job: undefined,
    });
    (journey.mockAshby.getCandidateWithApplications as ReturnType<typeof vi.fn>).mockResolvedValue({
      candidate: undefined, // Missing candidate
      applications: [],
    });
    (journey.mockAshby.getJob as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const state = await journey.triggerService.createOfferApprovalState({
      offer: mockOffer(),
      approverUserId: "approver-1",
    });

    // Should still create state with fallback values
    expect(state.candidateName).toBe("Unknown");
    expect(state.jobTitle).toBe("Unknown Role");
  });
});
