/**
 * WorkflowTriggerService Tests
 *
 * Unit tests for workflow state creation from Ashby API data.
 * Uses mocked AshbyService - no external dependencies.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { WorkflowTriggerService } from "./trigger-service.js";
import type { AshbyService } from "../ashby/service.js";
import type {
  Application,
  ApplicationWithContext,
  Candidate,
  Interview,
  Offer,
  User,
  Job,
  Scorecard,
  FeedbackSubmission,
  BatchBlockerAnalysis,
  InterviewStage,
} from "../types/index.js";
import { REACTION_SETS } from "./types.js";

// ============================================================================
// Mock Factories
// ============================================================================

const createMockCandidate = (overrides: Partial<Candidate> = {}): Candidate => ({
  id: "candidate-1",
  name: "John Doe",
  primaryEmailAddress: { value: "john@example.com", type: "work", isPrimary: true },
  phoneNumbers: [],
  socialLinks: [],
  tags: [],
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
  applicationIds: ["app-1"],
  profileUrl: "https://app.ashbyhq.com/candidate/candidate-1",
  ...overrides,
});

const createMockUser = (overrides: Partial<User> = {}): User => ({
  id: "user-1",
  email: "interviewer@example.com",
  firstName: "Jane",
  lastName: "Smith",
  globalRole: "Interviewer",
  isEnabled: true,
  ...overrides,
});

const createMockJob = (overrides: Partial<Job> = {}): Job => ({
  id: "job-1",
  title: "Software Engineer",
  status: "Open",
  employmentType: "FullTime",
  hiringTeam: [],
  jobPostings: [],
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
  ...overrides,
});

const createMockApplication = (overrides: Partial<Application> = {}): Application => ({
  id: "app-1",
  candidateId: "candidate-1",
  jobId: "job-1",
  status: "Active",
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
  currentInterviewStageId: "stage-1",
  ...overrides,
});

const createMockApplicationWithContext = (
  overrides: Partial<ApplicationWithContext> = {}
): ApplicationWithContext => ({
  ...createMockApplication(),
  candidate: createMockCandidate(),
  job: createMockJob(),
  currentInterviewStage: { id: "stage-1", title: "Phone Screen" } as InterviewStage,
  daysInCurrentStage: 5,
  isStale: false,
  ...overrides,
});

const createMockInterview = (overrides: Partial<Interview> = {}): Interview => ({
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

const createMockOffer = (overrides: Partial<Offer> = {}): Offer => ({
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

const createMockScorecard = (overrides: Partial<Scorecard> = {}): Scorecard => ({
  candidate: createMockCandidate(),
  job: createMockJob(),
  overallRating: 4.5,
  feedbackCount: 3,
  pros: [],
  cons: [],
  recommendations: ["Strong hire - excellent technical skills"],
  submissions: [],
  attributeRatings: [],
  interviewerScorecards: [],
  ...overrides,
});

const createMockFeedbackSubmission = (
  overrides: Partial<FeedbackSubmission> = {}
): FeedbackSubmission => ({
  id: "feedback-1",
  applicationId: "app-1",
  interviewId: "interview-1",
  submittedAt: "2024-01-15T12:00:00Z",
  submittedByUser: createMockUser(),
  ...overrides,
});

const createMockBlockerAnalysis = (
  overrides: Partial<BatchBlockerAnalysis> = {}
): BatchBlockerAnalysis => ({
  analyzed: 10,
  byBlockerType: {
    no_blocker: [],
    no_interview_scheduled: [],
    awaiting_feedback: [],
    ready_to_move: [
      {
        candidate: createMockCandidate({ id: "c2", name: "Bob" }),
        blocker: {
          type: "ready_to_move",
          message: "All interviews complete",
          severity: "info",
          suggestedAction: "Advance to next stage",
        },
        daysInStage: 5,
      },
    ],
    offer_pending: [],
    offer_not_sent: [],
    interview_completed_no_feedback: [
      {
        candidate: createMockCandidate({ id: "c1", name: "Alice" }),
        blocker: {
          type: "interview_completed_no_feedback",
          message: "Awaiting feedback from 2 interviewers",
          severity: "warning",
          suggestedAction: "Follow up on pending feedback",
        },
        daysInStage: 3,
      },
    ],
  },
  summary: {
    critical: 0,
    warning: 1,
    info: 1,
  },
  urgentCandidates: [],
  ...overrides,
});

// ============================================================================
// Mock AshbyService Factory
// ============================================================================

const createMockAshbyService = (): Partial<AshbyService> => ({
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
});

// ============================================================================
// Tests
// ============================================================================

describe("WorkflowTriggerService", () => {
  let service: WorkflowTriggerService;
  let mockAshby: ReturnType<typeof createMockAshbyService>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAshby = createMockAshbyService();
    service = new WorkflowTriggerService(mockAshby as AshbyService);
  });

  // ==========================================================================
  // Quick Feedback Workflow
  // ==========================================================================

  describe("createQuickFeedbackState", () => {
    it("should create quick feedback state with all required fields", async () => {
      const interview = createMockInterview();
      const interviewer = createMockUser();
      const candidate = createMockCandidate();
      const application = createMockApplication({ job: createMockJob() });

      const state = await service.createQuickFeedbackState({
        interview,
        interviewer,
        candidate,
        application,
      });

      expect(state).toMatchObject({
        type: "quick_feedback",
        candidateId: "candidate-1",
        candidateName: "John Doe",
        applicationId: "app-1",
        jobTitle: "Software Engineer",
        interviewerId: "user-1",
        interviewType: "Technical Interview",
        interviewDate: "2024-01-15T10:00:00Z",
      });
      expect(state.reactions).toEqual(REACTION_SETS.FEEDBACK_QUICK);
    });

    it("should fetch job if not included in application", async () => {
      const interview = createMockInterview();
      const interviewer = createMockUser();
      const candidate = createMockCandidate();
      // Create application without job property
      const { job: _job, ...applicationWithoutJob } = { ...createMockApplication(), job: createMockJob() };
      const application = applicationWithoutJob as Application;

      (mockAshby.getJob as ReturnType<typeof vi.fn>).mockResolvedValue(
        createMockJob({ title: "Backend Developer" })
      );

      const state = await service.createQuickFeedbackState({
        interview,
        interviewer,
        candidate,
        application,
      });

      expect(mockAshby.getJob).toHaveBeenCalledWith("job-1");
      expect(state.jobTitle).toBe("Backend Developer");
    });

    it("should handle missing interview stage title", async () => {
      // Create interview without interviewStage property
      const { interviewStage: _stage, ...interviewWithoutStage } = createMockInterview();
      const interview = interviewWithoutStage as Interview;
      const interviewer = createMockUser();
      const candidate = createMockCandidate();
      const application = createMockApplication({ job: createMockJob() });

      const state = await service.createQuickFeedbackState({
        interview,
        interviewer,
        candidate,
        application,
      });

      expect(state.interviewType).toBe("Interview");
    });

    it("should use current date if scheduledStartTime is missing", async () => {
      // Create interview without scheduledStartTime property
      const { scheduledStartTime: _time, ...interviewWithoutTime } = createMockInterview();
      const interview = interviewWithoutTime as Interview;
      const interviewer = createMockUser();
      const candidate = createMockCandidate();
      const application = createMockApplication({ job: createMockJob() });

      const state = await service.createQuickFeedbackState({
        interview,
        interviewer,
        candidate,
        application,
      });

      // Should be an ISO date string
      expect(state.interviewDate).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  // ==========================================================================
  // Daily Digest Workflow
  // ==========================================================================

  describe("createDailyDigestState", () => {
    it("should create daily digest from blocker analysis", async () => {
      (mockAshby.analyzeCandidateBlockers as ReturnType<typeof vi.fn>).mockResolvedValue(
        createMockBlockerAnalysis()
      );

      const state = await service.createDailyDigestState();

      expect(state.type).toBe("daily_digest");
      // needsAttention includes both missing_feedback and ready_to_move entries (excluding no_blocker)
      expect(state.needsAttention.length).toBeGreaterThanOrEqual(1);
      expect(state.needsAttention.some((a) => a.candidateId === "c1")).toBe(true);
      expect(state.readyToMove).toHaveLength(1);
      expect(state.readyToMove[0]).toMatchObject({
        candidateId: "c2",
        candidateName: "Bob",
        reason: "Advance to next stage",
      });
      expect(state.onTrack).toBe(0);
      expect(state.reactions).toEqual(REACTION_SETS.DIGEST_ACTIONS);
    });

    it("should skip no_blocker entries in needs attention", async () => {
      (mockAshby.analyzeCandidateBlockers as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...createMockBlockerAnalysis(),
        byBlockerType: {
          no_blocker: [
            {
              candidate: createMockCandidate({ id: "c3", name: "Charlie" }),
              applicationId: "app-3",
              blocker: {
                type: "no_blocker",
                message: "On track",
                severity: "info",
                suggestedAction: "Continue",
              },
            },
          ],
        },
      });

      const state = await service.createDailyDigestState();

      expect(state.needsAttention).toHaveLength(0);
      expect(state.onTrack).toBe(1);
    });

    it("should limit candidates to 3 per blocker type", async () => {
      const manyCandidates = Array.from({ length: 5 }, (_, i) => ({
        candidate: createMockCandidate({ id: `c${i}`, name: `Candidate ${i}` }),
        applicationId: `app-${i}`,
        blocker: {
          type: "stale",
          message: "Stale candidate",
          severity: "warning" as const,
          suggestedAction: "Take action",
        },
      }));

      (mockAshby.analyzeCandidateBlockers as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...createMockBlockerAnalysis(),
        byBlockerType: {
          stale: manyCandidates,
        },
      });

      const state = await service.createDailyDigestState();

      expect(state.needsAttention).toHaveLength(3);
    });
  });

  // ==========================================================================
  // Batch Decision Workflow
  // ==========================================================================

  describe("createBatchDecisionState", () => {
    it("should create batch decision state for candidates in a stage", async () => {
      const candidates = [
        createMockApplicationWithContext({
          id: "app-1",
          currentInterviewStage: { id: "stage-1", title: "Final Round" } as InterviewStage,
          candidate: createMockCandidate({ id: "c1", name: "Alice" }),
        }),
        createMockApplicationWithContext({
          id: "app-2",
          currentInterviewStage: { id: "stage-1", title: "Final Round" } as InterviewStage,
          candidate: createMockCandidate({ id: "c2", name: "Bob" }),
        }),
      ];

      (mockAshby.getJobWithCandidates as ReturnType<typeof vi.fn>).mockResolvedValue({
        job: createMockJob(),
        candidates,
      });
      (mockAshby.getInterviewStageDetails as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: "stage-1",
        title: "Final Round",
      });
      (mockAshby.getCandidateScorecard as ReturnType<typeof vi.fn>).mockResolvedValue(
        createMockScorecard()
      );

      const state = await service.createBatchDecisionState({
        jobId: "job-1",
        stageId: "stage-1",
        action: "advance",
      });

      expect(state.type).toBe("batch_decision");
      expect(state.jobId).toBe("job-1");
      expect(state.jobTitle).toBe("Software Engineer");
      expect(state.stage).toBe("Final Round");
      expect(state.candidates).toHaveLength(2);
      expect(state.candidates[0]).toMatchObject({
        index: 1,
        candidateId: "c1",
        applicationId: "app-1",
        candidateName: "Alice",
        scores: "4.5",
        summary: "Strong hire - excellent technical skills",
      });
      expect(state.selectedIndices).toEqual([]);
      expect(state.targetAction).toBe("advance");
    });

    it("should filter candidates to only those in the target stage", async () => {
      const candidates = [
        createMockApplicationWithContext({
          id: "app-1",
          currentInterviewStage: { id: "stage-1", title: "Final Round" } as InterviewStage,
        }),
        createMockApplicationWithContext({
          id: "app-2",
          currentInterviewStage: { id: "stage-2", title: "Other Stage" } as InterviewStage,
        }),
      ];

      (mockAshby.getJobWithCandidates as ReturnType<typeof vi.fn>).mockResolvedValue({
        job: createMockJob(),
        candidates,
      });
      (mockAshby.getInterviewStageDetails as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: "stage-1",
        title: "Final Round",
      });
      (mockAshby.getCandidateScorecard as ReturnType<typeof vi.fn>).mockResolvedValue(
        createMockScorecard()
      );

      const state = await service.createBatchDecisionState({
        jobId: "job-1",
        stageId: "stage-1",
        action: "reject",
      });

      expect(state.candidates).toHaveLength(1);
      expect(state.candidates[0]!.applicationId).toBe("app-1");
    });

    it("should handle scorecard fetch failures gracefully", async () => {
      const candidates = [
        createMockApplicationWithContext({
          currentInterviewStage: { id: "stage-1", title: "Final Round" } as InterviewStage,
        }),
      ];

      (mockAshby.getJobWithCandidates as ReturnType<typeof vi.fn>).mockResolvedValue({
        job: createMockJob(),
        candidates,
      });
      (mockAshby.getInterviewStageDetails as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: "stage-1",
        title: "Final Round",
      });
      (mockAshby.getCandidateScorecard as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("Scorecard not found")
      );

      const state = await service.createBatchDecisionState({
        jobId: "job-1",
        stageId: "stage-1",
        action: "advance",
      });

      expect(state.candidates[0]!.scores).toBe("No scores yet");
      expect(state.candidates[0]!.summary).toBe("");
    });

    it("should respect limit parameter", async () => {
      const candidates = Array.from({ length: 10 }, (_, i) =>
        createMockApplicationWithContext({
          id: `app-${i}`,
          currentInterviewStage: { id: "stage-1", title: "Final Round" } as InterviewStage,
          candidate: createMockCandidate({ id: `c${i}`, name: `Candidate ${i}` }),
        })
      );

      (mockAshby.getJobWithCandidates as ReturnType<typeof vi.fn>).mockResolvedValue({
        job: createMockJob(),
        candidates,
      });
      (mockAshby.getInterviewStageDetails as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: "stage-1",
        title: "Final Round",
      });
      (mockAshby.getCandidateScorecard as ReturnType<typeof vi.fn>).mockResolvedValue(
        createMockScorecard()
      );

      const state = await service.createBatchDecisionState({
        jobId: "job-1",
        stageId: "stage-1",
        action: "advance",
        limit: 3,
      });

      expect(state.candidates).toHaveLength(3);
    });
  });

  // ==========================================================================
  // Offer Approval Workflow
  // ==========================================================================

  describe("createOfferApprovalState", () => {
    it("should create offer approval state with all offer details", async () => {
      const offer = createMockOffer({
        equity: 10000,
        signingBonus: 25000,
      });

      (mockAshby.getApplication as ReturnType<typeof vi.fn>).mockResolvedValue(
        createMockApplication({ job: createMockJob() })
      );
      (mockAshby.getCandidateWithApplications as ReturnType<typeof vi.fn>).mockResolvedValue({
        candidate: createMockCandidate(),
        applications: [],
      });

      const state = await service.createOfferApprovalState({
        offer,
        approverUserId: "approver-1",
      });

      expect(state).toMatchObject({
        type: "offer_approval",
        offerId: "offer-1",
        applicationId: "app-1",
        candidateId: "candidate-1",
        candidateName: "John Doe",
        jobTitle: "Software Engineer",
        salary: 150000,
        salaryFrequency: "Annual",
        currency: "USD",
        equity: 10000,
        signingBonus: 25000,
        startDate: "2024-03-01",
        phase: "approval",
        currentApproverId: "approver-1",
      });
      expect(state.approvers).toHaveLength(1);
      expect(state.approvers[0]!.userId).toBe("approver-1");
      expect(state.reactions).toEqual(REACTION_SETS.OFFER_APPROVAL);
    });

    it("should handle missing offer fields with defaults", async () => {
      // Create offer without optional fields
      const { salary: _s, equity: _e, signingBonus: _b, startDate: _d, ...offerWithoutOptionals } = createMockOffer();
      const offer = { ...offerWithoutOptionals, salary: 0, startDate: "" } as Offer;

      (mockAshby.getApplication as ReturnType<typeof vi.fn>).mockResolvedValue(
        createMockApplication({ job: createMockJob() })
      );
      (mockAshby.getCandidateWithApplications as ReturnType<typeof vi.fn>).mockResolvedValue({
        candidate: createMockCandidate(),
        applications: [],
      });

      const state = await service.createOfferApprovalState({
        offer,
        approverUserId: "approver-1",
      });

      expect(state.salary).toBe(0);
      expect(state.equity).toBe(0);
      expect(state.signingBonus).toBe(0);
      expect(state.startDate).toBe("");
    });

    it("should fetch job if not included in application", async () => {
      const offer = createMockOffer();

      // Create application without job property
      const { job: _job, ...applicationWithoutJob } = { ...createMockApplication(), job: createMockJob() };
      (mockAshby.getApplication as ReturnType<typeof vi.fn>).mockResolvedValue(
        applicationWithoutJob as Application
      );
      (mockAshby.getCandidateWithApplications as ReturnType<typeof vi.fn>).mockResolvedValue({
        candidate: createMockCandidate(),
        applications: [],
      });
      (mockAshby.getJob as ReturnType<typeof vi.fn>).mockResolvedValue(
        createMockJob({ title: "Senior Engineer" })
      );

      const state = await service.createOfferApprovalState({
        offer,
        approverUserId: "approver-1",
      });

      expect(mockAshby.getJob).toHaveBeenCalledWith("job-1");
      expect(state.jobTitle).toBe("Senior Engineer");
    });
  });

  // ==========================================================================
  // Interview Prep Workflow
  // ==========================================================================

  describe("createInterviewPrepState", () => {
    it("should create interview prep state with candidate context", async () => {
      const interview = createMockInterview({
        scheduledStartTime: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(), // 2 hours from now
      });
      const interviewer = createMockUser();

      (mockAshby.getApplication as ReturnType<typeof vi.fn>).mockResolvedValue(
        createMockApplication({ job: createMockJob() })
      );
      (mockAshby.getCandidateWithApplications as ReturnType<typeof vi.fn>).mockResolvedValue({
        candidate: createMockCandidate({
          source: { id: "src-1", title: "LinkedIn", type: "sourcing" },
        }),
        applications: [],
      });
      (mockAshby.getCandidateScorecard as ReturnType<typeof vi.fn>).mockResolvedValue(
        createMockScorecard({ overallRating: 4.2 })
      );

      const state = await service.createInterviewPrepState({
        interview,
        interviewer,
      });

      expect(state).toMatchObject({
        type: "interview_prep",
        interviewerId: "user-1",
        candidateId: "candidate-1",
        candidateName: "John Doe",
        applicationId: "app-1",
        jobTitle: "Software Engineer",
        prepSummary: "Source: LinkedIn",
        previousScores: "Previous: 4.2",
      });
      expect(state.interviewTime).toMatch(/in \d+h/);
      expect(state.reactions).toEqual(REACTION_SETS.PREP_ACTIONS);
    });

    it("should handle missing source information", async () => {
      const interview = createMockInterview({
        scheduledStartTime: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30 mins
      });
      const interviewer = createMockUser();

      (mockAshby.getApplication as ReturnType<typeof vi.fn>).mockResolvedValue(
        createMockApplication({ job: createMockJob() })
      );
      // Create candidate without source property
      const { source: _source, ...candidateWithoutSource } = createMockCandidate();
      (mockAshby.getCandidateWithApplications as ReturnType<typeof vi.fn>).mockResolvedValue({
        candidate: candidateWithoutSource as Candidate,
        applications: [],
      });
      (mockAshby.getCandidateScorecard as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("No scorecard")
      );

      const state = await service.createInterviewPrepState({
        interview,
        interviewer,
      });

      expect(state.prepSummary).toBe("No additional context available");
      expect(state.previousScores).toBe("");
      // 30 minutes rounds to 1 hour
      expect(state.interviewTime).toMatch(/in (soon|1h)/);
    });
  });

  // ==========================================================================
  // Feedback Nudge Workflow
  // ==========================================================================

  describe("createFeedbackNudgeState", () => {
    it("should create feedback nudge state with days since interview", async () => {
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
      const interview = createMockInterview({
        scheduledStartTime: threeDaysAgo,
        interviewStage: { id: "stage-1", title: "Onsite" } as InterviewStage,
      });
      const interviewer = createMockUser();

      (mockAshby.getApplication as ReturnType<typeof vi.fn>).mockResolvedValue(
        createMockApplication()
      );
      (mockAshby.getCandidateWithApplications as ReturnType<typeof vi.fn>).mockResolvedValue({
        candidate: createMockCandidate(),
        applications: [],
      });

      const state = await service.createFeedbackNudgeState({
        interview,
        interviewer,
      });

      expect(state).toMatchObject({
        type: "feedback_nudge",
        interviewerId: "user-1",
        candidateId: "candidate-1",
        candidateName: "John Doe",
        applicationId: "app-1",
        interviewType: "Onsite",
        daysSinceInterview: 3,
      });
      expect(state.reactions).toHaveLength(3);
    });
  });

  // ==========================================================================
  // Scheduling Confirm Workflow
  // ==========================================================================

  describe("createSchedulingConfirmState", () => {
    it("should create scheduling confirm state with all details", () => {
      const state = service.createSchedulingConfirmState({
        interviewScheduleId: "sched-1",
        interviewer: createMockUser(),
        candidate: createMockCandidate(),
        jobTitle: "Software Engineer",
        scheduledTime: "2024-01-20T14:00:00Z",
        duration: "60 minutes",
        meetingLink: "https://zoom.us/j/123",
      });

      expect(state).toMatchObject({
        type: "scheduling_confirm",
        interviewScheduleId: "sched-1",
        interviewerId: "user-1",
        candidateId: "candidate-1",
        candidateName: "John Doe",
        jobTitle: "Software Engineer",
        scheduledTime: "2024-01-20T14:00:00Z",
        duration: "60 minutes",
        meetingLink: "https://zoom.us/j/123",
      });
      expect(state.reactions).toEqual(REACTION_SETS.SCHEDULING);
    });

    it("should handle missing meeting link", () => {
      const state = service.createSchedulingConfirmState({
        interviewScheduleId: "sched-1",
        interviewer: createMockUser(),
        candidate: createMockCandidate(),
        jobTitle: "Software Engineer",
        scheduledTime: "2024-01-20T14:00:00Z",
        duration: "60 minutes",
      });

      expect(state.meetingLink).toBe("");
    });
  });

  // ==========================================================================
  // Debrief Kickoff Workflow
  // ==========================================================================

  describe("createDebriefKickoffState", () => {
    it("should create debrief kickoff state with interviewers from feedback", async () => {
      (mockAshby.getApplication as ReturnType<typeof vi.fn>).mockResolvedValue(
        createMockApplication({ job: createMockJob() })
      );
      (mockAshby.getCandidateWithApplications as ReturnType<typeof vi.fn>).mockResolvedValue({
        candidate: createMockCandidate(),
        applications: [],
      });
      (mockAshby.listFeedbackSubmissions as ReturnType<typeof vi.fn>).mockResolvedValue([
        createMockFeedbackSubmission({
          submittedByUser: createMockUser({ id: "user-1", firstName: "Jane", lastName: "Smith" }),
        }),
        createMockFeedbackSubmission({
          submittedByUser: createMockUser({ id: "user-2", firstName: "Bob", lastName: "Johnson" }),
        }),
      ]);
      (mockAshby.listUsers as ReturnType<typeof vi.fn>).mockResolvedValue([
        createMockUser({ id: "user-1", firstName: "Jane" }),
        createMockUser({ id: "user-2", firstName: "Bob" }),
      ]);
      (mockAshby.getCandidateScorecard as ReturnType<typeof vi.fn>).mockResolvedValue(
        createMockScorecard({ overallRating: 4.0, feedbackCount: 2 })
      );

      const state = await service.createDebriefKickoffState({
        candidateId: "candidate-1",
        applicationId: "app-1",
      });

      expect(state).toMatchObject({
        type: "debrief_kickoff",
        candidateId: "candidate-1",
        candidateName: "John Doe",
        applicationId: "app-1",
        jobTitle: "Software Engineer",
        overallScores: "4 (2 reviews)",
      });
      expect(state.interviewers).toHaveLength(2);
      expect(state.interviewers[0]).toMatchObject({
        userId: "user-1",
        name: "Jane Smith",
      });
    });

    it("should handle no scorecard gracefully", async () => {
      (mockAshby.getApplication as ReturnType<typeof vi.fn>).mockResolvedValue(
        createMockApplication({ job: createMockJob() })
      );
      (mockAshby.getCandidateWithApplications as ReturnType<typeof vi.fn>).mockResolvedValue({
        candidate: createMockCandidate(),
        applications: [],
      });
      (mockAshby.listFeedbackSubmissions as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      (mockAshby.listUsers as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      (mockAshby.getCandidateScorecard as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("No scorecard")
      );

      const state = await service.createDebriefKickoffState({
        candidateId: "candidate-1",
        applicationId: "app-1",
      });

      expect(state.overallScores).toBe("No scores yet");
      expect(state.interviewers).toHaveLength(0);
    });
  });

  // ==========================================================================
  // Weekly Pulse Workflow
  // ==========================================================================

  describe("createWeeklyPulseState", () => {
    it("should create weekly pulse state for a specific job", async () => {
      const candidates = [
        createMockApplicationWithContext({
          id: "app-1",
          candidateId: "c1",
          candidate: createMockCandidate({ id: "c1", name: "Alice" }),
          currentInterviewStage: { id: "stage-1", title: "Phone Screen" } as InterviewStage,
          daysInCurrentStage: 3,
          isStale: false,
        }),
        createMockApplicationWithContext({
          id: "app-2",
          candidateId: "c2",
          candidate: createMockCandidate({ id: "c2", name: "Bob" }),
          currentInterviewStage: { id: "stage-2", title: "Onsite" } as InterviewStage,
          daysInCurrentStage: 20,
          isStale: true,
        }),
      ];

      (mockAshby.getJobWithCandidates as ReturnType<typeof vi.fn>).mockResolvedValue({
        job: createMockJob({ title: "Senior Engineer" }),
        candidates,
      });

      const state = await service.createWeeklyPulseState("job-1");

      expect(state).toMatchObject({
        type: "weekly_pulse",
        jobId: "job-1",
        jobTitle: "Senior Engineer",
      });
      expect(state.activelyInterviewing).toHaveLength(1);
      expect(state.activelyInterviewing[0]).toMatchObject({
        candidateId: "c1",
        candidateName: "Alice",
        status: "Phone Screen",
      });
      expect(state.waitingOn).toHaveLength(1);
      expect(state.waitingOn[0]).toMatchObject({
        candidateId: "c2",
        candidateName: "Bob",
        waitingFor: "20 days in Onsite",
      });
      expect(state.reactions).toEqual(REACTION_SETS.PULSE_ACTIONS);
    });

    it("should create weekly pulse state without job filter", async () => {
      const staleCandidates = [
        createMockApplicationWithContext({
          candidateId: "c1",
          candidate: createMockCandidate({ id: "c1", name: "Stale Candidate" }),
          daysInCurrentStage: 30,
          isStale: true,
        }),
      ];

      (mockAshby.getStaleCandidates as ReturnType<typeof vi.fn>).mockResolvedValue(staleCandidates);

      const state = await service.createWeeklyPulseState();

      expect(mockAshby.getStaleCandidates).toHaveBeenCalledWith(10);
      expect(state.jobId).toBe("");
      expect(state.jobTitle).toBe("");
      expect(state.waitingOn).toHaveLength(1);
    });

    it("should limit results to 5 per category", async () => {
      const candidates = Array.from({ length: 10 }, (_, i) =>
        createMockApplicationWithContext({
          id: `app-${i}`,
          candidateId: `c${i}`,
          candidate: createMockCandidate({ id: `c${i}`, name: `Candidate ${i}` }),
          daysInCurrentStage: 3,
          isStale: false,
        })
      );

      (mockAshby.getJobWithCandidates as ReturnType<typeof vi.fn>).mockResolvedValue({
        job: createMockJob(),
        candidates,
      });

      const state = await service.createWeeklyPulseState("job-1");

      expect(state.activelyInterviewing).toHaveLength(5);
    });
  });

  // ==========================================================================
  // Rejection Options Workflow
  // ==========================================================================

  describe("createRejectionOptionsState", () => {
    it("should create rejection options state", async () => {
      (mockAshby.getApplication as ReturnType<typeof vi.fn>).mockResolvedValue(
        createMockApplication({ job: createMockJob() })
      );
      (mockAshby.getCandidateWithApplications as ReturnType<typeof vi.fn>).mockResolvedValue({
        candidate: createMockCandidate(),
        applications: [],
      });

      const state = await service.createRejectionOptionsState({
        candidateId: "candidate-1",
        applicationId: "app-1",
        archiveReasonId: "reason-1",
      });

      expect(state).toMatchObject({
        type: "rejection_options",
        candidateId: "candidate-1",
        candidateName: "John Doe",
        applicationId: "app-1",
        jobTitle: "Software Engineer",
        archiveReasonId: "reason-1",
      });
      expect(state.reactions).toEqual(REACTION_SETS.REJECTION);
    });
  });

  // ==========================================================================
  // Find Interviews Needing Feedback
  // ==========================================================================

  describe("findInterviewsNeedingFeedback", () => {
    it("should find completed interviews without feedback", async () => {
      const pastInterview = createMockInterview({
        scheduledStartTime: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
        interviewers: [{ userId: "user-1" }],
      });

      (mockAshby.listAllInterviews as ReturnType<typeof vi.fn>).mockResolvedValue([pastInterview]);
      (mockAshby.listUsers as ReturnType<typeof vi.fn>).mockResolvedValue([createMockUser()]);
      (mockAshby.listFeedbackSubmissions as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const results = await service.findInterviewsNeedingFeedback(24);

      expect(results).toHaveLength(1);
      expect(results[0]!.interview.id).toBe("interview-1");
      expect(results[0]!.interviewer.id).toBe("user-1");
    });

    it("should exclude interviews with existing feedback", async () => {
      const pastInterview = createMockInterview({
        scheduledStartTime: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        interviewers: [{ userId: "user-1" }],
      });

      (mockAshby.listAllInterviews as ReturnType<typeof vi.fn>).mockResolvedValue([pastInterview]);
      (mockAshby.listUsers as ReturnType<typeof vi.fn>).mockResolvedValue([createMockUser()]);
      (mockAshby.listFeedbackSubmissions as ReturnType<typeof vi.fn>).mockResolvedValue([
        createMockFeedbackSubmission(),
      ]);

      const results = await service.findInterviewsNeedingFeedback(24);

      expect(results).toHaveLength(0);
    });

    it("should exclude future interviews", async () => {
      const futureInterview = createMockInterview({
        scheduledStartTime: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(), // 2 hours from now
        interviewers: [{ userId: "user-1" }],
      });

      (mockAshby.listAllInterviews as ReturnType<typeof vi.fn>).mockResolvedValue([futureInterview]);
      (mockAshby.listUsers as ReturnType<typeof vi.fn>).mockResolvedValue([createMockUser()]);

      const results = await service.findInterviewsNeedingFeedback(24);

      expect(results).toHaveLength(0);
    });
  });

  // ==========================================================================
  // Find Upcoming Interviews for Prep
  // ==========================================================================

  describe("findUpcomingInterviewsForPrep", () => {
    it("should find interviews within the prep window", async () => {
      const upcomingInterview = createMockInterview({
        scheduledStartTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1 hour from now
        interviewers: [{ userId: "user-1" }],
      });

      (mockAshby.getUpcomingInterviews as ReturnType<typeof vi.fn>).mockResolvedValue([
        upcomingInterview,
      ]);
      (mockAshby.listUsers as ReturnType<typeof vi.fn>).mockResolvedValue([createMockUser()]);

      const results = await service.findUpcomingInterviewsForPrep(2);

      expect(results).toHaveLength(1);
      expect(results[0]!.interview.id).toBe("interview-1");
    });

    it("should exclude interviews beyond the prep window", async () => {
      const farInterview = createMockInterview({
        scheduledStartTime: new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString(), // 5 hours from now
        interviewers: [{ userId: "user-1" }],
      });

      (mockAshby.getUpcomingInterviews as ReturnType<typeof vi.fn>).mockResolvedValue([farInterview]);
      (mockAshby.listUsers as ReturnType<typeof vi.fn>).mockResolvedValue([createMockUser()]);

      const results = await service.findUpcomingInterviewsForPrep(2);

      expect(results).toHaveLength(0);
    });

    it("should exclude past interviews", async () => {
      const pastInterview = createMockInterview({
        scheduledStartTime: new Date(Date.now() - 60 * 60 * 1000).toISOString(), // 1 hour ago
        interviewers: [{ userId: "user-1" }],
      });

      (mockAshby.getUpcomingInterviews as ReturnType<typeof vi.fn>).mockResolvedValue([pastInterview]);
      (mockAshby.listUsers as ReturnType<typeof vi.fn>).mockResolvedValue([createMockUser()]);

      const results = await service.findUpcomingInterviewsForPrep(2);

      expect(results).toHaveLength(0);
    });
  });
});
