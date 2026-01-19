/**
 * Ashby API domain types
 * Based on Ashby REST API documentation
 */

// =============================================================================
// Core Entities
// =============================================================================

export interface Candidate {
  id: string;
  name: string;
  primaryEmailAddress: {
    value: string;
    type: string;
    isPrimary: boolean;
  } | null;
  phoneNumbers: Array<{
    value: string;
    type: string;
    isPrimary: boolean;
  }>;
  socialLinks: Array<{
    url: string;
    type: string;
  }>;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  resumeFileHandle?: string;
  source?: CandidateSource;
  creditedToUser?: User;
  applicationIds: string[];
  profileUrl: string;
}

export interface CandidateSource {
  id: string;
  title: string;
  type: string;
}

export interface Application {
  id: string;
  candidateId: string;
  jobId: string;
  status: ApplicationStatus;
  currentInterviewStageId: string | null;
  currentInterviewStage?: InterviewStage;
  source?: CandidateSource;
  creditedToUser?: User;
  createdAt: string;
  updatedAt: string;
  archiveReason?: ArchiveReason;
  customFields?: CustomField[];
  job?: Job;
  candidate?: Candidate;
}

export type ApplicationStatus =
  | "Active"
  | "Hired"
  | "Archived"
  | "Lead"
  | "Converted";

export interface ArchiveReason {
  id: string;
  title: string;
  reasonType: string;
}

export interface Job {
  id: string;
  title: string;
  status: JobStatus;
  employmentType: string;
  location?: JobLocation;
  department?: Department;
  team?: Team;
  hiringTeam: HiringTeamMember[];
  customFields?: CustomField[];
  jobPostings: JobPosting[];
  openings?: JobOpening[];
  interviewPlan?: InterviewPlan;
  createdAt: string;
  updatedAt: string;
}

export type JobStatus = "Open" | "Closed" | "Draft" | "Archived";

export interface JobLocation {
  id: string;
  name: string;
  isRemote: boolean;
  city?: string;
  region?: string;
  country?: string;
}

export interface Department {
  id: string;
  name: string;
  parentId: string | null;
}

export interface Team {
  id: string;
  name: string;
  parentId: string | null;
}

export interface HiringTeamMember {
  userId: string;
  role: string;
  user?: User;
}

export interface JobPosting {
  id: string;
  title: string;
  descriptionHtml: string;
  descriptionPlain: string;
  isLive: boolean;
  publishedDate: string | null;
  externalLink: string | null;
  applicationFormDefinition?: ApplicationFormDefinition;
}

export interface JobOpening {
  id: string;
  identifier: string;
  openDate: string;
  closeDate: string | null;
  targetHireDate: string | null;
}

export interface ApplicationFormDefinition {
  id: string;
  sections: FormSection[];
}

export interface FormSection {
  id: string;
  title: string;
  fields: FormField[];
}

export interface FormField {
  id: string;
  fieldType: string;
  isRequired: boolean;
  title: string;
  description?: string;
}

// =============================================================================
// Interview & Stages
// =============================================================================

export interface InterviewPlan {
  id: string;
  interviewStages: InterviewStage[];
}

export interface InterviewStage {
  id: string;
  title: string;
  orderInInterviewPlan: number;
  interviewStageType: InterviewStageType;
}

export type InterviewStageType =
  | "Application"
  | "Screen"
  | "Interview"
  | "Offer"
  | "PreOffer"
  | "PostOffer";

export interface Interview {
  id: string;
  applicationId: string;
  interviewStageId: string;
  interviewStage?: InterviewStage;
  status: InterviewStatus;
  scheduledStartTime?: string;
  scheduledEndTime?: string;
  feedbackDueDate?: string;
  feedbackSubmissions: FeedbackSubmission[];
  interviewers: Interviewer[];
}

export interface InterviewSchedule {
  id: string;
  applicationId: string;
  interviewEvents: InterviewEvent[];
  createdAt: string;
  updatedAt: string;
}

export interface InterviewEvent {
  id: string;
  startTime: string;
  endTime: string;
  interviewerIds: string[];
  interviewers?: User[];
  location?: string;
  meetingLink?: string;
  title?: string;
}

export type InterviewStatus =
  | "NotScheduled"
  | "Scheduled"
  | "Completed"
  | "Cancelled";

export interface Interviewer {
  userId: string;
  user?: User;
}

export interface FeedbackSubmission {
  id: string;
  submittedAt: string;
  submittedByUserId: string;
  submittedByUser?: User;
  overallRating?: number;
  overallRecommendation?: string;
  fieldSubmissions: FieldSubmission[];
}

export interface FieldSubmission {
  fieldId: string;
  fieldTitle: string;
  fieldType: string;
  value: unknown;
}

// =============================================================================
// Notes & Activity
// =============================================================================

export interface Note {
  id: string;
  content: string;
  contentHtml?: string;
  createdAt: string;
  authorId: string;
  author?: User;
  visibility: NoteVisibility;
}

export type NoteVisibility = "Private" | "Public";

export interface Activity {
  id: string;
  type: string;
  createdAt: string;
  actorId: string;
  actor?: User;
  metadata?: Record<string, unknown>;
}

// =============================================================================
// Users & Permissions
// =============================================================================

export interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  globalRole: UserRole;
  isEnabled: boolean;
}

export type UserRole = "Admin" | "Hiring Manager" | "Recruiter" | "Interviewer";

// =============================================================================
// Custom Fields
// =============================================================================

export interface CustomField {
  id: string;
  title: string;
  fieldType: string;
  value: unknown;
}

// =============================================================================
// API Response Types
// =============================================================================

export interface PaginatedResponse<T> {
  results: T[];
  moreDataAvailable: boolean;
  nextCursor?: string;
}

export interface ApiResponse<T> {
  success: boolean;
  results?: T;
  errors?: ApiError[];
}

export interface ApiError {
  message: string;
  field?: string;
  code?: string;
}

// =============================================================================
// Composite Types for Common Operations
// =============================================================================

/**
 * Candidate with full context for display
 */
export interface CandidateWithContext extends Candidate {
  applications: ApplicationWithContext[];
  notes: Note[];
}

/**
 * Application with related entities expanded
 */
export type ApplicationWithContext = Omit<Application, "currentInterviewStage"> & {
  job: Job;
  candidate: Candidate;
  currentInterviewStage: InterviewStage | null;
  daysInCurrentStage: number;
  isStale: boolean;
};

/**
 * Pipeline summary by stage
 */
export interface PipelineSummary {
  totalCandidates: number;
  byStage: Array<{
    stage: InterviewStage;
    count: number;
    candidates: ApplicationWithContext[];
  }>;
  byJob: Array<{
    job: Job;
    count: number;
    candidates: ApplicationWithContext[];
  }>;
  staleCount: number;
  needsDecisionCount: number;
}

/**
 * Candidate comparison for side-by-side view
 */
export interface CandidateComparison {
  candidates: CandidateWithContext[];
  job: Job;
  comparisonFields: string[];
}
