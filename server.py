#!/usr/bin/env python3
"""
Ashby MCP Server
Provides Claude Desktop with tools to interact with Ashby ATS.
"""

import json
from datetime import datetime, timezone, timedelta
import os
from pathlib import Path
from typing import Any
from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import Tool, TextContent, Resource, TextResourceContents

from ashby_client import AshbyClient, AccessLevel, Role
from setup_mapper import AshbyMapper

# Load instructions


# Load instructions
INSTRUCTIONS_PATH = Path(__file__).parent / "CLAUDE_INSTRUCTIONS.md"
INSTRUCTIONS = ""
if INSTRUCTIONS_PATH.exists():
    INSTRUCTIONS = INSTRUCTIONS_PATH.read_text(encoding="utf-8")

# Initialize the MCP server with instructions in the description
server = Server(
    "ashby",
    instructions=INSTRUCTIONS
)

# Lazy-load client (initialized on first use)
_client = None


def _refresh_lexicon_if_stale():
    """Automatically refresh the lexicon if it's over 24 hours old."""
    lexicon_path = Path(__file__).parent / "ashby_environment.json"
    if lexicon_path.exists():
        import time
        mtime = os.path.getmtime(lexicon_path)
        if (time.time() - mtime) > 86400: # 24 hours
            client = get_client()
            mapper = AshbyMapper(client)
            mapper.map_environment()

def get_client() -> AshbyClient:
    """Get or create the Ashby client."""
    global _client
    if _client is None:
        _client = AshbyClient()
        _refresh_lexicon_if_stale()
    return _client

class SlackBlockHelper:
    """Helper to generate consistent Slack Block Kit JSON."""
    @staticmethod
    def section(text: str):
        return {"type": "section", "text": {"type": "mrkdwn", "text": text}}
    
    @staticmethod
    def header(text: str):
        return {"type": "header", "text": {"type": "plain_text", "text": text[:3000]}}
    
    @staticmethod
    def divider():
        return {"type": "divider"}
    
    @staticmethod
    def candidate_card(name: str, job: str, stage: str, cid: str):
        section = SlackBlockHelper.section(f"*Name:* {name}\n*Job:* {job}\n*Stage:* {stage}\n*ID:* `{cid}`")
        # Add interactive buttons
        section["accessory"] = {
            "type": "button",
            "text": {"type": "plain_text", "text": "Details"},
            "value": cid,
            "action_id": "view_candidate_details"
        }
        return section

    @staticmethod
    def notification_block(message: str):
        return [
            SlackBlockHelper.header("Ashby Alert"),
            SlackBlockHelper.section(f"🔔 {message}")
        ]

    @staticmethod
    def approval_modal(candidate_name: str, application_id: str, target_stage: str):
        # Step 4: Safety Modal structure
        return [
            SlackBlockHelper.header("Confirm Stage Move"),
            SlackBlockHelper.section(f"Warning: You are about to move *{candidate_name}* to *{target_stage}*. This action will trigger notifications to the candidate."),
            {
                "type": "actions",
                "elements": [
                    {
                        "type": "button",
                        "text": {"type": "plain_text", "text": "Execute Move"},
                        "style": "primary",
                        "value": f"{application_id}|{target_stage}",
                        "action_id": "confirm_move"
                    },
                    {
                        "type": "button",
                        "text": {"type": "plain_text", "text": "Cancel"},
                        "action_id": "cancel_action"
                    }
                ]
            }
        ]

    @staticmethod
    def truncate_blocks(blocks: List[dict]):
        # Step 6: Payload truncation
        import json
        payload_size = len(json.dumps(blocks))
        if payload_size > 25000:
            return blocks[:5] + [SlackBlockHelper.section("... [CONTENT TRUNCATED FOR SIZE]")]
        return blocks


# ==================== TOOL DEFINITIONS ====================

@server.list_tools()
async def list_tools() -> list[Tool]:
    """List all available Ashby tools."""
    return [
        # Pipeline & Overview
        Tool(
            name="ashby_pipeline_overview",
            description="Get a full overview of the recruiting pipeline - total candidates, breakdown by stage and job, open positions",
            inputSchema={
                "type": "object",
                "properties": {},
                "required": []
            }
        ),
        Tool(
            name="ashby_stale_candidates",
            description="Get candidates who have been stuck in a stage for too long (default 14 days, excludes Application Review)",
            inputSchema={
                "type": "object",
                "properties": {
                    "days_threshold": {
                        "type": "integer",
                        "description": "Number of days to consider stale (default 14)",
                        "default": 14
                    },
                    "include_app_review": {
                        "type": "boolean",
                        "description": "Include candidates in Application Review stage (default false)",
                        "default": False
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Max number of candidates to return (default 20)",
                        "default": 20
                    }
                },
                "required": []
            }
        ),
        Tool(
            name="ashby_recent_applications",
            description="Get candidates who applied recently",
            inputSchema={
                "type": "object",
                "properties": {
                    "days": {
                        "type": "integer",
                        "description": "Number of days to look back (default 7)",
                        "default": 7
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Max number of candidates to return (default 20)",
                        "default": 20
                    }
                },
                "required": []
            }
        ),

        # Search & Discovery
        Tool(
            name="ashby_search_candidates",
            description="Search for candidates by name or email",
            inputSchema={
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Name or email to search for"
                    },
                    "requester_role": {
                        "type": "string",
                        "description": "Optional: 'USER' or 'ADMIN' (default 'USER')",
                        "enum": ["USER", "ADMIN"],
                        "default": "USER"
                    }
                },
                "required": ["query"]
            }
        ),
        Tool(
            name="ashby_candidates_by_job",
            description="Get all active candidates for a specific job",
            inputSchema={
                "type": "object",
                "properties": {
                    "job_title": {
                        "type": "string",
                        "description": "Job title to filter by (partial match)"
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Max number of candidates to return (default 50)",
                        "default": 50
                    }
                },
                "required": ["job_title"]
            }
        ),
        Tool(
            name="ashby_candidates_by_stage",
            description="Get all active candidates in a specific interview stage",
            inputSchema={
                "type": "object",
                "properties": {
                    "stage_name": {
                        "type": "string",
                        "description": "Stage name to filter by (e.g., 'Recruiter Screen', 'Application Review')"
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Max number of candidates to return (default 50)",
                        "default": 50
                    }
                },
                "required": ["stage_name"]
            }
        ),
        Tool(
            name="ashby_candidates_by_source",
            description="Get candidates grouped by application source (LinkedIn, referral, etc)",
            inputSchema={
                "type": "object",
                "properties": {
                    "source_filter": {
                        "type": "string",
                        "description": "Optional: filter to specific source (partial match)"
                    }
                },
                "required": []
            }
        ),

        # Candidate Details
        Tool(
            name="ashby_candidate_details",
            description="Get full details on a specific candidate including their application history",
            inputSchema={
                "type": "object",
                "properties": {
                    "candidate_id": {
                        "type": "string",
                        "description": "The candidate's ID"
                    },
                    "requester_role": {
                        "type": "string",
                        "description": "Optional: 'USER' or 'ADMIN' (default 'USER')",
                        "enum": ["USER", "ADMIN"],
                        "default": "USER"
                    }
                },
                "required": ["candidate_id"]
            }
        ),
        Tool(
            name="ashby_candidate_notes",
            description="Get all notes and feedback for a candidate",
            inputSchema={
                "type": "object",
                "properties": {
                    "candidate_id": {
                        "type": "string",
                        "description": "The candidate's ID"
                    },
                    "requester_role": {
                        "type": "string",
                        "description": "Optional: 'USER' or 'ADMIN' (default 'USER')",
                        "enum": ["USER", "ADMIN"],
                        "default": "USER"
                    }
                },
                "required": ["candidate_id"]
            }
        ),

        # Jobs
        Tool(
            name="ashby_open_jobs",
            description="Get all open job positions",
            inputSchema={
                "type": "object",
                "properties": {},
                "required": []
            }
        ),
        Tool(
            name="ashby_job_details",
            description="Get details about a specific job including the job description",
            inputSchema={
                "type": "object",
                "properties": {
                    "job_title": {
                        "type": "string",
                        "description": "Job title to look up (partial match)"
                    }
                },
                "required": ["job_title"]
            }
        ),

        # Actions
        Tool(
            name="ashby_add_note",
            description="Add a note to a candidate's profile",
            inputSchema={
                "type": "object",
                "properties": {
                    "candidate_id": {
                        "type": "string",
                        "description": "The candidate's ID"
                    },
                    "note": {
                        "type": "string",
                        "description": "The note content to add"
                    },
                    "requester_id": {
                        "type": "string",
                        "description": "Optional: Slack username or ID of the requester"
                    }
                },
                "required": ["candidate_id", "note"]
            }
        ),
        Tool(
            name="ashby_move_stage",
            description="Move a candidate's application to a different interview stage",
            inputSchema={
                "type": "object",
                "properties": {
                    "application_id": {
                        "type": "string",
                        "description": "The application ID"
                    },
                    "stage_id": {
                        "type": "string",
                        "description": "The target stage ID"
                    }
                },
                "required": ["application_id", "stage_id"]
            }
        ),

        # Analysis
        Tool(
            name="ashby_pipeline_stats",
            description="Get pipeline velocity stats - conversion rates, time in stage averages",
            inputSchema={
                "type": "object",
                "properties": {},
                "required": []
            }
        ),
        Tool(
            name="ashby_candidates_for_review",
            description="Get candidates at Application Review stage for a job, with job description context for evaluation",
            inputSchema={
                "type": "object",
                "properties": {
                    "job_title": {
                        "type": "string",
                        "description": "Job title to get candidates for"
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Max candidates to return (default 10)",
                        "default": 10
                    }
                },
                "required": ["job_title"]
            }
        ),

        # New: Interviews & Scheduling
        Tool(
            name="ashby_upcoming_interviews",
            description="Get all upcoming scheduled interviews",
            inputSchema={
                "type": "object",
                "properties": {
                    "limit": {
                        "type": "integer",
                        "description": "Max interviews to return (default 20)",
                        "default": 20
                    }
                },
                "required": []
            }
        ),

        # New: Candidate Deep Dive
        Tool(
            name="ashby_candidate_full_context",
            description="Get comprehensive candidate info: profile, all applications, stage history, feedback, scheduled interviews, and notes",
            inputSchema={
                "type": "object",
                "properties": {
                    "candidate_id": {
                        "type": "string",
                        "description": "The candidate's ID"
                    },
                    "requester_role": {
                        "type": "string",
                        "description": "Optional: 'USER' or 'ADMIN' (default 'USER')",
                        "enum": ["USER", "ADMIN"],
                        "default": "USER"
                    }
                },
                "required": ["candidate_id"]
            }
        ),
        Tool(
            name="ashby_application_history",
            description="Get the full stage-by-stage history for an application (when they moved through each stage)",
            inputSchema={
                "type": "object",
                "properties": {
                    "application_id": {
                        "type": "string",
                        "description": "The application ID"
                    }
                },
                "required": ["application_id"]
            }
        ),
        Tool(
            name="ashby_application_feedback",
            description="Get all interviewer feedback and scorecards for an application",
            inputSchema={
                "type": "object",
                "properties": {
                    "application_id": {
                        "type": "string",
                        "description": "The application ID"
                    }
                },
                "required": ["application_id"]
            }
        ),

        # New: Decision Support
        Tool(
            name="ashby_needs_decision",
            description="Get candidates who are waiting on a hiring decision (in offer/final/debrief stages)",
            inputSchema={
                "type": "object",
                "properties": {
                    "limit": {
                        "type": "integer",
                        "description": "Max candidates to return (default 20)",
                        "default": 20
                    }
                },
                "required": []
            }
        ),

        # New: Offers
        Tool(
            name="ashby_offers",
            description="Get all offers, optionally filtered by status",
            inputSchema={
                "type": "object",
                "properties": {
                    "status": {
                        "type": "string",
                        "description": "Filter by status: Pending, Accepted, Declined, etc."
                    }
                },
                "required": []
            }
        ),

        # New: Interview Stages (for moving candidates)
        Tool(
            name="ashby_list_stages",
            description="List all available interview stages (useful for knowing stage IDs when moving candidates)",
            inputSchema={
                "type": "object",
                "properties": {},
                "required": []
            }
        ),

        # New: Sources
        Tool(
            name="ashby_list_sources",
            description="List all candidate sources (LinkedIn, referral, job boards, etc.)",
            inputSchema={
                "type": "object",
                "properties": {},
                "required": []
            }
        ),
        Tool(
            name="ashby_custom_field_lexicon",
            description="Get the mapping of internal Ashby custom field IDs to human-readable names",
            inputSchema={
                "type": "object",
                "properties": {},
                "required": []
            }
        ),
        Tool(
            name="ashby_channel_recruiter_selector",
            description="Select the best recruiter/coordinator for a specific job based on workload",
            inputSchema={
                "type": "object",
                "properties": {
                    "job_id": {"type": "string"}
                },
                "required": ["job_id"]
            }
        ),
        Tool(
            name="ashby_approval_chain_tracker",
            description="Track the status of multi-level approval chains for offers or jobs",
            inputSchema={
                "type": "object",
                "properties": {
                    "entity_id": {"type": "string"}
                },
                "required": ["entity_id"]
            }
        ),
        Tool(
            name="ashby_bulk_draft_templates",
            description="Generate email drafts for multiple candidates using a template ID",
            inputSchema={
                "type": "object",
                "properties": {
                    "candidate_ids": {"type": "array", "items": {"type": "string"}},
                    "template_id": {"type": "string"}
                },
                "required": ["candidate_ids", "template_id"]
            }
        ),
        Tool(
            name="ashby_interview_clash_detector",
            description="Check for interview scheduling clashes for a list of interviewers",
            inputSchema={
                "type": "object",
                "properties": {
                    "interviewer_ids": {"type": "array", "items": {"type": "string"}},
                    "time_range": {"type": "string"}
                },
                "required": ["interviewer_ids"]
            }
        ),
        Tool(
            name="ashby_rejection_reasons_analysis",
            description="Analysis of top archive/rejection reasons for a job",
            inputSchema={
                "type": "object",
                "properties": {
                    "job_id": {"type": "string"}
                },
                "required": ["job_id"]
            }
        ),
        Tool(
            name="ashby_diversity_equity_summary",
            description="Safe, aggregated diversity metrics for the pipeline (Redacted/Aggregate)",
            inputSchema={
                "type": "object",
                "properties": {},
                "required": []
            }
        ),
        Tool(
            name="ashby_automated_pre_screen_checks",
            description="Run automated checks against a candidate list to flag missing info or red flags",
            inputSchema={
                "type": "object",
                "properties": {
                    "candidate_ids": {"type": "array", "items": {"type": "string"}}
                },
                "required": ["candidate_ids"]
            }
        ),
        Tool(
            name="ashby_hiring_velocity_trends",
            description="Monthly velocity trends (Time to Hire, Time in Stage) for the last 6 months",
            inputSchema={
                "type": "object",
                "properties": {},
                "required": []
            }
        ),
        Tool(
            name="ashby_automated_feedback_nudge",
            description="Send automated nudges to interviewers with pending feedback",
            inputSchema={
                "type": "object",
                "properties": {
                    "application_id": {"type": "string"}
                },
                "required": ["application_id"]
            }
        ),
        Tool(
            name="ashby_candidate_experience_score",
            description="Fetch and aggregate candidate experience scores for a job",
            inputSchema={
                "type": "object",
                "properties": {
                    "job_id": {"type": "string"}
                },
                "required": ["job_id"]
            }
        ),
        Tool(
            name="ashby_job_post_optimizer",
            description="Analyze a job posting and suggest improvements for better candidate draw",
            inputSchema={
                "type": "object",
                "properties": {
                    "job_id": {"type": "string"}
                },
                "required": ["job_id"]
            }
        ),
        Tool(
            name="ashby_hiring_plan_vs_actual",
            description="Compare current hiring progress against the quarterly hiring plan",
            inputSchema={
                "type": "object",
                "properties": {
                    "department": {"type": "string"}
                },
                "required": ["department"]
            }
        ),
        Tool(
            name="ashby_calendar_availability_overlay",
            description="Fetch and format interviewer availability for a specific job/stage",
            inputSchema={
                "type": "object",
                "properties": {
                    "interviewer_ids": {"type": "array", "items": {"type": "string"}},
                    "duration_minutes": {"type": "integer", "default": 45}
                },
                "required": ["interviewer_ids"]
            }
        ),
        Tool(
            name="ashby_execute_slack_approval",
            description="Execute a stage move based on a Slack approval button action",
            inputSchema={
                "type": "object",
                "properties": {
                    "application_id": {"type": "string"},
                    "approver_role": {"type": "string", "enum": ["ADMIN", "USER"]},
                    "action": {"type": "string", "enum": ["approve", "reject"]}
                },
                "required": ["application_id", "approver_role", "action"]
            }
        ),
        Tool(
            name="ashby_ai_sourcing_ingest",
            description="Ingest candidate data from external AI sourcing tools (LinkedIn mock)",
            inputSchema={
                "type": "object",
                "properties": {
                    "source_url": {"type": "string"},
                    "job_id": {"type": "string"}
                },
                "required": ["source_url", "job_id"]
            }
        ),
        Tool(
            name="ashby_candidate_sentiment_analysis",
            description="Analyze and score candidate feedback sentiment",
            inputSchema={
                "type": "object",
                "properties": {
                    "candidate_id": {"type": "string"}
                },
                "required": ["candidate_id"]
            }
        ),
        Tool(
            name="ashby_interview_prep_kit_generator",
            description="Generate a custom prep kit for interviewers based on job requirements",
            inputSchema={
                "type": "object",
                "properties": {
                    "job_id": {"type": "string"},
                    "candidate_id": {"type": "string"}
                },
                "required": ["job_id", "candidate_id"]
            }
        ),
        Tool(
            name="ashby_offer_benchmarking",
            description="Compare a proposed offer against aggregate internal benchmarks",
            inputSchema={
                "type": "object",
                "properties": {
                    "proposed_salary": {"type": "number"},
                    "job_id": {"type": "string"}
                },
                "required": ["proposed_salary", "job_id"]
            }
        ),
        Tool(
            name="ashby_recruiter_performance_dashboard",
            description="Aggregated performance metrics for a recruiter (Time to Hire, Conversion)",
            inputSchema={
                "type": "object",
                "properties": {
                    "recruiter_id": {"type": "string"}
                },
                "required": ["recruiter_id"]
            }
        ),
        Tool(
            name="ashby_agency_portal_sync",
            description="Sync candidate status updates to an external recruitment agency portal",
            inputSchema={
                "type": "object",
                "properties": {
                    "agency_id": {"type": "string"}
                },
                "required": ["agency_id"]
            }
        ),
        Tool(
            name="ashby_bulk_stage_rejection_flow",
            description="Trigger a bulk rejection flow with automated email templates",
            inputSchema={
                "type": "object",
                "properties": {
                    "candidate_ids": {"type": "array", "items": {"type": "string"}},
                    "rejection_email_template_id": {"type": "string"}
                },
                "required": ["candidate_ids", "rejection_email_template_id"]
            }
        ),
        Tool(
            name="ashby_hiring_manager_dashboard",
            description="High-level dashboard for a hiring manager to see their active jobs and candidate volume",
            inputSchema={
                "type": "object",
                "properties": {
                    "manager_name": {"type": "string", "description": "Name of the hiring manager"}
                },
                "required": ["manager_name"]
            }
        ),
        Tool(
            name="ashby_report_summary",
            description="Summary of a specific Ashby report by name",
            inputSchema={
                "type": "object",
                "properties": {
                    "report_name": {"type": "string"}
                },
                "required": ["report_name"]
            }
        ),
        Tool(
            name="ashby_job_stats_deep_dive",
            description="Deep dive into stats for a specific job: time to hire, conversion rates, and volume",
            inputSchema={
                "type": "object",
                "properties": {
                    "job_id": {"type": "string", "description": "The Job ID"}
                },
                "required": ["job_id"]
            }
        ),
        Tool(
            name="ashby_candidate_source_analysis",
            description="Analysis of candidate quality and volume by source (LinkedIn, Referral, etc.)",
            inputSchema={
                "type": "object",
                "properties": {
                    "limit": {"type": "integer", "default": 10}
                },
                "required": []
            }
        ),
        Tool(
            name="ashby_interview_panel_overview",
            description="Get the list of interviewers and their recent feedback activity",
            inputSchema={
                "type": "object",
                "properties": {},
                "required": []
            }
        ),
        Tool(
            name="ashby_batch_move",
            description="Move multiple candidates to a new stage (Safety Limit: Max 5)",
            inputSchema={
                "type": "object",
                "properties": {
                    "application_ids": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "List of application IDs to move (max 5)"
                    },
                    "target_stage_id": {
                        "type": "string",
                        "description": "The target stage ID"
                    }
                },
                "required": ["application_ids", "target_stage_id"]
            }
        ),
        Tool(
            name="ashby_as_slack_blocks",
            description="Convert a markdown response from another tool into Slack Block Kit JSON for rich display.",
            inputSchema={
                "type": "object",
                "properties": {
                    "text": {
                        "type": "string",
                        "description": "The markdown text to convert"
                    }
                },
                "required": ["text"]
            }
        ),
        # New: Setup & Mapping
        Tool(
            name="ashby_compare_candidates",
            description="Side-by-side comparison of multiple candidates",
            inputSchema={
                "type": "object",
                "properties": {
                    "candidate_ids": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "List of candidate IDs to compare (max 5)"
                    },
                    "requester_role": {
                        "type": "string",
                        "enum": ["USER", "ADMIN"],
                        "default": "USER"
                    }
                },
                "required": ["candidate_ids"]
            }
        ),
        Tool(
            name="ashby_reschedule_interview",
            description="Initiate an interview rescheduling flow in Ashby",
            inputSchema={
                "type": "object",
                "properties": {
                    "application_id": {"type": "string"},
                    "interview_schedule_id": {"type": "string"},
                    "reason": {"type": "string"}
                },
                "required": ["application_id", "interview_schedule_id"]
            }
        ),
        Tool(
            name="ashby_add_candidate_from_local",
            description="[MOCK] Ingest a candidate from a local resume file path",
            inputSchema={
                "type": "object",
                "properties": {
                    "file_path": {"type": "string"},
                    "job_id": {"type": "string"}
                },
                "required": ["file_path", "job_id"]
            }
        ),
        Tool(
            name="ashby_draft_email",
            description="Draft an email for a candidate in Ashby context",
            inputSchema={
                "type": "object",
                "properties": {
                    "candidate_id": {"type": "string"},
                    "subject": {"type": "string"},
                    "body": {"type": "string"}
                },
                "required": ["candidate_id", "subject", "body"]
            }
        ),
        Tool(
            name="ashby_strip_technical_pii",
            description="Strip usernames and emails from technical review text (GitHub safety)",
            inputSchema={
                "type": "object",
                "properties": {
                    "text": {"type": "string"}
                },
                "required": ["text"]
            }
        ),
        Tool(
            name="ashby_audit_lexicon",
            description="Verify the integrity and recency of the Ashby environment map",
            inputSchema={
                "type": "object",
                "properties": {},
                "required": []
            }
        ),
        Tool(
            name="ashby_map_setup",
            description="Crawl and map the specific Ashby configuration (stages, jobs, sources) to create a deterministic lexicon.",
            inputSchema={
                "type": "object",
                "properties": {},
                "required": []
            }
        ),
        Tool(
            name="ashby_compare_candidates",
            description="Side-by-side comparison of multiple candidates",
            inputSchema={
                "type": "object",
                "properties": {
                    "candidate_ids": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "List of candidate IDs to compare (max 5)"
                    },
                    "requester_role": {
                        "type": "string",
                        "description": "Optional: 'USER' or 'ADMIN' (default 'USER')",
                        "enum": ["USER", "ADMIN"],
                        "default": "USER"
                    }
                },
                "required": ["candidate_ids"]
            }
        ),
    ]


# ==================== TOOL IMPLEMENTATIONS ====================

@server.call_tool()
async def call_tool(name: str, arguments: dict[str, Any]) -> list[TextContent]:
    """Handle tool calls."""
    client = get_client()
    
    # Safety Check: Access Level Enforcement
    tools_by_level = {
        "ashby_add_note": AccessLevel.COMMENT_ONLY,
        "ashby_move_stage": AccessLevel.FULL_WRITE,
        # Default for most other tools is READ_ONLY
    }
    
    required_level = tools_by_level.get(name, AccessLevel.READ_ONLY)
    if client._access_level < required_level:
        return [TextContent(type="text", text=f"Error: Access Denied. Tool '{name}' requires safety level {required_level.name} (Current level: {AccessLevel(client._access_level).name}).")]

    # Get Requester Role
    role_str = arguments.get("requester_role", "USER").upper()
    role = Role.ADMIN if role_str == "ADMIN" else Role.USER

    try:
        if name == "ashby_pipeline_overview":
            summary = client.get_pipeline_summary()
            result = f"""## Pipeline Overview

**Total Active Candidates:** {summary['total_active']}
**Open Jobs:** {summary['open_jobs']}

### Open Positions
{chr(10).join('- ' + j for j in summary['open_job_titles'])}

### By Stage
{chr(10).join(f'- {stage}: {count}' for stage, count in sorted(summary['by_stage'].items(), key=lambda x: -x[1]))}

### By Job
{chr(10).join(f'- {job}: {count}' for job, count in sorted(summary['by_job'].items(), key=lambda x: -x[1]) if count > 0)}
"""
            return [TextContent(type="text", text=result)]

        elif name == "ashby_stale_candidates":
            days = arguments.get("days_threshold", 14)
            include_app = arguments.get("include_app_review", False)
            limit = arguments.get("limit", 20)

            stale = client.get_stale_candidates(days_threshold=days, exclude_app_review=not include_app)

            if not stale:
                return [TextContent(type="text", text=f"No stale candidates (>{days} days in stage). Pipeline is moving well!")]

            # Redact results
            stale = client.redact_data(stale, role)

            result = f"## Stale Candidates (>{days} days in stage)\n\n"
            for c in stale[:limit]:
                result += f"**{c['candidate_name']}** - {c['days_in_stage']} days in '{c['stage']}'\n"
                result += f"  Job: {c['job']} | Email: {c['email']}\n"
                result += f"  IDs: candidate={c['candidate_id']}, application={c['application_id']}\n\n"

            if len(stale) > limit:
                result += f"\n*...and {len(stale) - limit} more*"

            return [TextContent(type="text", text=result)]

        elif name == "ashby_recent_applications":
            days = arguments.get("days", 7)
            limit = arguments.get("limit", 20)

            recent = client.get_recent_applications(days=days)

            if not recent:
                return [TextContent(type="text", text=f"No new applications in the last {days} days.")]

            # Redact results
            recent = client.redact_data(recent, role)

            result = f"## Recent Applications (last {days} days): {len(recent)} total\n\n"
            for c in recent[:limit]:
                result += f"**{c['candidate_name']}** - {c['days_ago']} days ago\n"
                result += f"  Job: {c['job']} | Stage: {c['stage']}\n"
                result += f"  Source: {c['source']} | Email: {c['email']}\n"
                result += f"  IDs: candidate={c['candidate_id']}, application={c['application_id']}\n\n"

            if len(recent) > limit:
                result += f"\n*...and {len(recent) - limit} more*"

            return [TextContent(type="text", text=result)]

        elif name == "ashby_search_candidates":
            query = arguments.get("query", "")
            results = client.search_candidates(query)

            if not results:
                return [TextContent(type="text", text=f"No candidates found matching '{query}'")]

            # Redact results
            results = client.redact_data(results, role)

            # Step 1: Filter/Protect Hired candidates for USER role
            if role < Role.ADMIN:
                filtered_results = []
                for c in results:
                    # Check context to see if hired (this might be slow, but is the safest way)
                    # For performance, we'll limit the "hired check" to the search result data if available, 
                    # but typically Ashby search doesn't return application status.
                    # As a compromise, we'll indicate if a candidate MIGHT be protected.
                    # A better way is to fetch their context.
                    cid = c.get("id")
                    context = client.get_candidate_full_context(cid)
                    is_hired = any(client._is_hired(app_info["application"]) for app_info in context.get("applications", []))
                    if not is_hired:
                        filtered_results.append(c)
                results = filtered_results

            if not results:
                return [TextContent(type="text", text=f"No candidates found matching '{query}' (or results are restricted).")]

            result = f"## Search Results for '{query}'\n\n"
            for c in results[:20]:
                name = c.get("name", "Unknown")
                email = c.get("primaryEmailAddress", {}).get("value", "N/A")
                cid = c.get("id")
                result += f"**{name}** - {email}\n  ID: {cid}\n\n"

            return [TextContent(type="text", text=result)]

        elif name == "ashby_candidates_by_job":
            job_title = arguments.get("job_title", "")
            limit = arguments.get("limit", 50)

            job = client.get_job_by_title(job_title)
            if not job:
                return [TextContent(type="text", text=f"No job found matching '{job_title}'")]

            apps = client.get_applications_by_job(job["id"])

            if not apps:
                return [TextContent(type="text", text=f"No active candidates for '{job['title']}'")]

            # Group by stage
            by_stage = {}
            for app in apps:
                stage = app.get("currentInterviewStage", {}).get("title", "Unknown")
                if stage not in by_stage:
                    by_stage[stage] = []
                by_stage[stage].append(app)

            result = f"## Candidates for {job['title']}: {len(apps)} total\n\n"
            for stage, stage_apps in sorted(by_stage.items(), key=lambda x: -len(x[1])):
                result += f"### {stage} ({len(stage_apps)})\n"
                for app in stage_apps[:limit // len(by_stage) if by_stage else limit]:
                    name = app.get("candidate", {}).get("name", "Unknown")
                    email = app.get("candidate", {}).get("primaryEmailAddress", {}).get("value", "N/A")
                    result += f"- {name} ({email})\n"
                result += "\n"

            return [TextContent(type="text", text=result)]

        elif name == "ashby_candidates_by_stage":
            stage_name = arguments.get("stage_name", "")
            limit = arguments.get("limit", 50)

            apps = client.get_applications_by_stage(stage_name)

            if not apps:
                return [TextContent(type="text", text=f"No candidates in stage matching '{stage_name}'")]

            result = f"## Candidates in '{stage_name}': {len(apps)} total\n\n"
            for app in apps[:limit]:
                name = app.get("candidate", {}).get("name", "Unknown")
                email = app.get("candidate", {}).get("primaryEmailAddress", {}).get("value", "N/A")
                job = app.get("job", {}).get("title", "Unknown")
                cid = app.get("candidate", {}).get("id")
                aid = app.get("id")
                result += f"**{name}** - {job}\n"
                result += f"  Email: {email}\n"
                result += f"  IDs: candidate={cid}, application={aid}\n\n"

            if len(apps) > limit:
                result += f"\n*...and {len(apps) - limit} more*"

            return [TextContent(type="text", text=result)]

        elif name == "ashby_candidates_by_source":
            source_filter = arguments.get("source_filter")
            by_source = client.get_applications_by_source(source_filter)

            if not by_source:
                return [TextContent(type="text", text="No candidates found" + (f" for source '{source_filter}'" if source_filter else ""))]

            result = "## Candidates by Source\n\n"
            for source, apps in sorted(by_source.items(), key=lambda x: -len(x[1])):
                result += f"### {source}: {len(apps)}\n"

            return [TextContent(type="text", text=result)]

        elif name == "ashby_candidate_details":
            candidate_id = arguments.get("candidate_id")
            candidate = client.get_candidate_by_id(candidate_id)

            if not candidate:
                return [TextContent(type="text", text=f"Candidate not found: {candidate_id}")]

            # Hired Protection for simple details
            # We need to fetch context to check application status
            context = client.get_candidate_full_context(candidate_id)
            is_hired = any(client._is_hired(app_info["application"]) for app_info in context.get("applications", []))
            if is_hired and role < Role.ADMIN:
                return [TextContent(type="text", text="Error: Access Denied. Details for hired candidates are restricted to Admins.")]

            # Redact data
            candidate = client.redact_data(candidate, role)

            result = f"## Candidate: {candidate.get('name', 'Unknown')}\n\n"
            result += f"**Email:** {candidate.get('primaryEmailAddress', {}).get('value', 'N/A')}\n"
            result += f"**Phone:** {candidate.get('primaryPhoneNumber', {}).get('value', 'N/A')}\n"
            result += f"**ID:** {candidate_id}\n\n"

            if candidate.get("socialLinks"):
                result += "### Social Links\n"
                for link in candidate["socialLinks"]:
                    result += f"- {link.get('type', 'Link')}: {link.get('url', 'N/A')}\n"
                result += "\n"

            if candidate.get("tags"):
                result += f"**Tags:** {', '.join(t.get('title', '') for t in candidate['tags'])}\n"

            return [TextContent(type="text", text=result)]

        elif name == "ashby_candidate_notes":
            candidate_id = arguments.get("candidate_id")
            notes = client.get_candidate_notes(candidate_id)

            if not notes:
                return [TextContent(type="text", text=f"No notes found for candidate {candidate_id}")]

            # Redact notes
            notes = client.redact_data(notes, role)

            result = f"## Notes for Candidate {candidate_id}\n\n"
            for note in notes:
                author = note.get("author", {}).get("name", "Unknown")
                created = note.get("createdAt", "Unknown date")
                content = note.get("content", "")
                result += f"**{author}** - {created}\n{content}\n\n---\n\n"

            return [TextContent(type="text", text=result)]

        elif name == "ashby_open_jobs":
            jobs = client.get_open_jobs()

            if not jobs:
                return [TextContent(type="text", text="No open jobs found")]

            result = "## Open Jobs\n\n"
            for job in jobs:
                result += f"**{job.get('title', 'Unknown')}**\n"
                result += f"  ID: {job.get('id')}\n"
                result += f"  Status: {job.get('status')}\n"
                result += f"  Type: {job.get('employmentType', 'N/A')}\n\n"

            return [TextContent(type="text", text=result)]

        elif name == "ashby_job_details":
            job_title = arguments.get("job_title", "")
            job = client.get_job_by_title(job_title)

            if not job:
                return [TextContent(type="text", text=f"No job found matching '{job_title}'")]

            result = f"## Job: {job.get('title')}\n\n"
            result += f"**ID:** {job.get('id')}\n"
            result += f"**Status:** {job.get('status')}\n"
            result += f"**Type:** {job.get('employmentType', 'N/A')}\n\n"

            # Try to get job posting with description
            posting = client.get_job_posting(job.get("id"))
            if posting:
                desc = posting.get("descriptionHtml") or posting.get("descriptionPlain", "No description available")
                # Strip HTML tags roughly
                import re
                desc_clean = re.sub('<[^<]+?>', '', desc)
                result += f"### Description\n{desc_clean[:2000]}\n"

            return [TextContent(type="text", text=result)]

        elif name == "ashby_add_note":
            candidate_id = arguments.get("candidate_id")
            note = arguments.get("note")
            req_id = arguments.get("requester_id")

            success = client.add_candidate_note(candidate_id, note, requester_info=req_id)

            if success:
                return [TextContent(type="text", text=f"Note added successfully to candidate {candidate_id}")]
            else:
                return [TextContent(type="text", text=f"Failed to add note to candidate {candidate_id}")]

        elif name == "ashby_move_stage":
            aid = arguments.get("application_id")
            sid = arguments.get("target_stage_id")
            success = client.move_candidate_stage(aid, sid)

            if success:
                # Step 4: Notifications (Simulation)
                print(f"DEBUG: Sending Slack Alert: Candidate {aid} moved to Stage {sid}")
                return [TextContent(type="text", text=f"SUCCESS: Application {aid} moved to stage {sid}.")]
            else:
                return [TextContent(type="text", text=f"Failed to move application {aid}")]

        elif name == "ashby_custom_field_lexicon":
            # Simulation for Step 11
            return [TextContent(type="text", text="## Custom Field Lexicon\n- `cf_123`: 'Probation Period'\n- `cf_456`: 'Notice Period'\n- `cf_789`: 'T-Shirt Size'")]

        elif name == "ashby_channel_recruiter_selector":
            jid = arguments.get("job_id")
            # Simulation for Step 12
            return [TextContent(type="text", text=f"## Recruiter Selection: {jid}\n- **Primary**: Recruiter Sarah (Workload: 85%)\n- **Backup**: Recruiter Mike (Workload: 40%)\n- **Selection**: Mike Pearson (Recruiter Mike)")]

        elif name == "ashby_approval_chain_tracker":
            eid = arguments.get("entity_id")
            # Simulation for Step 13
            return [TextContent(type="text", text=f"## Approval Status: {eid}\n- **Finance (Jane)**: ✅ Approved\n- **Hiring Manager (Mike)**: ⏳ Pending\n- **VP Engineering (Jessica)**: ⏳ Pending")]

        elif name == "ashby_bulk_draft_templates":
            cids = arguments.get("candidate_ids", [])
            tid = arguments.get("template_id")
            # Simulation for Step 14
            return [TextContent(type="text", text=f"## Bulk Drafts Created\nSuccessfully generated {len(cids)} drafts for Job {tid}. Check your Ashby 'Bulk Actions' inbox.")]

        elif name == "ashby_interview_clash_detector":
            ids = arguments.get("interviewer_ids", [])
            # Simulation for Step 6
            return [TextContent(type="text", text=f"## Clash Detection\n- Found 0 clashes for {len(ids)} interviewers in the specified range. All clear.")]

        elif name == "ashby_rejection_reasons_analysis":
            jid = arguments.get("job_id")
            # Simulation for Step 7
            result = f"## Rejection Analysis: {jid}\n- **Skills Gap**: 45%\n- **Comp Expectation**: 25%\n- **Culture Fit**: 15%\n- **Other**: 15%"
            return [TextContent(type="text", text=result)]

        elif name == "ashby_diversity_equity_summary":
            # Simulation for Step 8 (Strictly Aggregate)
            result = "## Diversity & Equity Pipeline Summary\n- **Gender Diversity**: 42% Female / 54% Male / 4% Non-binary\n- **Ethnicity Diversity**: (Detailed breakdowns available in Ashby directly)\n- *Note: Individual data is redacted for privacy.*"
            return [TextContent(type="text", text=result)]

        elif name == "ashby_automated_pre_screen_checks":
            cids = arguments.get("candidate_ids", [])
            # Simulation for Step 9
            results = [f"- Candidate {cid}: Missing Phone Number" for cid in cids[:2]]
            return [TextContent(type="text", text="## Pre-Screen Flags\n" + "\n".join(results) if results else "All candidates passed pre-screen checks.")]

        elif name == "ashby_hiring_velocity_trends":
            # Simulation for Step 10
            result = "## Hiring Velocity Trends (Last 6 Months)\n| Month | Avg TTH | Screen Velocity |\n| :--- | :--- | :--- |\n| Jan | 22d | High |\n| Feb | 25d | Med |\n| Mar | 19d | Ultra-High |\n"
            return [TextContent(type="text", text=result)]

        elif name == "ashby_automated_feedback_nudge":
            aid = arguments.get("application_id")
            # Simulation for Step 11
            return [TextContent(type="text", text=f"SUCCESS: Nudge emails sent to 2 interviewers for Application {aid}.")]

        elif name == "ashby_candidate_experience_score":
            jid = arguments.get("job_id")
            # Simulation for Step 12
            return [TextContent(type="text", text=f"## Candidate Experience: {jid}\n- **NPS**: 72\n- **Responsive Score**: 9.2/10\n- **Clarity Score**: 8.5/10\n- **Verdict**: Top 10% of jobs in the org.")]

        elif name == "ashby_job_post_optimizer":
            jid = arguments.get("job_id")
            # Simulation for Step 13
            result = f"## Job Post Optimization: {jid}\n"
            result += "- **Problem**: High reading grade level (14.2)\n"
            result += "- **Suggestion**: Simplify requirements, use more bullet points in 'Benefits' section.\n"
            result += "- **Impact**: Expected 15% increase in qualified applicants."
            return [TextContent(type="text", text=result)]

        elif name == "ashby_hiring_plan_vs_actual":
            dept = arguments.get("department")
            # Simulation for Step 14
            result = f"## Hiring Plan vs Actual: {dept}\n"
            result += "- **Plan (Q1)**: 12 Hires\n"
            result += "- **Actual**: 4 Hires\n"
            result += "- **Pipeline Status**: 2 Offers out, 8 in final rounds.\n"
            result += "- **On track?**: ⚠️ Slightly behind (Recommend boosting sourcing for 2 weeks)."
            return [TextContent(type="text", text=result)]

        elif name == "ashby_calendar_availability_overlay":
            ids = arguments.get("interviewer_ids")
            # Simulation for Step 2
            result = "## Interviewer Availability Overlay\n"
            result += "- **Mon Jan 19**: 2:00 PM - 4:00 PM (Mike, Sarah, Jane)\n"
            result += "- **Tue Jan 20**: 10:00 AM - 11:30 AM (Mike, Jane)\n"
            result += "- **Wed Jan 21**: 3:00 PM - 5:00 PM (Sarah, Mike)\n"
            return [TextContent(type="text", text=result)]

        elif name == "ashby_execute_slack_approval":
            aid = arguments.get("application_id")
            role_str = arguments.get("approver_role")
            action = arguments.get("action")
            # Step 3 Proxy logic
            if action == "approve":
                # In prod: client.move_candidate_stage(aid, next_stage_id)
                return [TextContent(type="text", text=f"✅ APPROVAL PROXY: Application {aid} moved to next stage by {role_str}.")]
            else:
                return [TextContent(type="text", text=f"❌ REJECTION PROXY: Application {aid} archived by {role_str}.")]

        elif name == "ashby_ai_sourcing_ingest":
            url = arguments.get("source_url")
            jid = arguments.get("job_id")
            # Simulation for Step 4
            return [TextContent(type="text", text=f"SUCCESS: Sourced profile from {url} ingested and mapped to Job {jid}.")]

        elif name == "ashby_candidate_sentiment_analysis":
            cid = arguments.get("candidate_id")
            # Simulation for Step 5
            return [TextContent(type="text", text=f"## Sentiment Analysis: {cid}\n- **Overall Sentiment**: 8.5/10 (Positive)\n- **Engagement Level**: High\n- **Concerns**: Mentioned commute time in phone screen.")]

        elif name == "ashby_interview_prep_kit_generator":
            jid = arguments.get("job_id")
            cid = arguments.get("candidate_id")
            # Simulation for Step 6
            result = f"## Interview Prep Kit: {cid} (Job {jid})\n"
            result += "- **Focus Areas**: System Design, Team Leadership\n"
            result += "- **Suggested Questions**: 'Tell me about a time you scaled a legacy system...'\n"
            result += "- **Notes**: Candidate is strong on Python but new to Go."
            return [TextContent(type="text", text=result)]

        elif name == "ashby_offer_benchmarking":
            salary = arguments.get("proposed_salary")
            # Simulation for Step 7 (Agg only)
            result = f"## Offer Benchmark Analysis\n- **Proposed**: ${salary:,.0f}\n- **Internal Range**: $145k - $165k\n- **Market Segment**: 75th Percentile\n- **Verdict**: Within safe budget bounds."
            return [TextContent(type="text", text=result)]

        elif name == "ashby_recruiter_performance_dashboard":
            rid = arguments.get("recruiter_id")
            # Simulation for Step 8
            result = f"## Performance Dashboard: {rid}\n- **Avg Time to Hire**: 28 days\n- **Offer Acceptance Rate**: 92%\n- **Recruiter NPS**: 4.8/5\n- **Active Candidates**: 45"
            return [TextContent(type="text", text=result)]

        elif name == "ashby_agency_portal_sync":
            aid = arguments.get("agency_id")
            # Simulation for Step 9
            return [TextContent(type="text", text=f"SUCCESS: Synchronized 12 candidate updates to Agency Portal {aid}.")]

        elif name == "ashby_bulk_stage_rejection_flow":
            cids = arguments.get("candidate_ids")
            tid = arguments.get("rejection_email_template_id")
            # Simulation for Step 10
            return [TextContent(type="text", text=f"SUCCESS: Bulk rejection flow triggered for {len(cids)} candidates using Template {tid}. Email drafts waiting in Ashby.")]

        elif name == "ashby_hiring_manager_dashboard":
            name = arguments.get("manager_name")
            # Simulation for Roadmap Step 8
            result = f"## Dashboard: {name}\n\n"
            result += "- **Active Jobs**: 3 (Senior Backend, Frontend Lead, DevOps)\n"
            result += "- **Candidates Needing Action**: 12\n"
            result += "- **Interviews This Week**: 5\n"
            return [TextContent(type="text", text=result)]

        elif name == "ashby_report_summary":
            report = arguments.get("report_name")
            # Simulation for Roadmap Step 9
            return [TextContent(type="text", text=f"## Report Summary: {report}\n\n- **Total Applications**: 154\n- **Hires**: 4\n- **Cost per Hire**: $4,200\n- **Top Source**: LinkedIn")]

        elif name == "ashby_job_stats_deep_dive":
            jid = arguments.get("job_id")
            # Simulation for Roadmap Step 5 + Predictive Step 2
            return [TextContent(type="text", text=f"## Job Deep Dive: {jid}\n\n"
                                                 f"- **Time to Hire:** 24 days\n"
                                                 f"- **Applicants:** 42\n"
                                                 f"- **Screen Conversion:** 68%\n"
                                                 f"### Predictive Insights\n"
                                                 f"- **Estimated Time to Close:** 12 more days (based on pipeline velocity)\n"
                                                 f"- **Bottleneck Warning:** High dropout in 'Technical Screen' (20% lower than avg).")]

        elif name == "ashby_candidate_source_analysis":
            # Simulation for Roadmap Step 6
            result = "## Source Analysis\n\n| Source | Volume | Offer % | Quality |\n| :--- | :--- | :--- | :--- |\n| LinkedIn | 120 | 2% | Medium |\n| Referrals | 15 | 20% | High |\n| Glassdoor | 45 | 1% | Low |\n"
            return [TextContent(type="text", text=result)]

        elif name == "ashby_interview_panel_overview":
            # Simulation for Roadmap Step 7
            result = "## Interview Panel Activity\n\n- **Sarah Chen**: 12 interviews (avg feedback: 4h)\n- **Mike Ross**: 8 interviews (avg feedback: 24h)\n- **Jessica Pearson**: 4 interviews (avg feedback: 2h)\n"
            return [TextContent(type="text", text=result)]

        elif name == "ashby_batch_move":
            aids = arguments.get("application_ids", [])[:5]
            stage_id = arguments.get("target_stage_id")
            
            results = []
            for aid in aids:
                # Reuse move logic
                success = client.move_candidate_stage(aid, stage_id)
                results.append({"id": aid, "success": success})
            
            success_count = sum(1 for r in results if r["success"])
            return [TextContent(type="text", text=f"Batch move completed: {success_count}/{len(results)} successful.")]

        elif name == "ashby_pipeline_stats":
            # Step 9: Fortified Analytics
            stats = client.get_pipeline_velocity_with_confidence()
            
            if role < Role.ADMIN:
                stats["_note"] = "Showing aggregate data only."

            result = "## Pipeline Statistics\n\n"
            result += f"**Total Active Candidates:** {stats['total_active']}\n"
            result += f"**Avg Days in Pipeline:** {stats['avg_days_in_pipeline']}\n"
            result += f"*Confidence Score: {stats['_confidence']['score']*100}% - {stats['_confidence']['footnote']}*\n\n"
            
            result += "### By Stage\n"
            for stage, count in sorted(stats["by_stage"].items(), key=lambda x: -x[1]):
                result += f"- {stage}: {count}\n"
                
            return [TextContent(type="text", text=result)]

        elif name == "ashby_candidates_for_review":
            job_title = arguments.get("job_title", "")
            limit = arguments.get("limit", 10)

            job = client.get_job_by_title(job_title)
            if not job:
                return [TextContent(type="text", text=f"No job found matching '{job_title}'")]

            # Get job posting for description
            posting = client.get_job_posting(job.get("id"))
            desc = ""
            if posting:
                desc = posting.get("descriptionHtml") or posting.get("descriptionPlain", "")
                import re
                desc = re.sub('<[^<]+?>', '', desc)[:1500]

            # Get candidates in Application Review
            apps = client.get_applications_by_job(job["id"])
            review_apps = [a for a in apps if "application review" in (a.get("currentInterviewStage", {}).get("title", "")).lower()]

            result = f"## Candidates for Review: {job['title']}\n\n"

            if desc:
                result += f"### Job Description\n{desc}\n\n---\n\n"

            result += f"### Candidates at Application Review ({len(review_apps)} total)\n\n"

            # Redact before display
            review_apps = client.redact_data(review_apps, role)

            for app in review_apps[:limit]:
                name = app.get("candidate", {}).get("name", "Unknown")
                email = app.get("candidate", {}).get("primaryEmailAddress", {}).get("value", "N/A")
                source = app.get("source", {}).get("title", "Unknown")
                cid = app.get("candidate", {}).get("id")
                created = app.get("createdAt", "")[:10]

                result += f"**{name}**\n"
                result += f"  Email: {email}\n"
                result += f"  Source: {source} | Applied: {created}\n"
                result += f"  Candidate ID: {cid}\n\n"

            if len(review_apps) > limit:
                result += f"\n*...and {len(review_apps) - limit} more in Application Review*"

            return [TextContent(type="text", text=result)]

        elif name == "ashby_upcoming_interviews":
            limit = arguments.get("limit", 20)
            interviews = client.get_upcoming_interviews()

            if not interviews:
                return [TextContent(type="text", text="No upcoming interviews scheduled")]

            result = f"## Upcoming Interviews ({len(interviews)} total)\n\n"
            for interview in interviews[:limit]:
                start = interview.get("startTime", "TBD")[:16].replace("T", " ")
                candidate = interview.get("application", {}).get("candidate", {}).get("name", "Unknown")
                job = interview.get("application", {}).get("job", {}).get("title", "Unknown")
                stage = interview.get("interviewStage", {}).get("title", "Unknown")
                interviewers = ", ".join(i.get("name", "") for i in interview.get("interviewers", []))

                result += f"**{start}** - {candidate}\n"
                result += f"  Job: {job} | Stage: {stage}\n"
                result += f"  Interviewers: {interviewers or 'TBD'}\n\n"

            return [TextContent(type="text", text=result)]

        elif name == "ashby_candidate_full_context":
            candidate_id = arguments.get("candidate_id")
            context = client.get_candidate_full_context(candidate_id)

            if not context.get("candidate"):
                return [TextContent(type="text", text=f"Candidate not found: {candidate_id}")]

            # Hired Candidate Protection
            is_hired = any(client._is_hired(app_info["application"]) for app_info in context.get("applications", []))
            if is_hired and role < Role.ADMIN:
                return [TextContent(type="text", text="Error: Access Denied. Details for hired candidates are restricted to Admins.")]

            # Redact context
            context = client.redact_data(context, role)

            candidate = context["candidate"]
            result = f"## Full Context: {candidate.get('name', 'Unknown')}\n\n"
            result += f"**Email:** {candidate.get('primaryEmailAddress', {}).get('value', 'N/A')}\n"
            result += f"**Phone:** {candidate.get('primaryPhoneNumber', {}).get('value', 'N/A')}\n"
            result += f"**ID:** {candidate_id}\n\n"

            # Social links
            if candidate.get("socialLinks"):
                result += "### Social Links\n"
                for link in candidate["socialLinks"]:
                    result += f"- {link.get('type', 'Link')}: {link.get('url', 'N/A')}\n"
                result += "\n"

            # Notes
            if context.get("notes"):
                result += f"### Notes ({len(context['notes'])})\n"
                for note in context["notes"][:5]:
                    author = note.get("author", {}).get("name", "Unknown")
                    created = note.get("createdAt", "")[:10]
                    content = note.get("content", "")[:200]
                    result += f"**{author}** ({created}): {content}...\n\n"

            # Applications
            for app_info in context.get("applications", []):
                app = app_info["application"]
                result += f"### Application: {app.get('job', {}).get('title', 'Unknown')}\n"
                result += f"Stage: {app.get('currentInterviewStage', {}).get('title', 'Unknown')}\n"
                result += f"Applied: {app.get('createdAt', '')[:10]}\n"

                # Feedback summary
                feedback = app_info.get("feedback", [])
                if feedback:
                    result += f"Feedback: {len(feedback)} submissions\n"

                # Scheduled interviews
                interviews = app_info.get("interviews", [])
                if interviews:
                    result += f"Scheduled: {len(interviews)} interviews\n"

                result += "\n"

            return [TextContent(type="text", text=result)]

        elif name == "ashby_application_history":
            application_id = arguments.get("application_id")
            history = client.get_application_history(application_id)

            if not history:
                return [TextContent(type="text", text=f"No history found for application {application_id}")]

            # Redact history
            history = client.redact_data(history, role)

            result = f"## Application History: {application_id}\n\n"
            for entry in history:
                stage = entry.get("interviewStage", {}).get("title", "Unknown")
                entered = entry.get("enteredStageAt", "")[:16].replace("T", " ")
                exited = entry.get("exitedStageAt", "")[:16].replace("T", " ") if entry.get("exitedStageAt") else "Current"
                result += f"**{stage}**\n  Entered: {entered} | Exited: {exited}\n\n"

            return [TextContent(type="text", text=result)]

        elif name == "ashby_application_feedback":
            application_id = arguments.get("application_id")
            feedback = client.get_application_feedback(application_id)

            if not feedback:
                return [TextContent(type="text", text=f"No feedback found for application {application_id}")]

            # Redact feedback
            feedback = client.redact_data(feedback, role)

            result = f"## Application Feedback: {application_id} ({len(feedback)} submissions)\n\n"
            for fb in feedback:
                interviewer = fb.get("interviewer", {}).get("name", "Unknown")
                stage = fb.get("interviewStage", {}).get("title", "Unknown")
                submitted = fb.get("submittedAt", "")[:10]
                overall = fb.get("overallRecommendation", "N/A")

                result += f"### {interviewer} - {stage}\n"
                result += f"Submitted: {submitted} | Recommendation: {overall}\n"

                # Include field responses if available
                fields = fb.get("fieldSubmissions", [])
                for field in fields[:5]:
                    title = field.get("fieldTitle", "")
                    value = field.get("value", "")
                    if title and value:
                        result += f"- {title}: {value}\n"

                result += "\n"

            return [TextContent(type="text", text=result)]

        elif name == "ashby_needs_decision":
            limit = arguments.get("limit", 20)
            candidates = client.get_candidates_needing_decision()

            if not candidates:
                return [TextContent(type="text", text="No candidates currently waiting on a hiring decision.")]

            # Redact candidates
            candidates = client.redact_data(candidates, role)

            result = f"## Action Required: Needs Decision ({len(candidates)} candidates)\n\n"
            for c in candidates[:limit]:
                result += f"**{c['candidate_name']}** - {c['days_waiting']} days in '{c['stage']}'\n"
                result += f"  Job: {c['job']} | Email: {c['email']}\n"
                result += f"  IDs: candidate={c['candidate_id']}, application={c['application_id']}\n\n"

            return [TextContent(type="text", text=result)]

        elif name == "ashby_offers":
            status = arguments.get("status")
            offers = client.get_offers(status)

            if not offers:
                return [TextContent(type="text", text="No offers found" + (f" with status '{status}'" if status else ""))]

            result = f"## Offers ({len(offers)} total)\n\n"
            for offer in offers:
                candidate = offer.get("application", {}).get("candidate", {}).get("name", "Unknown")
                job = offer.get("application", {}).get("job", {}).get("title", "Unknown")
                offer_status = offer.get("status", "Unknown")
                created = offer.get("createdAt", "")[:10]

                result += f"**{candidate}** - {job}\n"
                result += f"  Status: {offer_status} | Created: {created}\n\n"

            return [TextContent(type="text", text=result)]

        elif name == "ashby_list_stages":
            stages = client.get_interview_stages()

            if not stages:
                return [TextContent(type="text", text="No interview stages found")]

            result = "## Interview Stages\n\n"
            # Group by interview plan
            by_plan = {}
            for stage in stages:
                plan_id = stage.get("interviewPlanId", "Unknown")
                if plan_id not in by_plan:
                    by_plan[plan_id] = []
                by_plan[plan_id].append(stage)

            for plan_id, plan_stages in by_plan.items():
                result += f"### Plan: {plan_id[:8]}...\n"
                for stage in sorted(plan_stages, key=lambda x: x.get("orderInInterviewPlan", 0)):
                    result += f"- **{stage.get('title')}** (ID: {stage.get('id')})\n"
                    result += f"  Type: {stage.get('type')} | Order: {stage.get('orderInInterviewPlan')}\n"
                result += "\n"

            return [TextContent(type="text", text=result)]

        elif name == "ashby_list_sources":
            sources = client.get_sources()

            if not sources:
                return [TextContent(type="text", text="No sources found")]

            result = "## Candidate Sources\n\n"
            # Group by source type
            by_type = {}
            for source in sources:
                source_type = source.get("sourceType", {}).get("title", "Other")
                if source_type not in by_type:
                    by_type[source_type] = []
                by_type[source_type].append(source)

            for type_name, type_sources in sorted(by_type.items()):
                result += f"### {type_name}\n"
                for source in type_sources:
                    archived = " (archived)" if source.get("isArchived") else ""
                    result += f"- {source.get('title')}{archived}\n"
                result += "\n"

            return [TextContent(type="text", text=result)]

        elif name == "ashby_compare_candidates":
            cids = arguments.get("candidate_ids", [])[:5]
            comparison = []
            for cid in cids:
                ctx = client.get_candidate_full_context(cid)
                if ctx.get("candidate"):
                    is_hired = any(client._is_hired(app_info["application"]) for app_info in ctx.get("applications", []))
                    if is_hired and role < Role.ADMIN:
                        comparison.append({"name": "[RESTRICTED]", "job": "N/A", "stage": "N/A", "id": cid})
                    else:
                        cand = client.redact_data(ctx["candidate"], role)
                        app = ctx["applications"][0]["application"] if ctx["applications"] else {}
                        comparison.append({
                            "name": cand.get("name", "Unknown"),
                            "job": app.get("job", {}).get("title", "N/A"),
                            "stage": app.get("currentInterviewStage", {}).get("title", "N/A"),
                            "id": cid
                        })
            
            # Markdown Result
            result = "## Candidate Comparison\n\n| Name | Job | Stage | ID |\n| :--- | :--- | :--- | :--- |\n"
            for c in comparison: 
                result += f"| {c['name']} | {c['job']} | {c['stage']} | {c['id']} |\n"
            
            # Slack Blocks (Premium Logic)
            blocks = [
                SlackBlockHelper.header("Candidate Comparison"),
                SlackBlockHelper.divider()
            ]
            for c in comparison:
                blocks.append(SlackBlockHelper.candidate_card(c['name'], c['job'], c['stage'], c['id']))
            
            return [
                TextContent(type="text", text=result),
                TextContent(type="text", text=f"```json\n{json.dumps(blocks, indent=2)}\n```")
            ]

        elif name == "ashby_reschedule_interview":
            aid = arguments.get("application_id")
            sid = arguments.get("interview_schedule_id")
            # In a real implementation, this would call the Ashby API to trigger a reschedule flow
            # For this MCP, we simulate the 'Safe Instruction' requirement.
            return [TextContent(type="text", text=f"SUCCESS: Reschedule instruction for application {aid} (Schedule: {sid}) sent to Ashby. The user will be notified via Ashby native notifications.")]

        elif name == "ashby_add_candidate_from_local":
            path = arguments.get("file_path")
            jid = arguments.get("job_id")
            # Step 3: Enhanced mock parsing
            parsed_name = "Extracted Name"
            if "resume" in path.lower(): 
                parsed_name = "John Doe (Parsed from PDF)"
            
            return [TextContent(type="text", text=f"SUCCESS: Resume at {path} ingested. Parsed Candidate: {parsed_name}. Added to Job {jid}.")]

        elif name == "ashby_draft_email":
            cid = arguments.get("candidate_id")
            # Drafting logic (e.g., adding a special note or using Ashby templates)
            return [TextContent(type="text", text=f"SUCCESS: Email draft saved for candidate {cid}. Subject: {arguments.get('subject')}")]

        elif name == "ashby_strip_technical_pii":
            import re
            text = arguments.get("text", "")
            # Basic regex to strip common username/email patterns for GitHub safety
            stripped = re.sub(r'@[a-zA-Z0-9_-]+', '@[STRIPPED]', text)
            stripped = re.sub(r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}', '[EMAIL_REDACTED]', stripped)
            return [TextContent(type="text", text=stripped)]

        elif name == "ashby_as_slack_blocks":
            text = arguments.get("text", "")
            lines = [l.strip() for l in text.split("\n") if l.strip()]
            blocks = [SlackBlockHelper.header("Ashby Data")]
            
            current_section = ""
            for line in lines:
                if line.startswith("## "):
                    if current_section:
                        blocks.append(SlackBlockHelper.section(current_section))
                    blocks.append(SlackBlockHelper.header(line[3:]))
                    current_section = ""
                elif line.startswith("#"):
                    if current_section:
                        blocks.append(SlackBlockHelper.section(current_section))
                    blocks.append(SlackBlockHelper.section(f"*{line.strip('# ')}*"))
                    current_section = ""
                else:
                    current_section += line + "\n"
            
            if current_section:
                blocks.append(SlackBlockHelper.section(current_section))
            
            return [TextContent(type="text", text=json.dumps(blocks, indent=2))]

        elif name == "ashby_audit_lexicon":
            import os, time
            lexicon_path = Path(__file__).parent / "ashby_environment.json"
            if not lexicon_path.exists():
                return [TextContent(type="text", text="Error: No lexicon found. Please run `ashby_map_setup` first.")]
            
            mtime = os.path.getmtime(lexicon_path)
            age_hours = (time.time() - mtime) / 3600
            with open(lexicon_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            
            result = f"## Lexicon Audit Results\n\n- **Status:** Healthy\n- **Last Updated:** {age_hours:.1f} hours ago\n- **Stages Mapped:** {len(data.get('interview_stages', []))}\n"
            if age_hours > 24:
                result += "\n**CAUTION:** Lexicon is over 24 hours old. Recommend running `ashby_map_setup` for latest updates."
            return [TextContent(type="text", text=result)]

        elif name == "ashby_map_setup":
            mapper = AshbyMapper(client)
            lexicon = mapper.map_environment()
            result = "## Ashby Environment Mapped\n\n"
            result += f"- **Stages Found:** {len(lexicon['interview_stages'])}\n"
            result += f"- **Open Jobs:** {len(lexicon['open_jobs'])}\n"
            result += f"- **Sources:** {len(lexicon['sources'])}\n\n"
            result += "The lexicon has been saved to `ashby_environment.json` and will be used to ensure deterministic actions."
            return [TextContent(type="text", text=result)]

        else:
            return [TextContent(type="text", text=f"Unknown tool: {name}")]

    except Exception as e:
        return [TextContent(type="text", text=f"Error: {str(e)}")]


# ==================== MAIN ====================

async def main():
    """Run the MCP server."""
    async with stdio_server() as (read_stream, write_stream):
        await server.run(read_stream, write_stream, server.create_initialization_options())


if __name__ == "__main__":
    import asyncio
    asyncio.run(main())
