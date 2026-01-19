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
    "get_open_jobs",
    "get_job_details",
  ];

  const writeTools = ["add_note", "move_candidate_stage"];

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
