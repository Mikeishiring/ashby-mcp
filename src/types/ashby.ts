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

/**
 * Application status values from the Ashby API (application.list endpoint)
 */
export type ApplicationStatus =
  | "Active"
  | "Hired"
  | "Archived"
  | "Lead";

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
  | "PostOffer"
  | "Archived";

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

/**
 * Feedback form field definition from Ashby
 */
export interface FeedbackFormField {
  id: string;
  type: "ValueSelect" | "RichText" | "Score" | "Boolean" | "String" | string;
  path: string;
  humanReadablePath: string;
  title: string;
  isNullable: boolean;
  selectableValues?: Array<{
    label: string;
    value: string;
  }>;
}

/**
 * Feedback form definition with sections
 */
export interface FeedbackFormDefinition {
  sections: Array<{
    fields: Array<{
      isRequired: boolean;
      field: FeedbackFormField;
      descriptionHtml?: string;
      descriptionPlain?: string;
    }>;
  }>;
}

/**
 * Submitted values - keyed by field path or id
 * Values can be strings, numbers, booleans, or objects like {score: number}
 */
export type FeedbackSubmittedValues = Record<string, string | number | boolean | { score: number } | null>;

/**
 * Full feedback submission from Ashby API
 */
export interface FeedbackSubmission {
  id: string;
  interviewId: string;
  interviewEventId?: string;
  applicationId: string;
  feedbackFormDefinitionId: string;
  formDefinition: FeedbackFormDefinition;
  submittedValues: FeedbackSubmittedValues;
  submittedAt: string;
  submittedByUser?: User;
}

/**
 * Parsed field submission for easier consumption
 */
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
  job: Job | null;
  comparisonFields: string[];
}

/**
 * Individual attribute rating from a scorecard
 */
export interface AttributeRating {
  name: string;
  averageRating: number | null;
  ratings: Array<{
    rating: number;
    submittedBy?: string;
    submittedAt: string;
  }>;
  textResponses: string[];
}

/**
 * Individual interviewer's scorecard submission
 */
export interface InterviewerScorecard {
  interviewerId: string;
  interviewerName: string;
  submittedAt: string;
  overallRating: number | null;
  overallRecommendation: string | null;
  attributeRatings: Array<{
    name: string;
    rating: number | null;
    textValue: string | null;
  }>;
}

/**
 * Candidate scorecard from interview feedback
 */
export interface Scorecard {
  candidate: Candidate;
  job: Job | null;
  overallRating: number | null;
  feedbackCount: number;
  pros: string[];
  cons: string[];
  recommendations: string[];
  submissions: FeedbackSubmission[];
  /** Aggregated ratings by attribute across all interviewers */
  attributeRatings: AttributeRating[];
  /** Individual scorecards from each interviewer */
  interviewerScorecards: InterviewerScorecard[];
}

/**
 * Source analytics for ROI tracking
 */
export interface SourceAnalytics {
  source: CandidateSource | null;
  sourceName: string;
  totalApplications: number;
  activeCount: number;
  hiredCount: number;
  archivedCount: number;
  conversionRate: number;
  avgDaysToHire: number | null;
}

/**
 * Interview prep packet
 */
export interface PrepPacket {
  candidate: Candidate;
  job: Job | null;
  highlights: string[];
  priorFeedback: Scorecard | null;
  upcomingInterview: InterviewEvent | null;
  notes: Note[];
  profileUrl: string;
}

/**
 * Triage session for bulk candidate review
 */
export interface TriageSession {
  id: string;
  userId: string;
  channelId: string;
  messageTs: string;
  candidates: ApplicationWithContext[];
  currentIndex: number;
  decisions: Array<{
    candidateId: string;
    applicationId: string;
    decision: "advance" | "reject" | "skip";
  }>;
  targetStageId?: string;
  archiveReasonId?: string;
  createdAt: Date;
  expiresAt: Date;
}

// =============================================================================
// Offers
// =============================================================================

/**
 * Job offer details from Ashby API.
 * Note: Offer data is form-based, so actual compensation fields vary
 * based on the offer form definition.
 */
export interface Offer {
  id: string;
  applicationId: string;
  status: OfferStatus;
  acceptanceStatus?: OfferAcceptanceStatus;
  offerProcessId: string;
  /** Form values keyed by field path - structure depends on offer form definition */
  offerForm?: Record<string, unknown>;
  /** Form definition for this offer */
  offerFormDefinition?: Record<string, unknown>;
  approvals?: OfferApproval[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Offer status values from the Ashby API (offer.list endpoint)
 */
export type OfferStatus =
  | "WaitingOnApprovalStart"
  | "WaitingOnOfferApproval"
  | "WaitingOnApprovalDefinition"
  | "WaitingOnCandidateResponse"
  | "CandidateRejected"
  | "CandidateAccepted"
  | "OfferCancelled";

/**
 * Offer acceptance status values from the Ashby API (offer.list endpoint)
 */
export type OfferAcceptanceStatus =
  | "Accepted"
  | "Declined"
  | "Pending"
  | "Created"
  | "Cancelled"
  | "WaitingOnResponse";

export interface OfferApproval {
  id: string;
  approverId: string;
  approver?: User;
  status: "Pending" | "Approved" | "Declined";
  approvedAt?: string;
  notes?: string;
}

export interface OfferProcess {
  id: string;
  title: string;
  offerFormDefinition?: OfferFormDefinition;
  approvalSteps?: OfferApprovalStep[];
}

export interface OfferFormDefinition {
  id: string;
  fields: OfferField[];
}

export interface OfferField {
  id: string;
  fieldType: string;
  title: string;
  isRequired: boolean;
  description?: string;
}

export interface OfferApprovalStep {
  id: string;
  order: number;
  approverIds: string[];
  requiresAll: boolean;
}

// =============================================================================
// Interview Details (expanded from basic Interview type)
// =============================================================================

/**
 * Full interview details with all related data
 */
export interface InterviewDetails extends Interview {
  application?: Application;
  candidate?: Candidate;
  job?: Job;
  feedbackSubmissions: FeedbackSubmission[];
}

/**
 * Interview event with full context
 */
export interface InterviewEventDetails extends InterviewEvent {
  interview?: Interview;
  schedule?: InterviewSchedule;
  application?: Application;
}

// =============================================================================
// Candidate Creation Parameters
// =============================================================================

/**
 * Parameters for creating a new candidate via candidate.create API.
 * Note: For custom fields, use the customFields.setValue endpoint after creation.
 */
export interface CreateCandidateParams {
  /** The first and last name of the candidate (required) */
  name: string;
  /** Primary, personal email of the candidate */
  email?: string;
  /** Primary, personal phone number */
  phoneNumber?: string;
  /** URL to the candidate's LinkedIn profile (must be valid URL) */
  linkedInUrl?: string;
  /** URL to the candidate's Github profile (must be valid URL) */
  githubUrl?: string;
  /** URL of the candidate's website (must be valid URL) */
  website?: string;
  /** Array of alternate email addresses */
  alternateEmailAddresses?: string[];
  /** The source ID to set on the candidate */
  sourceId?: string;
  /** The user ID the candidate will be credited to */
  creditedToUserId?: string;
  /** The location of the candidate */
  location?: {
    city?: string;
    region?: string;
    country?: string;
  };
  /** ISO date string to set the candidate's createdAt timestamp */
  createdAt?: string;
}

// =============================================================================
// Status Analysis Types (Phase A - Proactive Intelligence)
// =============================================================================

export type BlockerType =
  | "no_interview_scheduled"
  | "awaiting_feedback"
  | "ready_to_move"
  | "offer_pending"
  | "offer_not_sent"
  | "interview_completed_no_feedback"
  | "no_blocker";

export type BlockerSeverity = "critical" | "warning" | "info";

export type CandidatePriority = "urgent" | "high" | "medium" | "low";

export interface CandidateBlocker {
  type: BlockerType;
  severity: BlockerSeverity;
  message: string;
  suggestedAction: string;
  daysStuck?: number;
}

export interface RecentActivity {
  type: "interview" | "note" | "stage_change" | "feedback" | "offer";
  timestamp: string;
  summary: string;
  actor?: string;
}

/**
 * Comprehensive candidate status with intelligent analysis
 */
export interface CandidateStatusAnalysis {
  candidate: Candidate;
  application: Application;
  currentStage: InterviewStage;
  daysInStage: number;
  blockers: CandidateBlocker[];
  recentActivity: RecentActivity[];
  nextSteps: string[];
  priority: CandidatePriority;
  upcomingInterviews: InterviewEvent[];
  completedInterviewsWithoutFeedback: InterviewEvent[];
  pendingOffer?: Offer;
}

/**
 * Batch blocker analysis result
 */
export interface BatchBlockerAnalysis {
  analyzed: number;
  byBlockerType: Record<BlockerType, Array<{
    candidate: Candidate;
    blocker: CandidateBlocker;
    daysInStage: number;
  }>>;
  summary: {
    critical: number;
    warning: number;
    info: number;
  };
  urgentCandidates: Array<{
    candidate: Candidate;
    blocker: CandidateBlocker;
    priority: CandidatePriority;
  }>;
}

// =============================================================================
// AI Criteria Evaluations
// =============================================================================

/**
 * AI-generated criteria evaluation for an application.
 * Requires the AI Application Review feature to be enabled.
 */
export interface CriteriaEvaluation {
  id: string;
  applicationId: string;
  criteriaId: string;
  criteriaTitle: string;
  outcome: CriteriaEvaluationOutcome;
  reasoning: string;
  confidence?: number;
  evaluatedAt: string;
}

export type CriteriaEvaluationOutcome =
  | "Met"
  | "NotMet"
  | "PartiallyMet"
  | "Unknown";
