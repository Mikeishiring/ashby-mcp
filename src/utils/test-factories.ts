/**
 * Shared Test Mock Factories
 *
 * Centralized mock factories for creating valid test data.
 * These factories create complete, type-safe mock objects that satisfy strict TypeScript.
 */

import type {
  Application,
  ApplicationWithContext,
  Candidate,
  CandidateSource,
  FeedbackSubmission,
  Interview,
  InterviewSchedule,
  InterviewStage,
  Job,
  Note,
  Offer,
  Scorecard,
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
