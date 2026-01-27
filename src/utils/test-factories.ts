/**
 * Shared Test Mock Factories
 *
 * Centralized mock factories for creating valid test data.
 * These factories create complete, type-safe mock objects that satisfy strict TypeScript.
 */

import type {
  Application,
  ApplicationWithContext,
  ArchiveReason,
  Candidate,
  CandidateSource,
  CandidateWithContext,
  Department,
  FeedbackSubmission,
  HiringTeamMember,
  Interview,
  InterviewEvent,
  InterviewPlan,
  InterviewSchedule,
  InterviewStage,
  Interviewer,
  Job,
  JobLocation,
  JobPosting,
  Note,
  Offer,
  PipelineSummary,
  Scorecard,
  Team,
  TriageSession,
  User,
} from "../types/index.js";

// =============================================================================
// Core Entity Factories
// =============================================================================

export const createMockUser = (overrides: Partial<User> = {}): User => ({
  id: "user-1",
  email: "user@example.com",
  firstName: "Test",
  lastName: "User",
  globalRole: "Interviewer",
  isEnabled: true,
  ...overrides,
});

export const createMockCandidate = (overrides: Partial<Candidate> = {}): Candidate => ({
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

export const createMockJob = (overrides: Partial<Job> = {}): Job => ({
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

export const createMockSource = (overrides: Partial<CandidateSource> = {}): CandidateSource => ({
  id: "source-1",
  title: "Referral",
  type: "referral",
  ...overrides,
});

export const createMockStage = (overrides: Partial<InterviewStage> = {}): InterviewStage => ({
  id: "stage-1",
  title: "Phone Screen",
  orderInInterviewPlan: 1,
  interviewStageType: "Interview",
  ...overrides,
});

export const createMockApplication = (overrides: Partial<Application> = {}): Application => ({
  id: "app-1",
  candidateId: "candidate-1",
  jobId: "job-1",
  status: "Active",
  currentInterviewStageId: "stage-1",
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
  ...overrides,
});

export const createMockApplicationWithContext = (
  overrides: Partial<ApplicationWithContext> = {}
): ApplicationWithContext => ({
  ...createMockApplication(),
  job: createMockJob(),
  candidate: createMockCandidate(),
  currentInterviewStage: createMockStage(),
  daysInCurrentStage: 5,
  isStale: false,
  ...overrides,
});

export const createMockInterview = (overrides: Partial<Interview> = {}): Interview => ({
  id: "interview-1",
  applicationId: "app-1",
  interviewStageId: "stage-1",
  status: "Scheduled",
  scheduledStartTime: "2024-01-15T10:00:00Z",
  scheduledEndTime: "2024-01-15T11:00:00Z",
  interviewStage: createMockStage({ title: "Technical Interview" }),
  interviewers: [{ userId: "user-1" }],
  feedbackSubmissions: [],
  ...overrides,
});

export const createMockInterviewSchedule = (overrides: Partial<InterviewSchedule> = {}): InterviewSchedule => ({
  id: "schedule-1",
  applicationId: "app-1",
  interviewEvents: [],
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
  ...overrides,
});

export const createMockNote = (overrides: Partial<Note> = {}): Note => ({
  id: "note-1",
  content: "Test note content",
  createdAt: "2024-01-01T00:00:00Z",
  authorId: "user-1",
  visibility: "Public",
  ...overrides,
});

export const createMockOffer = (overrides: Partial<Offer> = {}): Offer => ({
  id: "offer-1",
  applicationId: "app-1",
  status: "Draft",
  offerProcessId: "process-1",
  startDate: "2024-03-01",
  salary: 100000,
  salaryFrequency: "Annual",
  currency: "USD",
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
  ...overrides,
});

export const createMockFeedbackSubmission = (
  overrides: Partial<FeedbackSubmission> = {}
): FeedbackSubmission => ({
  id: "feedback-1",
  applicationId: "app-1",
  interviewId: "interview-1",
  submittedAt: "2024-01-15T12:00:00Z",
  submittedByUser: createMockUser(),
  ...overrides,
});

export const createMockScorecard = (overrides: Partial<Scorecard> = {}): Scorecard => ({
  candidate: createMockCandidate(),
  job: createMockJob(),
  overallRating: 4.5,
  feedbackCount: 3,
  pros: [],
  cons: [],
  recommendations: ["Strong hire"],
  submissions: [],
  attributeRatings: [],
  interviewerScorecards: [],
  ...overrides,
});

// =============================================================================
// Additional Entity Factories
// =============================================================================

export const createMockArchiveReason = (overrides: Partial<ArchiveReason> = {}): ArchiveReason => ({
  id: "reason-1",
  title: "Not a fit",
  reasonType: "Rejected",
  ...overrides,
});

export const createMockDepartment = (overrides: Partial<Department> = {}): Department => ({
  id: "dept-1",
  name: "Engineering",
  parentId: null,
  ...overrides,
});

export const createMockTeam = (overrides: Partial<Team> = {}): Team => ({
  id: "team-1",
  name: "Platform",
  parentId: null,
  ...overrides,
});

export const createMockJobLocation = (overrides: Partial<JobLocation> = {}): JobLocation => ({
  id: "location-1",
  name: "San Francisco",
  isRemote: false,
  city: "San Francisco",
  region: "California",
  country: "United States",
  ...overrides,
});

export const createMockJobPosting = (overrides: Partial<JobPosting> = {}): JobPosting => ({
  id: "posting-1",
  title: "Software Engineer",
  descriptionHtml: "<p>Job description</p>",
  descriptionPlain: "Job description",
  isLive: true,
  publishedDate: "2024-01-01T00:00:00Z",
  externalLink: "https://careers.example.com/job/1",
  ...overrides,
});

export const createMockHiringTeamMember = (overrides: Partial<HiringTeamMember> = {}): HiringTeamMember => ({
  userId: "user-1",
  role: "Hiring Manager",
  ...overrides,
});

export const createMockInterviewPlan = (overrides: Partial<InterviewPlan> = {}): InterviewPlan => ({
  id: "plan-1",
  interviewStages: [createMockStage()],
  ...overrides,
});

export const createMockInterviewEvent = (overrides: Partial<InterviewEvent> = {}): InterviewEvent => ({
  id: "event-1",
  startTime: "2024-01-15T10:00:00Z",
  endTime: "2024-01-15T11:00:00Z",
  interviewerIds: ["user-1"],
  ...overrides,
});

export const createMockInterviewer = (overrides: Partial<Interviewer> = {}): Interviewer => ({
  userId: "user-1",
  ...overrides,
});

export const createMockCandidateWithContext = (
  overrides: Partial<CandidateWithContext> = {}
): CandidateWithContext => ({
  ...createMockCandidate(),
  applications: [createMockApplicationWithContext()],
  notes: [createMockNote()],
  ...overrides,
});

export const createMockPipelineSummary = (overrides: Partial<PipelineSummary> = {}): PipelineSummary => ({
  totalCandidates: 10,
  byStage: [],
  byJob: [],
  staleCount: 2,
  needsDecisionCount: 3,
  ...overrides,
});

export const createMockTriageSession = (overrides: Partial<TriageSession> = {}): TriageSession => ({
  id: "session-1",
  userId: "user-1",
  channelId: "channel-1",
  messageTs: "1234567890.123456",
  candidates: [],
  currentIndex: 0,
  decisions: [],
  createdAt: new Date(),
  expiresAt: new Date(Date.now() + 30 * 60 * 1000),
  ...overrides,
});
