/**
 * Zod Validation Schemas for Tool Inputs
 *
 * Provides runtime validation and type safety for all tool inputs.
 */

import { z } from "zod";

// =============================================================================
// Base Schemas
// =============================================================================

/**
 * Common ID pattern - Ashby uses UUIDs
 */
const idSchema = z.string().min(1, "ID is required");

/**
 * Optional ID that can be provided or omitted
 */
const optionalIdSchema = z.string().min(1).optional();

/**
 * ISO 8601 datetime string
 */
const isoDateTimeSchema = z.string().refine(
  (val) => !isNaN(Date.parse(val)),
  { message: "Invalid ISO date format" }
);

/**
 * ISO 8601 date string (YYYY-MM-DD)
 */
const isoDateSchema = z.string().regex(
  /^\d{4}-\d{2}-\d{2}$/,
  "Invalid date format. Use YYYY-MM-DD"
);

/**
 * Email validation
 */
const emailSchema = z.string().email("Invalid email format");

/**
 * Positive integer
 */
const positiveIntSchema = z.number().int().positive();

/**
 * Non-negative integer for limits
 */
const limitSchema = z.number().int().min(1).max(100).default(10);

// =============================================================================
// Candidate Identification Schemas
// =============================================================================

/**
 * Candidate can be identified by ID, name, or email
 */
export const candidateIdentifierSchema = z.object({
  candidate_id: optionalIdSchema,
  name_or_email: z.string().min(1).optional(),
  candidate_name: z.string().min(1).optional(),
  candidate_email: emailSchema.optional(),
}).refine(
  (data) => data.candidate_id || data.name_or_email || data.candidate_name || data.candidate_email,
  { message: "At least one candidate identifier is required" }
);

/**
 * Optional candidate identifier (for tools where candidate is optional)
 */
export const optionalCandidateIdentifierSchema = z.object({
  candidate_id: optionalIdSchema,
  name_or_email: z.string().min(1).optional(),
  candidate_name: z.string().min(1).optional(),
  candidate_email: emailSchema.optional(),
});

/**
 * Job can be identified by ID or title
 */
export const jobIdentifierSchema = z.object({
  job_id: optionalIdSchema,
  job_title: z.string().min(1).optional(),
}).refine(
  (data) => data.job_id || data.job_title,
  { message: "Either job_id or job_title is required" }
);

/**
 * Optional job identifier
 */
export const optionalJobIdentifierSchema = z.object({
  job_id: optionalIdSchema,
  job_title: z.string().min(1).optional(),
});

// =============================================================================
// Pipeline & Overview Tools
// =============================================================================

export const getPipelineOverviewSchema = z.object({});

export const getStaleCandidatesSchema = z.object({
  limit: limitSchema.optional(),
});

export const getCandidatesNeedingDecisionSchema = z.object({
  limit: limitSchema.optional(),
});

export const getRecentApplicationsSchema = z.object({
  days: z.number().int().min(1).max(365).default(7).optional(),
});

// =============================================================================
// Search & Discovery Tools
// =============================================================================

export const searchCandidatesSchema = z.object({
  query: z.string().min(1, "Search query is required"),
});

export const getCandidatesForJobSchema = optionalJobIdentifierSchema;

// =============================================================================
// Candidate Details Tools
// =============================================================================

export const getCandidateDetailsSchema = optionalCandidateIdentifierSchema;

export const getCandidateScorecardSchema = optionalCandidateIdentifierSchema.extend({
  application_id: optionalIdSchema,
});

// =============================================================================
// Job Tools
// =============================================================================

export const getOpenJobsSchema = z.object({});

export const getJobDetailsSchema = optionalJobIdentifierSchema;

// =============================================================================
// Interview & Scheduling Tools
// =============================================================================

export const listInterviewPlansSchema = z.object({});

export const getInterviewSchedulesSchema = optionalCandidateIdentifierSchema.extend({
  application_id: optionalIdSchema,
});

export const getTeamMembersSchema = z.object({});

export const scheduleInterviewSchema = optionalCandidateIdentifierSchema.extend({
  application_id: optionalIdSchema,
  start_time: isoDateTimeSchema,
  end_time: isoDateTimeSchema,
  interviewer_ids: z.array(idSchema).min(1, "At least one interviewer is required"),
  meeting_link: z.string().url().optional(),
  location: z.string().optional(),
});

export const rescheduleInterviewSchema = z.object({
  interview_schedule_id: idSchema,
  start_time: isoDateTimeSchema,
  end_time: isoDateTimeSchema,
  interviewer_ids: z.array(idSchema).min(1, "At least one interviewer is required"),
  meeting_link: z.string().url().optional(),
  location: z.string().optional(),
});

export const cancelInterviewSchema = z.object({
  interview_schedule_id: idSchema,
  cancellation_reason: z.string().optional(),
});

export const listAllInterviewsSchema = z.object({
  candidate_id: optionalIdSchema,
  application_id: optionalIdSchema,
  user_id: optionalIdSchema,
  start_date: isoDateTimeSchema.optional(),
  end_date: isoDateTimeSchema.optional(),
});

export const getUpcomingInterviewsSchema = z.object({
  limit: limitSchema.optional(),
});

export const listInterviewEventsSchema = z.object({
  interview_schedule_id: idSchema,
});

// =============================================================================
// Feedback Tools
// =============================================================================

export const listFeedbackSubmissionsSchema = z.object({
  candidate_id: optionalIdSchema,
  application_id: optionalIdSchema,
  name_or_email: z.string().optional(),
  interview_id: optionalIdSchema,
});

export const getFeedbackDetailsSchema = z.object({
  feedback_submission_id: idSchema,
});

// =============================================================================
// Comparison & Analytics Tools
// =============================================================================

export const compareCandidatesSchema = z.object({
  candidate_ids: z.array(idSchema).optional(),
  job_title: z.string().optional(),
  limit: z.number().int().min(1).max(5).default(3).optional(),
});

export const getSourceAnalyticsSchema = z.object({
  days: z.number().int().min(1).max(365).default(90).optional(),
});

// =============================================================================
// Interview Prep Tools
// =============================================================================

export const getInterviewPrepSchema = optionalCandidateIdentifierSchema.extend({
  application_id: optionalIdSchema,
});

// =============================================================================
// Rejection Tools
// =============================================================================

export const getRejectionReasonsSchema = z.object({});

export const rejectCandidateSchema = optionalCandidateIdentifierSchema.extend({
  application_id: optionalIdSchema,
  archive_reason_id: idSchema,
});

// =============================================================================
// Tag Tools
// =============================================================================

export const listCandidateTagsSchema = z.object({});

export const addCandidateTagSchema = optionalCandidateIdentifierSchema.extend({
  tag_id: idSchema,
});

// =============================================================================
// Source & Hiring Team Tools
// =============================================================================

export const listCandidateSourcesSchema = z.object({});

export const getHiringTeamSchema = optionalCandidateIdentifierSchema.extend({
  application_id: optionalIdSchema,
});

export const searchUsersSchema = z.object({
  name: z.string().optional(),
  email: emailSchema.optional(),
}).refine(
  (data) => data.name || data.email,
  { message: "Either name or email is required" }
);

// =============================================================================
// Custom Fields & Organization Tools
// =============================================================================

export const listCustomFieldsSchema = z.object({});

export const listLocationsSchema = z.object({});

export const listDepartmentsSchema = z.object({});

export const getApplicationHistorySchema = optionalCandidateIdentifierSchema.extend({
  application_id: optionalIdSchema,
});

// =============================================================================
// Triage Tools
// =============================================================================

export const startTriageSchema = z.object({
  job_title: z.string().optional(),
  stage: z.string().optional(),
  limit: z.number().int().min(1).max(10).default(5).optional(),
});

// =============================================================================
// Reminder Tools
// =============================================================================

export const setReminderSchema = optionalCandidateIdentifierSchema.extend({
  application_id: optionalIdSchema,
  remind_in: z.string().min(1, "remind_in is required (e.g., '3 days', '1 week')"),
  note: z.string().optional(),
});

// =============================================================================
// Write Operation Tools
// =============================================================================

export const addNoteSchema = optionalCandidateIdentifierSchema.extend({
  content: z.string().min(1, "Note content is required"),
});

export const moveCandidateStageSchema = optionalCandidateIdentifierSchema.extend({
  application_id: optionalIdSchema,
  target_stage: z.string().min(1, "target_stage is required"),
});

// =============================================================================
// Offer Tools
// =============================================================================

export const listOffersSchema = optionalCandidateIdentifierSchema.extend({
  application_id: optionalIdSchema,
  status: z.enum([
    "Draft", "Pending", "Approved", "Sent",
    "Accepted", "Declined", "Expired", "Withdrawn",
  ]).optional(),
});

export const getPendingOffersSchema = z.object({});

export const getCandidateOfferSchema = optionalCandidateIdentifierSchema.extend({
  application_id: optionalIdSchema,
});

export const createOfferSchema = optionalCandidateIdentifierSchema.extend({
  application_id: optionalIdSchema,
  offer_process_id: idSchema,
  start_date: isoDateSchema,
  salary: positiveIntSchema,
  salary_frequency: z.enum(["Annual", "Hourly"]).optional(),
  currency: z.string().length(3).optional(),
  equity: z.number().optional(),
  signing_bonus: z.number().optional(),
  relocation_bonus: z.number().optional(),
  variable_compensation: z.number().optional(),
  notes: z.string().optional(),
});

export const updateOfferSchema = z.object({
  offer_id: idSchema,
  salary: positiveIntSchema.optional(),
  start_date: isoDateSchema.optional(),
  equity: z.number().optional(),
  signing_bonus: z.number().optional(),
  relocation_bonus: z.number().optional(),
  variable_compensation: z.number().optional(),
  notes: z.string().optional(),
});

export const approveOfferSchema = z.object({
  offer_id: idSchema,
  approver_id: idSchema,
});

export const sendOfferSchema = z.object({
  offer_id: idSchema,
});

// =============================================================================
// Candidate Creation Tools
// =============================================================================

export const createCandidateSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: emailSchema,
  phone_number: z.string().optional(),
  linkedin_url: z.string().url().optional(),
  source_id: optionalIdSchema,
  tags: z.array(z.string()).optional(),
});

export const applyToJobSchema = optionalCandidateIdentifierSchema
  .merge(optionalJobIdentifierSchema)
  .extend({
    source_id: optionalIdSchema,
  });

export const transferApplicationSchema = optionalCandidateIdentifierSchema
  .merge(optionalJobIdentifierSchema)
  .extend({
    application_id: optionalIdSchema,
  });

// =============================================================================
// Proactive Analysis Tools
// =============================================================================

export const analyzeCandidateStatusSchema = optionalCandidateIdentifierSchema.extend({
  application_id: optionalIdSchema,
});

export const analyzeCandidateBlockersSchema = z.object({
  candidate_ids: z.array(idSchema).optional(),
});

// =============================================================================
// Schema Registry
// =============================================================================

/**
 * Map of tool names to their validation schemas
 */
export const toolSchemas: Record<string, z.ZodSchema> = {
  // Pipeline & Overview
  get_pipeline_overview: getPipelineOverviewSchema,
  get_stale_candidates: getStaleCandidatesSchema,
  get_candidates_needing_decision: getCandidatesNeedingDecisionSchema,
  get_recent_applications: getRecentApplicationsSchema,

  // Search & Discovery
  search_candidates: searchCandidatesSchema,
  get_candidates_for_job: getCandidatesForJobSchema,

  // Candidate Details
  get_candidate_details: getCandidateDetailsSchema,
  get_candidate_scorecard: getCandidateScorecardSchema,

  // Job
  get_open_jobs: getOpenJobsSchema,
  get_job_details: getJobDetailsSchema,

  // Interview & Scheduling
  list_interview_plans: listInterviewPlansSchema,
  get_interview_schedules: getInterviewSchedulesSchema,
  get_team_members: getTeamMembersSchema,
  schedule_interview: scheduleInterviewSchema,
  reschedule_interview: rescheduleInterviewSchema,
  cancel_interview: cancelInterviewSchema,
  list_all_interviews: listAllInterviewsSchema,
  get_upcoming_interviews: getUpcomingInterviewsSchema,
  list_interview_events: listInterviewEventsSchema,

  // Feedback
  list_feedback_submissions: listFeedbackSubmissionsSchema,
  get_feedback_details: getFeedbackDetailsSchema,

  // Comparison & Analytics
  compare_candidates: compareCandidatesSchema,
  get_source_analytics: getSourceAnalyticsSchema,

  // Interview Prep
  get_interview_prep: getInterviewPrepSchema,

  // Rejection
  get_rejection_reasons: getRejectionReasonsSchema,
  reject_candidate: rejectCandidateSchema,

  // Tags
  list_candidate_tags: listCandidateTagsSchema,
  add_candidate_tag: addCandidateTagSchema,

  // Sources & Hiring Team
  list_candidate_sources: listCandidateSourcesSchema,
  get_hiring_team: getHiringTeamSchema,
  search_users: searchUsersSchema,

  // Custom Fields & Organization
  list_custom_fields: listCustomFieldsSchema,
  list_locations: listLocationsSchema,
  list_departments: listDepartmentsSchema,
  get_application_history: getApplicationHistorySchema,

  // Triage
  start_triage: startTriageSchema,

  // Reminders
  set_reminder: setReminderSchema,

  // Write Operations
  add_note: addNoteSchema,
  move_candidate_stage: moveCandidateStageSchema,

  // Offers
  list_offers: listOffersSchema,
  get_pending_offers: getPendingOffersSchema,
  get_candidate_offer: getCandidateOfferSchema,
  create_offer: createOfferSchema,
  update_offer: updateOfferSchema,
  approve_offer: approveOfferSchema,
  send_offer: sendOfferSchema,

  // Candidate Creation
  create_candidate: createCandidateSchema,
  apply_to_job: applyToJobSchema,
  transfer_application: transferApplicationSchema,

  // Proactive Analysis
  analyze_candidate_status: analyzeCandidateStatusSchema,
  analyze_candidate_blockers: analyzeCandidateBlockersSchema,
};

/**
 * Validate tool input against its schema
 */
export function validateToolInput(
  toolName: string,
  input: unknown
): { success: true; data: Record<string, unknown> } | { success: false; error: string } {
  const schema = toolSchemas[toolName];

  if (!schema) {
    return { success: false, error: `No validation schema for tool: ${toolName}` };
  }

  const result = schema.safeParse(input);

  if (!result.success) {
    const errors = result.error.errors
      .map((e) => `${e.path.join(".")}: ${e.message}`)
      .join("; ");
    return { success: false, error: `Validation failed: ${errors}` };
  }

  return { success: true, data: result.data as Record<string, unknown> };
}

/**
 * Inferred types from schemas
 */
export type ScheduleInterviewInput = z.infer<typeof scheduleInterviewSchema>;
export type CreateOfferInput = z.infer<typeof createOfferSchema>;
export type CreateCandidateInput = z.infer<typeof createCandidateSchema>;
export type AddNoteInput = z.infer<typeof addNoteSchema>;
