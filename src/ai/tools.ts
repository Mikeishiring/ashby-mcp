/**
 * Claude Tool Definitions
 *
 * Defines the tools available to Claude for interacting with Ashby.
 */

import type { Tool } from "@anthropic-ai/sdk/resources/messages.js";

export const ashbyTools: Tool[] = [
  // ===========================================================================
  // Pipeline & Overview Tools
  // ===========================================================================
  {
    name: "get_pipeline_overview",
    description:
      "Get a full pipeline summary showing candidates by stage and job. Use this when asked about the overall pipeline, hiring status, or for a general overview.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "get_stale_candidates",
    description:
      "Get candidates who have been stuck in their current stage for more than 14 days. Excludes Application Review stage which normally has a backlog.",
    input_schema: {
      type: "object" as const,
      properties: {
        limit: {
          type: "number",
          description: "Maximum number of stale candidates to return (default: 10)",
        },
      },
      required: [],
    },
  },
  {
    name: "get_candidates_needing_decision",
    description:
      "Get candidates in final stages (final round, offer, reference check) who are waiting for a hiring decision.",
    input_schema: {
      type: "object" as const,
      properties: {
        limit: {
          type: "number",
          description: "Maximum number of candidates to return (default: 10)",
        },
      },
      required: [],
    },
  },
  {
    name: "get_recent_applications",
    description: "Get candidates who applied in the last N days.",
    input_schema: {
      type: "object" as const,
      properties: {
        days: {
          type: "number",
          description: "Number of days to look back (default: 7)",
        },
      },
      required: [],
    },
  },

  // ===========================================================================
  // Search & Discovery Tools
  // ===========================================================================
  {
    name: "search_candidates",
    description:
      "Search for candidates by name or email. Use this when looking for a specific person.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "Name or email to search for",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "get_candidates_for_job",
    description: "Get all active candidates for a specific job/role.",
    input_schema: {
      type: "object" as const,
      properties: {
        job_id: {
          type: "string",
          description: "The job ID to get candidates for",
        },
        job_title: {
          type: "string",
          description: "The job title to search for (if job_id not known)",
        },
      },
      required: [],
    },
  },

  // ===========================================================================
  // Candidate Details Tools
  // ===========================================================================
  {
    name: "get_candidate_details",
    description:
      "Get full details about a specific candidate including their applications, current stage, and notes.",
    input_schema: {
      type: "object" as const,
      properties: {
        candidate_id: {
          type: "string",
          description: "The candidate ID",
        },
        name_or_email: {
          type: "string",
          description: "Name or email to search for (if candidate_id not known)",
        },
      },
      required: [],
    },
  },
  {
    name: "get_candidate_resume",
    description:
      "Get the resume download URL for a candidate. Returns a direct link to download the resume PDF. The URL is temporary and should be shared immediately.",
    input_schema: {
      type: "object" as const,
      properties: {
        candidate_id: {
          type: "string",
          description: "The candidate ID",
        },
        name_or_email: {
          type: "string",
          description: "Name or email to search for (if candidate_id not known)",
        },
      },
      required: [],
    },
  },
  {
    name: "get_interview_briefing",
    description:
      "Get a comprehensive interview briefing for the requesting user. Call this when someone says they have an interview or call with a candidate. Returns resume URL, notes, prior feedback, and interview context. Requires the user's email to match with their Ashby account.",
    input_schema: {
      type: "object" as const,
      properties: {
        interviewer_email: {
          type: "string",
          description:
            "The email of the interviewer (use Slack user's email). Required to match with Ashby user.",
        },
        candidate_name: {
          type: "string",
          description:
            "Optional: the candidate's first name or full name to find a specific interview",
        },
        candidate_id: {
          type: "string",
          description:
            "Optional: if you already know the candidate ID, use this instead of candidate_name",
        },
      },
      required: [],
    },
  },

  // ===========================================================================
  // Job Tools
  // ===========================================================================
  {
    name: "get_open_jobs",
    description: "List all open positions/roles that are actively hiring.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "get_job_details",
    description:
      "Get details about a specific job including description and requirements.",
    input_schema: {
      type: "object" as const,
      properties: {
        job_id: {
          type: "string",
          description: "The job ID",
        },
        job_title: {
          type: "string",
          description: "The job title to search for (if job_id not known)",
        },
      },
      required: [],
    },
  },

  // ===========================================================================
  // Interview & Scheduling Tools
  // ===========================================================================
  {
    name: "list_interview_plans",
    description:
      "List all interview plans in the organization. Shows the interview stages for each plan.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "get_interview_schedules",
    description:
      "Get interview schedules for a candidate. Shows upcoming and past interviews.",
    input_schema: {
      type: "object" as const,
      properties: {
        candidate_id: {
          type: "string",
          description: "The candidate ID",
        },
        application_id: {
          type: "string",
          description: "Application ID to use when a candidate has multiple active applications",
        },
        name_or_email: {
          type: "string",
          description: "Name or email to find the candidate (if candidate_id not known)",
        },
      },
      required: [],
    },
  },
  {
    name: "get_team_members",
    description:
      "List all users in the organization (interviewers, recruiters, hiring managers). Use this to get user IDs needed for scheduling interviews.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "schedule_interview",
    description:
      "Create an interview schedule for a candidate. Requires interview start/end times and interviewer user IDs (get IDs from get_team_members tool). This action requires confirmation.",
    input_schema: {
      type: "object" as const,
      properties: {
        candidate_id: {
          type: "string",
          description: "The candidate ID",
        },
        application_id: {
          type: "string",
          description: "Application ID to use when a candidate has multiple active applications",
        },
        name_or_email: {
          type: "string",
          description: "Name or email to find the candidate (if candidate_id not known)",
        },
        start_time: {
          type: "string",
          description: "Interview start time in ISO format (e.g., 2026-01-20T14:00:00Z)",
        },
        end_time: {
          type: "string",
          description: "Interview end time in ISO format (e.g., 2026-01-20T15:00:00Z)",
        },
        interviewer_ids: {
          type: "array",
          items: { type: "string" },
          description: "Array of interviewer user IDs (from get_team_members)",
        },
        meeting_link: {
          type: "string",
          description: "Optional meeting link (Zoom, Google Meet, etc.)",
        },
        location: {
          type: "string",
          description: "Optional physical location",
        },
      },
      required: ["start_time", "end_time", "interviewer_ids"],
    },
  },

  // ===========================================================================
  // Scorecard & Feedback Tools
  // ===========================================================================
  {
    name: "get_candidate_scorecard",
    description:
      "Get interview feedback summary for a candidate. Shows overall rating, pros, cons, and recommendations from all interviewers.",
    input_schema: {
      type: "object" as const,
      properties: {
        candidate_id: {
          type: "string",
          description: "The candidate ID",
        },
        application_id: {
          type: "string",
          description: "Application ID to use when a candidate has multiple active applications",
        },
        name_or_email: {
          type: "string",
          description: "Name or email to find the candidate (if candidate_id not known)",
        },
      },
      required: [],
    },
  },
  {
    name: "list_feedback_submissions",
    description:
      "List interview feedback submissions for an application. Shows who submitted feedback and when. Requires either application_id or candidate identification.",
    input_schema: {
      type: "object" as const,
      properties: {
        candidate_id: {
          type: "string",
          description: "Candidate ID to get feedback for (will find their active application)",
        },
        application_id: {
          type: "string",
          description: "Application ID to get feedback for (preferred if known)",
        },
        name_or_email: {
          type: "string",
          description: "Candidate name or email (used to find candidate if IDs not provided)",
        },
      },
      required: [],
    },
  },

  // ===========================================================================
  // Comparison & Analytics Tools
  // ===========================================================================
  {
    name: "compare_candidates",
    description:
      "Compare multiple candidates side-by-side. Can compare specific candidates by ID or get top N candidates for a job.",
    input_schema: {
      type: "object" as const,
      properties: {
        candidate_ids: {
          type: "array",
          items: { type: "string" },
          description: "Array of candidate IDs to compare",
        },
        job_title: {
          type: "string",
          description: "Job title to get top candidates for (if candidate_ids not provided)",
        },
        limit: {
          type: "number",
          description: "Maximum candidates to compare (default: 3, max: 5)",
        },
      },
      required: [],
    },
  },
  {
    name: "get_source_analytics",
    description:
      "Get source/channel performance metrics. Shows conversion rates, hire rates, and average days to hire by source.",
    input_schema: {
      type: "object" as const,
      properties: {
        days: {
          type: "number",
          description: "Days to analyze (default: 90)",
        },
      },
      required: [],
    },
  },

  // ===========================================================================
  // Interview Prep Tools
  // ===========================================================================
  {
    name: "get_interview_prep",
    description:
      "Generate an interview prep packet for a candidate. Includes job details, candidate highlights, prior feedback, and upcoming interview info.",
    input_schema: {
      type: "object" as const,
      properties: {
        candidate_id: {
          type: "string",
          description: "The candidate ID",
        },
        application_id: {
          type: "string",
          description: "Application ID to use when a candidate has multiple active applications",
        },
        name_or_email: {
          type: "string",
          description: "Name or email to find the candidate (if candidate_id not known)",
        },
      },
      required: [],
    },
  },

  // ===========================================================================
  // Rejection Tools
  // ===========================================================================
  {
    name: "get_rejection_reasons",
    description:
      "List available rejection/archive reasons. Use this to get reason IDs for the reject_candidate tool.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "reject_candidate",
    description:
      "Archive/reject a candidate with a reason. This triggers Ashby's rejection email automation if configured. This action requires confirmation.",
    input_schema: {
      type: "object" as const,
      properties: {
        candidate_id: {
          type: "string",
          description: "The candidate ID",
        },
        application_id: {
          type: "string",
          description: "Application ID to use when a candidate has multiple active applications",
        },
        name_or_email: {
          type: "string",
          description: "Name or email to find the candidate (if candidate_id not known)",
        },
        archive_reason_id: {
          type: "string",
          description: "Archive reason ID (from get_rejection_reasons)",
        },
      },
      required: ["archive_reason_id"],
    },
  },
  {
    name: "list_candidate_tags",
    description:
      "List all available candidate tags in the system. Use this to find tag IDs before adding tags to candidates with add_candidate_tag.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "list_candidate_sources",
    description:
      "List all candidate sources (e.g., LinkedIn, Indeed, Referral) in the system. Use this for source analytics and tracking.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "get_hiring_team",
    description:
      "Get the hiring team members and their roles for a specific application. Shows who's involved in the hiring process (recruiter, hiring manager, etc.).",
    input_schema: {
      type: "object" as const,
      properties: {
        application_id: {
          type: "string",
          description: "Application ID to get hiring team for",
        },
        candidate_id: {
          type: "string",
          description: "Candidate ID (will find active application if application_id not provided)",
        },
        candidate_name: {
          type: "string",
          description: "Candidate name (used to find ID if neither ID provided)",
        },
        candidate_email: {
          type: "string",
          description: "Candidate email (used to find ID if neither ID provided)",
        },
      },
      required: [],
    },
  },
  {
    name: "search_users",
    description:
      "Search for team members by name or email. Use this to find user IDs for scheduling, assignments, etc.",
    input_schema: {
      type: "object" as const,
      properties: {
        name: {
          type: "string",
          description: "Search by name",
        },
        email: {
          type: "string",
          description: "Search by email",
        },
      },
      required: [],
    },
  },
  {
    name: "get_feedback_details",
    description:
      "Get detailed interview feedback content for a specific feedback submission. Shows full feedback text, ratings, and recommendations.",
    input_schema: {
      type: "object" as const,
      properties: {
        feedback_submission_id: {
          type: "string",
          description: "Feedback submission ID (from list_feedback_submissions)",
        },
      },
      required: ["feedback_submission_id"],
    },
  },
  {
    name: "list_custom_fields",
    description:
      "List all custom fields configured in the system. Custom fields are company-specific data fields added to candidates or applications.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "list_locations",
    description:
      "List all office locations in the system. Useful for filtering jobs or candidates by location.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "list_departments",
    description:
      "List all departments in the organization. Useful for understanding org structure and filtering jobs.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "get_application_history",
    description:
      "Get the full stage history for an application, showing all stage transitions and timestamps. Useful for understanding candidate journey.",
    input_schema: {
      type: "object" as const,
      properties: {
        application_id: {
          type: "string",
          description: "Application ID to get history for",
        },
        candidate_id: {
          type: "string",
          description: "Candidate ID (will find active application if application_id not provided)",
        },
        candidate_name: {
          type: "string",
          description: "Candidate name (used to find ID)",
        },
        candidate_email: {
          type: "string",
          description: "Candidate email (used to find ID)",
        },
      },
      required: [],
    },
  },
  {
    name: "list_interview_events",
    description:
      "List interview events (individual interview sessions) for a specific interview schedule.",
    input_schema: {
      type: "object" as const,
      properties: {
        interview_schedule_id: {
          type: "string",
          description: "Filter by specific interview schedule",
        },
      },
      required: ["interview_schedule_id"],
    },
  },

  // ===========================================================================
  // Triage Tools
  // ===========================================================================
  {
    name: "start_triage",
    description:
      "Start a rapid triage session for reviewing candidates. Returns candidates one-by-one for quick decisions via emoji reactions (✅=mark advance, ❌=mark reject, 🤔=skip). Review-only; no changes are applied.",
    input_schema: {
      type: "object" as const,
      properties: {
        job_title: {
          type: "string",
          description: "Job title to filter candidates",
        },
        stage: {
          type: "string",
          description: "Stage to filter candidates (e.g., 'Application Review')",
        },
        limit: {
          type: "number",
          description: "Max candidates to triage (default: 5)",
        },
      },
      required: [],
    },
  },

  // ===========================================================================
  // Reminder Tools
  // ===========================================================================
  {
    name: "set_reminder",
    description:
      "Set a reminder about a candidate. Will DM the user at the specified time with candidate context.",
    input_schema: {
      type: "object" as const,
      properties: {
        candidate_id: {
          type: "string",
          description: "The candidate ID",
        },
        application_id: {
          type: "string",
          description: "Application ID to use when a candidate has multiple active applications",
        },
        name_or_email: {
          type: "string",
          description: "Name or email to find the candidate (if candidate_id not known)",
        },
        remind_in: {
          type: "string",
          description: "When to remind (e.g., '3 days', '1 week', 'tomorrow')",
        },
        note: {
          type: "string",
          description: "Optional note to include in reminder",
        },
      },
      required: ["remind_in"],
    },
  },

  // ===========================================================================
  // Write Operation Tools
  // ===========================================================================
  {
    name: "add_note",
    description:
      "Add a note to a candidate's profile. Notes are automatically tagged with [via Slack Bot]. This action requires confirmation.",
    input_schema: {
      type: "object" as const,
      properties: {
        candidate_id: {
          type: "string",
          description: "The candidate ID to add the note to",
        },
        name_or_email: {
          type: "string",
          description: "Name or email to find the candidate (if candidate_id not known)",
        },
        content: {
          type: "string",
          description: "The note content to add",
        },
      },
      required: ["content"],
    },
  },
  {
    name: "move_candidate_stage",
    description:
      "Move a candidate to a different interview stage. This action requires confirmation.",
    input_schema: {
      type: "object" as const,
      properties: {
        candidate_id: {
          type: "string",
          description: "The candidate ID",
        },
        application_id: {
          type: "string",
          description: "Application ID to use when a candidate has multiple active applications",
        },
        name_or_email: {
          type: "string",
          description: "Name or email to find the candidate (if candidate_id not known)",
        },
        target_stage: {
          type: "string",
          description: "The name of the stage to move the candidate to",
        },
      },
      required: ["target_stage"],
    },
  },

  // ===========================================================================
  // Phase 1: Offers (New Tools)
  // ===========================================================================
  {
    name: "list_offers",
    description:
      "List all job offers, optionally filtered by candidate/application or status.",
    input_schema: {
      type: "object" as const,
      properties: {
        candidate_id: {
          type: "string",
          description: "Filter offers for a specific candidate",
        },
        application_id: {
          type: "string",
          description: "Filter offers for a specific application",
        },
        status: {
          type: "string",
          description: "Filter by status: Draft, Pending, Approved, Sent, Accepted, Declined, Expired, Withdrawn",
        },
      },
      required: [],
    },
  },
  {
    name: "get_pending_offers",
    description:
      "Get all pending offers (Draft, Pending, or Approved status) that need attention.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "get_candidate_offer",
    description:
      "Get the offer for a specific candidate (if one exists).",
    input_schema: {
      type: "object" as const,
      properties: {
        candidate_id: {
          type: "string",
          description: "The candidate ID",
        },
        name_or_email: {
          type: "string",
          description: "Name or email to find the candidate (if candidate_id not known)",
        },
      },
      required: [],
    },
  },
  {
    name: "create_offer",
    description:
      "Create a job offer for a candidate. This action requires confirmation.",
    input_schema: {
      type: "object" as const,
      properties: {
        candidate_id: {
          type: "string",
          description: "The candidate ID",
        },
        name_or_email: {
          type: "string",
          description: "Name or email to find the candidate (if candidate_id not known)",
        },
        offer_process_id: {
          type: "string",
          description: "The offer process ID (template) to use",
        },
        start_date: {
          type: "string",
          description: "Start date in ISO format (YYYY-MM-DD)",
        },
        salary: {
          type: "number",
          description: "Annual salary amount",
        },
        salary_frequency: {
          type: "string",
          description: "Annual or Hourly (default: Annual)",
        },
        currency: {
          type: "string",
          description: "Currency code (e.g., USD, EUR)",
        },
        equity: {
          type: "number",
          description: "Equity grant amount (optional)",
        },
        signing_bonus: {
          type: "number",
          description: "Signing bonus amount (optional)",
        },
        relocation_bonus: {
          type: "number",
          description: "Relocation bonus amount (optional)",
        },
        variable_compensation: {
          type: "number",
          description: "Variable compensation amount (optional)",
        },
        notes: {
          type: "string",
          description: "Internal notes about the offer",
        },
      },
      required: ["offer_process_id", "start_date", "salary"],
    },
  },
  {
    name: "update_offer",
    description:
      "Update an existing offer (salary, start date, bonuses, etc.). This action requires confirmation.",
    input_schema: {
      type: "object" as const,
      properties: {
        offer_id: {
          type: "string",
          description: "The offer ID to update",
        },
        salary: {
          type: "number",
          description: "New salary amount",
        },
        start_date: {
          type: "string",
          description: "New start date in ISO format (YYYY-MM-DD)",
        },
        equity: {
          type: "number",
          description: "New equity amount",
        },
        signing_bonus: {
          type: "number",
          description: "New signing bonus",
        },
        relocation_bonus: {
          type: "number",
          description: "New relocation bonus",
        },
        variable_compensation: {
          type: "number",
          description: "New variable compensation",
        },
        notes: {
          type: "string",
          description: "Updated notes",
        },
      },
      required: ["offer_id"],
    },
  },
  {
    name: "approve_offer",
    description:
      "Approve an offer (requires approval workflow). This action requires confirmation.",
    input_schema: {
      type: "object" as const,
      properties: {
        offer_id: {
          type: "string",
          description: "The offer ID to approve",
        },
        approver_id: {
          type: "string",
          description: "User ID of the approver",
        },
      },
      required: ["offer_id", "approver_id"],
    },
  },
  {
    name: "send_offer",
    description:
      "Send offer to candidate (after all approvals). This action requires confirmation.",
    input_schema: {
      type: "object" as const,
      properties: {
        offer_id: {
          type: "string",
          description: "The offer ID to send",
        },
      },
      required: ["offer_id"],
    },
  },

  // ===========================================================================
  // Phase 1: Interviews (New Tools)
  // ===========================================================================
  {
    name: "list_all_interviews",
    description:
      "List interviews filtered by application, interviewer, or date range.",
    input_schema: {
      type: "object" as const,
      properties: {
        candidate_id: {
          type: "string",
          description: "Filter by candidate (will find their application)",
        },
        application_id: {
          type: "string",
          description: "Filter by application ID",
        },
        user_id: {
          type: "string",
          description: "Filter by interviewer user ID",
        },
        start_date: {
          type: "string",
          description: "Filter interviews after this date (ISO format)",
        },
        end_date: {
          type: "string",
          description: "Filter interviews before this date (ISO format)",
        },
      },
      required: [],
    },
  },
  {
    name: "get_upcoming_interviews",
    description:
      "Get upcoming interviews across all candidates. Shows next N interviews sorted by date.",
    input_schema: {
      type: "object" as const,
      properties: {
        limit: {
          type: "number",
          description: "Maximum number of interviews to return (default: 10)",
        },
      },
      required: [],
    },
  },
  {
    name: "get_interview_stats",
    description:
      "Get interview statistics and counts for a date range, optionally filtered by job. Use this for questions like 'how many interviews did we do last month' or 'DevOps interview count'. Returns total count, breakdown by job and stage, and candidate details.",
    input_schema: {
      type: "object" as const,
      properties: {
        start_date: {
          type: "string",
          description: "Start date for the range (ISO format, e.g., 2025-12-01)",
        },
        end_date: {
          type: "string",
          description: "End date for the range (ISO format, e.g., 2025-12-31)",
        },
        job_title: {
          type: "string",
          description: "Optional: Filter by job title (partial match, e.g., 'DevOps', 'Engineer')",
        },
        status: {
          type: "string",
          enum: ["Scheduled", "Completed", "Cancelled", "All"],
          description: "Filter by interview status (default: Completed)",
        },
      },
      required: ["start_date", "end_date"],
    },
  },
  {
    name: "reschedule_interview",
    description:
      "Reschedule an interview to a new time/date. This action requires confirmation.",
    input_schema: {
      type: "object" as const,
      properties: {
        interview_schedule_id: {
          type: "string",
          description: "The interview schedule ID to reschedule",
        },
        start_time: {
          type: "string",
          description: "New start time in ISO format (e.g., 2026-01-20T14:00:00Z)",
        },
        end_time: {
          type: "string",
          description: "New end time in ISO format (e.g., 2026-01-20T15:00:00Z)",
        },
        interviewer_ids: {
          type: "array",
          items: { type: "string" },
          description: "Interviewer user IDs (can change interviewers when rescheduling)",
        },
        meeting_link: {
          type: "string",
          description: "Updated meeting link",
        },
        location: {
          type: "string",
          description: "Updated physical location",
        },
      },
      required: ["interview_schedule_id", "start_time", "end_time", "interviewer_ids"],
    },
  },
  {
    name: "cancel_interview",
    description:
      "Cancel an interview. This action requires confirmation.",
    input_schema: {
      type: "object" as const,
      properties: {
        interview_schedule_id: {
          type: "string",
          description: "The interview schedule ID to cancel",
        },
        cancellation_reason: {
          type: "string",
          description: "Reason for cancellation (optional)",
        },
      },
      required: ["interview_schedule_id"],
    },
  },

  // ===========================================================================
  // Phase 1: Candidate Creation (New Tool)
  // ===========================================================================
  {
    name: "create_candidate",
    description:
      "Create a new candidate in the system. This action requires confirmation.",
    input_schema: {
      type: "object" as const,
      properties: {
        name: {
          type: "string",
          description: "Candidate's full name",
        },
        email: {
          type: "string",
          description: "Candidate's email address",
        },
        phone_number: {
          type: "string",
          description: "Phone number (optional)",
        },
        linkedin_url: {
          type: "string",
          description: "LinkedIn profile URL (optional)",
        },
        source_id: {
          type: "string",
          description: "Source ID for tracking (use list_candidate_sources to find IDs)",
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Tags to apply to candidate",
        },
      },
      required: ["name", "email"],
    },
  },
  {
    name: "apply_to_job",
    description:
      "Apply an existing candidate to a different job. Creates a new application for the candidate in another role. This action requires confirmation.",
    input_schema: {
      type: "object" as const,
      properties: {
        candidate_id: {
          type: "string",
          description: "Candidate ID to apply to new job",
        },
        candidate_name: {
          type: "string",
          description: "Candidate name (used to find ID if candidate_id not provided)",
        },
        candidate_email: {
          type: "string",
          description: "Candidate email (used to find ID if candidate_id not provided)",
        },
        job_id: {
          type: "string",
          description: "Job ID to apply to (required)",
        },
        job_title: {
          type: "string",
          description: "Job title (used to find ID if job_id not provided)",
        },
        source_id: {
          type: "string",
          description: "Optional source ID for tracking",
        },
      },
      required: [],
    },
  },
  {
    name: "transfer_application",
    description:
      "Transfer a candidate's existing application to a different job. Use when a candidate is better suited for another role. This action requires confirmation.",
    input_schema: {
      type: "object" as const,
      properties: {
        candidate_id: {
          type: "string",
          description: "Candidate ID whose application to transfer",
        },
        application_id: {
          type: "string",
          description: "Application ID to transfer when a candidate has multiple active applications",
        },
        candidate_name: {
          type: "string",
          description: "Candidate name (used to find ID if candidate_id not provided)",
        },
        candidate_email: {
          type: "string",
          description: "Candidate email (used to find ID if candidate_id not provided)",
        },
        job_id: {
          type: "string",
          description: "Job ID to transfer to (required)",
        },
        job_title: {
          type: "string",
          description: "Job title (used to find ID if job_id not provided)",
        },
      },
      required: [],
    },
  },
  {
    name: "add_candidate_tag",
    description:
      "Add a tag to a candidate for organization and filtering. Tags help categorize candidates (e.g., 'Python Developer', 'Senior', 'Referral'). This action requires confirmation.",
    input_schema: {
      type: "object" as const,
      properties: {
        candidate_id: {
          type: "string",
          description: "Candidate ID to tag",
        },
        candidate_name: {
          type: "string",
          description: "Candidate name (used to find ID if candidate_id not provided)",
        },
        candidate_email: {
          type: "string",
          description: "Candidate email (used to find ID if candidate_id not provided)",
        },
        tag_id: {
          type: "string",
          description: "Tag ID to add (use list_candidate_tags to see available tags)",
        },
      },
      required: [],
    },
  },

  // ===========================================================================
  // Phase A: Proactive Status Analysis (New Tools)
  // ===========================================================================
  {
    name: "analyze_candidate_status",
    description:
      "Analyze a single candidate's status with intelligent blocker detection. Returns detailed analysis including blockers, next steps, priority level, and suggested actions. Use this when asked about a candidate's status instead of just showing raw data.",
    input_schema: {
      type: "object" as const,
      properties: {
        candidate_id: {
          type: "string",
          description: "Candidate ID (will resolve from name/email if not provided)",
        },
        application_id: {
          type: "string",
          description: "Application ID to use when a candidate has multiple active applications",
        },
        candidate_name: {
          type: "string",
          description: "Candidate name (used to find ID if candidate_id not provided)",
        },
        candidate_email: {
          type: "string",
          description: "Candidate email (used to find ID if candidate_id not provided)",
        },
      },
      required: [],
    },
  },
  {
    name: "analyze_candidate_blockers",
    description:
      "Batch analyze multiple candidates to identify blockers and prioritize urgent issues. Returns candidates grouped by blocker type (no interview scheduled, awaiting feedback, ready to move, offer pending, etc.) with urgency rankings. Use this to get an intelligent overview of who's stuck and why, instead of just listing stale candidates.",
    input_schema: {
      type: "object" as const,
      properties: {
        candidate_ids: {
          type: "array",
          items: { type: "string" },
          description: "Specific candidate IDs to analyze (if not provided, analyzes all stale candidates)",
        },
      },
      required: [],
    },
  },
];

/**
 * Get tool names for a specific category
 */
export function getToolNames(category?: "read" | "write"): string[] {
  const readTools = [
    "get_pipeline_overview",
    "get_stale_candidates",
    "get_candidates_needing_decision",
    "get_recent_applications",
    "search_candidates",
    "get_candidates_for_job",
    "get_candidate_details",
    "get_candidate_resume",
    "get_open_jobs",
    "get_job_details",
    "list_interview_plans",
    "get_interview_schedules",
    "get_team_members",
    "get_candidate_scorecard",
    "list_feedback_submissions",
    "compare_candidates",
    "get_source_analytics",
    "get_interview_prep",
    "get_rejection_reasons",
    "list_candidate_tags",
    "list_candidate_sources",
    "get_hiring_team",
    "search_users",
    "get_feedback_details",
    "list_custom_fields",
    "list_locations",
    "list_departments",
    "get_application_history",
    "list_interview_events",
    "start_triage",
    // Phase 1: Offers (read operations)
    "list_offers",
    "get_pending_offers",
    "get_candidate_offer",
    // Phase 1: Interviews (read operations)
    "list_all_interviews",
    "get_upcoming_interviews",
    // Phase A: Proactive analysis (read operations)
    "analyze_candidate_status",
    "analyze_candidate_blockers",
  ];

  const writeTools = [
    "add_note",
    "move_candidate_stage",
    "schedule_interview",
    "reject_candidate",
    "set_reminder",
    // Phase 1: Offers (write operations)
    "create_offer",
    "update_offer",
    "approve_offer",
    "send_offer",
    // Phase 1: Interviews (write operations)
    "reschedule_interview",
    "cancel_interview",
    // Phase 1: Candidate creation
    "create_candidate",
    // Phase 3A: Application management
    "apply_to_job",
    "transfer_application",
    // Phase 3B: Tagging
    "add_candidate_tag",
  ];

  if (category === "read") return readTools;
  if (category === "write") return writeTools;
  return [...readTools, ...writeTools];
}

/**
 * Check if a tool is a write operation
 */
export function isWriteTool(toolName: string): boolean {
  return getToolNames("write").includes(toolName);
}
