"""
Ashby Slack Bot
Provides natural language access to Ashby ATS via Slack @mentions.
Uses Claude API for intelligence and reuses ashby_client.py for data access.
"""

import os
import re
import json
import logging
import time
from typing import Optional, Dict, Any, List
from collections import defaultdict

from slack_bolt import App
from slack_bolt.adapter.socket_mode import SocketModeHandler
from slack_sdk import WebClient
import anthropic
from dotenv import load_dotenv

from ashby_client import AshbyClient


# ===========================================================================
# Conversation Memory Store
# ===========================================================================

class ConversationMemory:
    """Thread-based conversation memory with TTL expiration."""

    def __init__(self, ttl_seconds: int = 3600, max_messages: int = 50):
        self._conversations: Dict[str, Dict] = {}
        self._ttl = ttl_seconds
        self._max_messages = max_messages

    def _get_key(self, channel_id: str, thread_ts: str) -> str:
        """Generate unique key for channel+thread combination."""
        return f"{channel_id}:{thread_ts}"

    def _cleanup_expired(self):
        """Remove expired conversations."""
        now = time.time()
        expired = [k for k, v in self._conversations.items()
                   if now - v.get("last_updated", 0) > self._ttl]
        for k in expired:
            del self._conversations[k]

    def get_messages(self, channel_id: str, thread_ts: str) -> List[Dict]:
        """Get conversation history for a thread."""
        self._cleanup_expired()
        key = self._get_key(channel_id, thread_ts)
        conv = self._conversations.get(key, {})
        return conv.get("messages", [])

    def add_user_message(self, channel_id: str, thread_ts: str, content: str):
        """Add a user message to the conversation."""
        key = self._get_key(channel_id, thread_ts)
        if key not in self._conversations:
            self._conversations[key] = {"messages": [], "last_updated": time.time()}

        self._conversations[key]["messages"].append({
            "role": "user",
            "content": content
        })
        self._conversations[key]["last_updated"] = time.time()
        self._trim_messages(key)

    def add_assistant_message(self, channel_id: str, thread_ts: str, content: Any):
        """Add an assistant message to the conversation."""
        key = self._get_key(channel_id, thread_ts)
        if key not in self._conversations:
            self._conversations[key] = {"messages": [], "last_updated": time.time()}

        self._conversations[key]["messages"].append({
            "role": "assistant",
            "content": content
        })
        self._conversations[key]["last_updated"] = time.time()
        self._trim_messages(key)

    def add_tool_result(self, channel_id: str, thread_ts: str, tool_results: List[Dict]):
        """Add tool results as a user message (per Anthropic API format)."""
        key = self._get_key(channel_id, thread_ts)
        if key not in self._conversations:
            self._conversations[key] = {"messages": [], "last_updated": time.time()}

        self._conversations[key]["messages"].append({
            "role": "user",
            "content": tool_results
        })
        self._conversations[key]["last_updated"] = time.time()
        self._trim_messages(key)

    def _trim_messages(self, key: str):
        """Trim conversation to max messages, keeping most recent."""
        messages = self._conversations[key]["messages"]
        if len(messages) > self._max_messages:
            # Keep the most recent messages
            self._conversations[key]["messages"] = messages[-self._max_messages:]

    def clear_thread(self, channel_id: str, thread_ts: str):
        """Clear conversation for a specific thread."""
        key = self._get_key(channel_id, thread_ts)
        if key in self._conversations:
            del self._conversations[key]


# Global conversation memory instance
conversation_memory = ConversationMemory(ttl_seconds=3600, max_messages=50)

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Environment variables
SLACK_BOT_TOKEN = os.environ.get("SLACK_BOT_TOKEN")
SLACK_APP_TOKEN = os.environ.get("SLACK_APP_TOKEN")
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY")
ASHBY_API_KEY = os.environ.get("ASHBY_API_KEY")
ALLOWED_CHANNELS = os.environ.get("ALLOWED_CHANNELS", "").split(",")
SAFETY_MODE = os.environ.get("SAFETY_MODE", "CONFIRM_ALL")
BATCH_LIMIT = int(os.environ.get("BATCH_LIMIT", "2"))

# Validate required environment variables
if not all([SLACK_BOT_TOKEN, SLACK_APP_TOKEN, ANTHROPIC_API_KEY, ASHBY_API_KEY]):
    raise ValueError("Missing required environment variables. Check .env file.")

# Initialize clients
app = App(token=SLACK_BOT_TOKEN)
claude = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
ashby = AshbyClient(api_key=ASHBY_API_KEY)

# System prompt for Claude
SYSTEM_PROMPT = """Recruiting assistant. Concise. Action-oriented.

## Format
**[Name]** - [Job], [Stage]
[One line insight]
**→ Next:** [action]

## Rules
- MAX 4 lines
- Never ask for info you already have from this conversation
- Never say "I don't have access" - you have tools, use them
- Never say "I need more information" if you discussed the candidate already
- Just do it or say what's blocking

## NEVER SAY
- "I encountered an error"
- "I need more information" (if you have it)
- "I don't have access to tools for X"
- "Check Ashby directly"
- "Which candidate?" (if just discussed)
- Bullet lists of suggestions
- "Would you like me to..."

## Instead
- Use the candidate_id/application_id from previous tool results
- If something failed, say what DID work and offer next action
- "Moving Lena to Phone Screen - confirm?" not "Which candidate would you like to move?"

## Your Tools
You CAN: search candidates, get details, move stages, schedule interviews, create offers, add notes, reject applications.
If user asks to schedule - use schedule_interview tool.
If user asks to move stage - use move_candidate_stage tool.
"""

# Tool definitions for Claude
TOOLS = [
    {
        "name": "get_pipeline_overview",
        "description": "Get a full pipeline summary showing total candidates, breakdown by stage and job, and open positions.",
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": []
        }
    },
    {
        "name": "get_stale_candidates",
        "description": "Get candidates who have been stuck in a stage for too long (default 14 days). Excludes Application Review by default.",
        "input_schema": {
            "type": "object",
            "properties": {
                "days_threshold": {
                    "type": "integer",
                    "description": "Number of days to consider stale (default 14)"
                },
                "limit": {
                    "type": "integer",
                    "description": "Maximum number of candidates to return (default 10)"
                }
            },
            "required": []
        }
    },
    {
        "name": "search_candidates",
        "description": "Search for candidates by name or email. Returns matches with job and stage info for quick disambiguation. If multiple matches, present them as numbered options for the user to pick.",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Name or email to search for"
                }
            },
            "required": ["query"]
        }
    },
    {
        "name": "get_candidate_details",
        "description": "Get FULL details about a candidate: applications, current stage, interview history, feedback/scorecards, notes, and scheduled interviews. USE THIS when asked about a candidate's status, progress, or latest news. If you have their candidate_id from a previous search, use it directly.",
        "input_schema": {
            "type": "object",
            "properties": {
                "candidate_id": {
                    "type": "string",
                    "description": "The candidate's ID (use this if you have it from a previous search)"
                },
                "name_or_email": {
                    "type": "string",
                    "description": "Name or email to search for (only if candidate_id is not known)"
                }
            },
            "required": []
        }
    },
    {
        "name": "get_candidates_by_job",
        "description": "Get all active candidates for a specific job.",
        "input_schema": {
            "type": "object",
            "properties": {
                "job_title": {
                    "type": "string",
                    "description": "The job title to filter by"
                },
                "limit": {
                    "type": "integer",
                    "description": "Maximum number of candidates to return (default 20)"
                }
            },
            "required": ["job_title"]
        }
    },
    {
        "name": "get_candidates_by_stage",
        "description": "Get all active candidates in a specific interview stage.",
        "input_schema": {
            "type": "object",
            "properties": {
                "stage_name": {
                    "type": "string",
                    "description": "The stage name to filter by (e.g., 'Phone Screen', 'Technical Interview')"
                },
                "limit": {
                    "type": "integer",
                    "description": "Maximum number of candidates to return (default 20)"
                }
            },
            "required": ["stage_name"]
        }
    },
    {
        "name": "get_candidates_needing_decision",
        "description": "Get candidates who are waiting on a hiring decision (in offer/final/debrief stages).",
        "input_schema": {
            "type": "object",
            "properties": {
                "limit": {
                    "type": "integer",
                    "description": "Maximum number of candidates to return (default 10)"
                }
            },
            "required": []
        }
    },
    {
        "name": "get_open_jobs",
        "description": "Get all open job positions.",
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": []
        }
    },
    {
        "name": "get_job_details",
        "description": "Get details about a specific job including the job description.",
        "input_schema": {
            "type": "object",
            "properties": {
                "job_title": {
                    "type": "string",
                    "description": "The job title to get details for"
                }
            },
            "required": ["job_title"]
        }
    },
    {
        "name": "get_recent_applications",
        "description": "Get candidates who applied recently.",
        "input_schema": {
            "type": "object",
            "properties": {
                "days": {
                    "type": "integer",
                    "description": "Number of days to look back (default 7)"
                },
                "limit": {
                    "type": "integer",
                    "description": "Maximum number of candidates to return (default 20)"
                }
            },
            "required": []
        }
    },
    {
        "name": "add_candidate_note",
        "description": "Add a note to a candidate's profile. REQUIRES CONFIRMATION before executing.",
        "input_schema": {
            "type": "object",
            "properties": {
                "candidate_id": {
                    "type": "string",
                    "description": "The candidate's ID"
                },
                "note": {
                    "type": "string",
                    "description": "The note content to add"
                }
            },
            "required": ["candidate_id", "note"]
        }
    },
    {
        "name": "move_candidate_stage",
        "description": "Move a candidate to a different interview stage. REQUIRES CONFIRMATION before executing.",
        "input_schema": {
            "type": "object",
            "properties": {
                "application_id": {
                    "type": "string",
                    "description": "The application ID"
                },
                "stage_name": {
                    "type": "string",
                    "description": "The target stage name"
                }
            },
            "required": ["application_id", "stage_name"]
        }
    },
    {
        "name": "get_interview_stages",
        "description": "List all available interview stages.",
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": []
        }
    },
    # ==================== NEW TOOLS ====================
    {
        "name": "create_candidate",
        "description": "Create a new candidate in Ashby. REQUIRES CONFIRMATION. Use this when someone asks to add a new candidate/person to the system.",
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {
                    "type": "string",
                    "description": "Full name of the candidate (required)"
                },
                "email": {
                    "type": "string",
                    "description": "Email address (required)"
                },
                "phone": {
                    "type": "string",
                    "description": "Phone number (optional)"
                },
                "linkedin_url": {
                    "type": "string",
                    "description": "LinkedIn profile URL (optional)"
                },
                "github_url": {
                    "type": "string",
                    "description": "GitHub profile URL (optional)"
                },
                "location": {
                    "type": "string",
                    "description": "Location/city (optional)"
                },
                "job_title": {
                    "type": "string",
                    "description": "Job title to apply for (optional - will create application if provided)"
                }
            },
            "required": ["name", "email"]
        }
    },
    {
        "name": "get_upcoming_interviews",
        "description": "Get all upcoming/scheduled interviews across all candidates. Shows interview times, interviewers, and candidates.",
        "input_schema": {
            "type": "object",
            "properties": {
                "limit": {
                    "type": "integer",
                    "description": "Maximum number of interviews to return (default 20)"
                }
            },
            "required": []
        }
    },
    {
        "name": "schedule_interview",
        "description": "Schedule an interview for a candidate. REQUIRES CONFIRMATION. Need application_id, interviewer name/email, date/time.",
        "input_schema": {
            "type": "object",
            "properties": {
                "application_id": {
                    "type": "string",
                    "description": "The application ID (get from candidate details)"
                },
                "candidate_name": {
                    "type": "string",
                    "description": "Candidate name (alternative to application_id)"
                },
                "interviewer_name": {
                    "type": "string",
                    "description": "Name of the interviewer (will look up their user ID)"
                },
                "interviewer_email": {
                    "type": "string",
                    "description": "Email of the interviewer (alternative to name)"
                },
                "start_time": {
                    "type": "string",
                    "description": "Start time in ISO 8601 format (e.g., '2024-01-15T10:00:00Z') or natural language like 'tomorrow at 2pm'"
                },
                "duration_minutes": {
                    "type": "integer",
                    "description": "Duration in minutes (default 60)"
                },
                "interview_type": {
                    "type": "string",
                    "description": "Type: 'video', 'phone', or 'in_person' (default: video)"
                },
                "meeting_link": {
                    "type": "string",
                    "description": "Video meeting URL (optional)"
                },
                "location": {
                    "type": "string",
                    "description": "Physical location for in-person interviews (optional)"
                }
            },
            "required": ["start_time"]
        }
    },
    {
        "name": "cancel_interview",
        "description": "Cancel a scheduled interview. REQUIRES CONFIRMATION.",
        "input_schema": {
            "type": "object",
            "properties": {
                "interview_id": {
                    "type": "string",
                    "description": "The interview schedule ID to cancel"
                },
                "candidate_name": {
                    "type": "string",
                    "description": "Candidate name (will find their scheduled interview)"
                },
                "reason": {
                    "type": "string",
                    "description": "Reason for cancellation (optional)"
                }
            },
            "required": []
        }
    },
    {
        "name": "get_pending_offers",
        "description": "Get all pending/draft offers waiting for response or approval.",
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": []
        }
    },
    {
        "name": "create_offer",
        "description": "Create an offer for a candidate. REQUIRES CONFIRMATION. This is a significant action.",
        "input_schema": {
            "type": "object",
            "properties": {
                "application_id": {
                    "type": "string",
                    "description": "The application ID"
                },
                "candidate_name": {
                    "type": "string",
                    "description": "Candidate name (alternative to application_id)"
                },
                "start_date": {
                    "type": "string",
                    "description": "Proposed start date (e.g., '2024-02-01')"
                },
                "salary": {
                    "type": "number",
                    "description": "Base salary amount (optional)"
                },
                "currency": {
                    "type": "string",
                    "description": "Currency code like USD, EUR (default: USD)"
                },
                "notes": {
                    "type": "string",
                    "description": "Additional offer details/notes"
                }
            },
            "required": ["start_date"]
        }
    },
    {
        "name": "reject_application",
        "description": "Reject/archive an application. REQUIRES CONFIRMATION. This removes the candidate from the active pipeline.",
        "input_schema": {
            "type": "object",
            "properties": {
                "application_id": {
                    "type": "string",
                    "description": "The application ID to reject"
                },
                "candidate_name": {
                    "type": "string",
                    "description": "Candidate name (alternative to application_id)"
                },
                "reason": {
                    "type": "string",
                    "description": "Reason for rejection (optional but recommended)"
                }
            },
            "required": []
        }
    },
    {
        "name": "get_team_members",
        "description": "Get list of team members/users who can be interviewers. Use this to find interviewer IDs for scheduling.",
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": []
        }
    },
    {
        "name": "get_sources",
        "description": "Get list of candidate sources (where candidates come from). Useful for reporting or when creating candidates.",
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": []
        }
    },
    {
        "name": "get_pipeline_velocity",
        "description": "Get pipeline velocity metrics: average time in pipeline, conversion rates, source breakdown.",
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": []
        }
    }
]


def is_hired(candidate: Dict) -> bool:
    """Check if a candidate has been hired (should be protected)."""
    if not candidate:
        return False
    # Check application status
    for app in candidate.get("applications", []):
        status = app.get("application", {}).get("status", "").lower()
        stage = app.get("application", {}).get("currentInterviewStage", {}).get("title", "").lower()
        if status == "hired" or "hired" in stage:
            return True
    return False


def filter_hired_candidates(candidates: List[Dict]) -> List[Dict]:
    """Remove hired candidates from a list."""
    return [c for c in candidates if not is_hired(c)]


def execute_tool(tool_name: str, tool_input: Dict) -> str:
    """Execute a tool and return the result as a string."""
    try:
        if tool_name == "get_pipeline_overview":
            result = ashby.get_pipeline_summary()
            return json.dumps(result, indent=2)

        elif tool_name == "get_stale_candidates":
            days = tool_input.get("days_threshold", 14)
            limit = tool_input.get("limit", 10)
            candidates = ashby.get_stale_candidates(days_threshold=days)[:limit]
            return json.dumps(candidates, indent=2)

        elif tool_name == "search_candidates":
            query = tool_input.get("query", "")
            # Search through active applications
            apps = ashby.get_active_applications()
            results = []
            query_lower = query.lower()
            for app in apps:
                candidate = app.get("candidate", {})
                name = candidate.get("name", "").lower()
                email = candidate.get("primaryEmailAddress", {}).get("value", "").lower()
                if query_lower in name or query_lower in email:
                    # Check if hired
                    status = app.get("status", "").lower()
                    stage = app.get("currentInterviewStage", {}).get("title", "").lower()
                    if status == "hired" or "hired" in stage:
                        continue
                    results.append({
                        "name": candidate.get("name"),
                        "email": candidate.get("primaryEmailAddress", {}).get("value"),
                        "candidate_id": candidate.get("id"),
                        "application_id": app.get("id"),
                        "job": app.get("job", {}).get("title"),
                        "stage": app.get("currentInterviewStage", {}).get("title")
                    })
            return json.dumps(results[:20], indent=2)

        elif tool_name == "get_candidate_details":
            candidate_id = tool_input.get("candidate_id")
            name_or_email = tool_input.get("name_or_email")

            # If no candidate_id, search by name/email first
            if not candidate_id and name_or_email:
                apps = ashby.get_active_applications()
                query_lower = name_or_email.lower()
                for app in apps:
                    candidate = app.get("candidate", {})
                    name = candidate.get("name", "").lower()
                    email = candidate.get("primaryEmailAddress", {}).get("value", "").lower()
                    if query_lower in name or query_lower in email:
                        candidate_id = candidate.get("id")
                        break
                if not candidate_id:
                    return json.dumps({"error": f"No candidate found matching '{name_or_email}'"})

            if not candidate_id:
                return json.dumps({"error": "Either candidate_id or name_or_email is required"})

            result = ashby.get_candidate_full_context(candidate_id)
            if is_hired(result):
                return json.dumps({"error": "Cannot access information about hired candidates."})
            return json.dumps(result, indent=2, default=str)

        elif tool_name == "get_candidates_by_job":
            job_title = tool_input.get("job_title")
            limit = tool_input.get("limit", 20)
            job = ashby.get_job_by_title(job_title)
            if not job:
                return json.dumps({"error": f"No job found matching '{job_title}'"})
            apps = ashby.get_applications_by_job(job.get("id"))
            results = []
            for app in apps[:limit]:
                status = app.get("status", "").lower()
                stage = app.get("currentInterviewStage", {}).get("title", "").lower()
                if status == "hired" or "hired" in stage:
                    continue
                results.append({
                    "name": app.get("candidate", {}).get("name"),
                    "email": app.get("candidate", {}).get("primaryEmailAddress", {}).get("value"),
                    "candidate_id": app.get("candidate", {}).get("id"),
                    "application_id": app.get("id"),
                    "stage": app.get("currentInterviewStage", {}).get("title")
                })
            return json.dumps(results, indent=2)

        elif tool_name == "get_candidates_by_stage":
            stage_name = tool_input.get("stage_name")
            limit = tool_input.get("limit", 20)
            apps = ashby.get_applications_by_stage(stage_name)
            results = []
            for app in apps[:limit]:
                status = app.get("status", "").lower()
                stage = app.get("currentInterviewStage", {}).get("title", "").lower()
                if status == "hired" or "hired" in stage:
                    continue
                results.append({
                    "name": app.get("candidate", {}).get("name"),
                    "email": app.get("candidate", {}).get("primaryEmailAddress", {}).get("value"),
                    "candidate_id": app.get("candidate", {}).get("id"),
                    "application_id": app.get("id"),
                    "job": app.get("job", {}).get("title"),
                    "stage": app.get("currentInterviewStage", {}).get("title")
                })
            return json.dumps(results, indent=2)

        elif tool_name == "get_candidates_needing_decision":
            limit = tool_input.get("limit", 10)
            candidates = ashby.get_candidates_needing_decision()[:limit]
            return json.dumps(candidates, indent=2)

        elif tool_name == "get_open_jobs":
            jobs = ashby.get_open_jobs()
            results = [{"id": j.get("id"), "title": j.get("title"), "status": j.get("status")} for j in jobs]
            return json.dumps(results, indent=2)

        elif tool_name == "get_job_details":
            job_title = tool_input.get("job_title")
            job = ashby.get_job_by_title(job_title)
            if not job:
                return json.dumps({"error": f"No job found matching '{job_title}'"})
            posting = ashby.get_job_posting(job.get("id"))
            result = {
                "id": job.get("id"),
                "title": job.get("title"),
                "status": job.get("status"),
                "description": posting.get("descriptionHtml") if posting else None
            }
            return json.dumps(result, indent=2)

        elif tool_name == "get_recent_applications":
            days = tool_input.get("days", 7)
            limit = tool_input.get("limit", 20)
            candidates = ashby.get_recent_applications(days=days)[:limit]
            return json.dumps(candidates, indent=2)

        elif tool_name == "add_candidate_note":
            # This should trigger confirmation flow
            candidate_id = tool_input.get("candidate_id")
            note = tool_input.get("note")
            return json.dumps({
                "action": "add_note",
                "requires_confirmation": True,
                "candidate_id": candidate_id,
                "note": note,
                "message": f"Ready to add note to candidate {candidate_id}. Please confirm."
            })

        elif tool_name == "move_candidate_stage":
            # This should trigger confirmation flow
            application_id = tool_input.get("application_id")
            stage_name = tool_input.get("stage_name")
            stage = ashby.get_stage_by_name(stage_name)
            if not stage:
                return json.dumps({"error": f"No stage found matching '{stage_name}'"})
            return json.dumps({
                "action": "move_stage",
                "requires_confirmation": True,
                "application_id": application_id,
                "stage_id": stage.get("id"),
                "stage_name": stage.get("title"),
                "message": f"Ready to move application to {stage.get('title')}. Please confirm."
            })

        elif tool_name == "get_interview_stages":
            stages = ashby.get_interview_stages()
            results = [{"id": s.get("id"), "title": s.get("title")} for s in stages]
            return json.dumps(results, indent=2)

        # ==================== NEW TOOL HANDLERS ====================

        elif tool_name == "create_candidate":
            name = tool_input.get("name")
            email = tool_input.get("email")
            phone = tool_input.get("phone")
            linkedin_url = tool_input.get("linkedin_url")
            github_url = tool_input.get("github_url")
            location = tool_input.get("location")
            job_title = tool_input.get("job_title")

            # Return confirmation request
            confirm_data = {
                "action": "create_candidate",
                "requires_confirmation": True,
                "name": name,
                "email": email,
                "phone": phone,
                "linkedin_url": linkedin_url,
                "location": location,
                "job_title": job_title,
                "message": f"Ready to create candidate: {name} ({email})"
            }
            if job_title:
                confirm_data["message"] += f" and apply to {job_title}"
            return json.dumps(confirm_data)

        elif tool_name == "get_upcoming_interviews":
            limit = tool_input.get("limit", 20)
            interviews = ashby.get_upcoming_interviews()[:limit]
            results = []
            for interview in interviews:
                results.append({
                    "interview_id": interview.get("id"),
                    "start_time": interview.get("startTime"),
                    "end_time": interview.get("endTime"),
                    "candidate": interview.get("candidate", {}).get("name"),
                    "job": interview.get("job", {}).get("title"),
                    "interviewers": [i.get("name") for i in interview.get("interviewers", [])],
                    "location": interview.get("location"),
                    "meeting_link": interview.get("meetingLink")
                })
            return json.dumps(results, indent=2)

        elif tool_name == "schedule_interview":
            application_id = tool_input.get("application_id")
            candidate_name = tool_input.get("candidate_name")
            interviewer_name = tool_input.get("interviewer_name")
            interviewer_email = tool_input.get("interviewer_email")
            start_time = tool_input.get("start_time")
            duration_minutes = tool_input.get("duration_minutes", 60)
            interview_type = tool_input.get("interview_type", "video")
            meeting_link = tool_input.get("meeting_link")
            location = tool_input.get("location")

            # Find application if only candidate name provided
            if not application_id and candidate_name:
                apps = ashby.get_active_applications()
                for app in apps:
                    if candidate_name.lower() in app.get("candidate", {}).get("name", "").lower():
                        application_id = app.get("id")
                        break
                if not application_id:
                    return json.dumps({"error": f"No active application found for candidate '{candidate_name}'"})

            # Find interviewer
            interviewer_id = None
            if interviewer_email:
                user = ashby.get_user_by_email(interviewer_email)
                if user:
                    interviewer_id = user.get("id")
            elif interviewer_name:
                user = ashby.get_user_by_name(interviewer_name)
                if user:
                    interviewer_id = user.get("id")

            if not interviewer_id:
                return json.dumps({"error": f"Could not find interviewer. Use get_team_members to see available interviewers."})

            # Return confirmation request
            return json.dumps({
                "action": "schedule_interview",
                "requires_confirmation": True,
                "application_id": application_id,
                "interviewer_id": interviewer_id,
                "interviewer_name": interviewer_name or interviewer_email,
                "start_time": start_time,
                "duration_minutes": duration_minutes,
                "interview_type": interview_type,
                "meeting_link": meeting_link,
                "location": location,
                "message": f"Ready to schedule {interview_type} interview at {start_time} with {interviewer_name or interviewer_email}."
            })

        elif tool_name == "cancel_interview":
            interview_id = tool_input.get("interview_id")
            candidate_name = tool_input.get("candidate_name")
            reason = tool_input.get("reason")

            # Find interview by candidate if no ID provided
            if not interview_id and candidate_name:
                interviews = ashby.get_upcoming_interviews()
                for interview in interviews:
                    if candidate_name.lower() in interview.get("candidate", {}).get("name", "").lower():
                        interview_id = interview.get("id")
                        break
                if not interview_id:
                    return json.dumps({"error": f"No upcoming interview found for '{candidate_name}'"})

            if not interview_id:
                return json.dumps({"error": "Either interview_id or candidate_name is required"})

            return json.dumps({
                "action": "cancel_interview",
                "requires_confirmation": True,
                "interview_id": interview_id,
                "reason": reason,
                "message": f"Ready to cancel interview. Reason: {reason or 'Not specified'}"
            })

        elif tool_name == "get_pending_offers":
            offers = ashby.get_pending_offers()
            results = []
            for offer in offers:
                results.append({
                    "offer_id": offer.get("id"),
                    "candidate": offer.get("candidate", {}).get("name"),
                    "job": offer.get("job", {}).get("title"),
                    "status": offer.get("status"),
                    "start_date": offer.get("startDate"),
                    "created_at": offer.get("createdAt")
                })
            return json.dumps(results, indent=2)

        elif tool_name == "create_offer":
            application_id = tool_input.get("application_id")
            candidate_name = tool_input.get("candidate_name")
            start_date = tool_input.get("start_date")
            salary = tool_input.get("salary")
            currency = tool_input.get("currency", "USD")
            notes = tool_input.get("notes")

            # Find application if only candidate name provided
            if not application_id and candidate_name:
                apps = ashby.get_active_applications()
                for app in apps:
                    if candidate_name.lower() in app.get("candidate", {}).get("name", "").lower():
                        application_id = app.get("id")
                        break
                if not application_id:
                    return json.dumps({"error": f"No active application found for '{candidate_name}'"})

            if not application_id:
                return json.dumps({"error": "Either application_id or candidate_name is required"})

            return json.dumps({
                "action": "create_offer",
                "requires_confirmation": True,
                "application_id": application_id,
                "start_date": start_date,
                "salary": salary,
                "currency": currency,
                "notes": notes,
                "message": f"Ready to create offer with start date {start_date}" + (f" and salary {currency} {salary}" if salary else "")
            })

        elif tool_name == "reject_application":
            application_id = tool_input.get("application_id")
            candidate_name = tool_input.get("candidate_name")
            reason = tool_input.get("reason")

            # Find application if only candidate name provided
            if not application_id and candidate_name:
                apps = ashby.get_active_applications()
                for app in apps:
                    if candidate_name.lower() in app.get("candidate", {}).get("name", "").lower():
                        application_id = app.get("id")
                        candidate_name = app.get("candidate", {}).get("name")
                        break
                if not application_id:
                    return json.dumps({"error": f"No active application found for '{candidate_name}'"})

            if not application_id:
                return json.dumps({"error": "Either application_id or candidate_name is required"})

            return json.dumps({
                "action": "reject_application",
                "requires_confirmation": True,
                "application_id": application_id,
                "candidate_name": candidate_name,
                "reason": reason,
                "message": f"Ready to reject application for {candidate_name or application_id}. Reason: {reason or 'Not specified'}"
            })

        elif tool_name == "get_team_members":
            users = ashby.get_users()
            results = []
            for user in users:
                results.append({
                    "user_id": user.get("id"),
                    "name": user.get("name"),
                    "email": user.get("email"),
                    "role": user.get("role")
                })
            return json.dumps(results, indent=2)

        elif tool_name == "get_sources":
            sources = ashby.get_sources()
            results = [{"id": s.get("id"), "title": s.get("title")} for s in sources]
            return json.dumps(results, indent=2)

        elif tool_name == "get_pipeline_velocity":
            metrics = ashby.get_pipeline_velocity()
            return json.dumps(metrics, indent=2, default=str)

        else:
            return json.dumps({"error": f"Unknown tool: {tool_name}"})

    except Exception as e:
        logger.error(f"Tool execution error: {e}")
        return json.dumps({"error": str(e)})


def process_message_with_claude(
    user_message: str,
    slack_user_id: str,
    channel_id: str,
    thread_ts: str
) -> str:
    """Send message to Claude and process tool calls with conversation memory."""

    # Get existing conversation history for this thread
    messages = conversation_memory.get_messages(channel_id, thread_ts).copy()

    # Add the new user message
    messages.append({"role": "user", "content": user_message})

    logger.info(f"Processing with {len(messages)} messages in history")

    # Initial Claude call
    response = claude.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=4096,
        system=SYSTEM_PROMPT,
        tools=TOOLS,
        messages=messages
    )

    # Process tool calls in a loop
    while response.stop_reason == "tool_use":
        # Extract tool use blocks
        tool_uses = [block for block in response.content if block.type == "tool_use"]

        logger.info(f"Executing {len(tool_uses)} tool(s): {[t.name for t in tool_uses]}")

        # Execute tools and collect results
        tool_results = []
        for tool_use in tool_uses:
            result = execute_tool(tool_use.name, tool_use.input)
            tool_results.append({
                "type": "tool_result",
                "tool_use_id": tool_use.id,
                "content": result
            })

        # Add assistant response and tool results to messages
        messages.append({"role": "assistant", "content": response.content})
        messages.append({"role": "user", "content": tool_results})

        # Continue conversation
        response = claude.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=4096,
            system=SYSTEM_PROMPT,
            tools=TOOLS,
            messages=messages
        )

    # Store the final conversation state in memory
    # Add user message
    conversation_memory.add_user_message(channel_id, thread_ts, user_message)

    # Add all assistant messages and tool results from this turn
    for msg in messages[len(conversation_memory.get_messages(channel_id, thread_ts)):]:
        if msg["role"] == "assistant":
            conversation_memory.add_assistant_message(channel_id, thread_ts, msg["content"])
        elif msg["role"] == "user" and isinstance(msg["content"], list):
            # Tool results
            conversation_memory.add_tool_result(channel_id, thread_ts, msg["content"])

    # Add the final assistant response
    conversation_memory.add_assistant_message(channel_id, thread_ts, response.content)

    # Extract final text response
    text_blocks = [block.text for block in response.content if hasattr(block, "text")]
    return "\n".join(text_blocks)


@app.event("app_mention")
def handle_mention(event: Dict, say, client: WebClient):
    """Handle @mentions of the bot."""
    channel_id = event.get("channel")
    user_id = event.get("user")
    text = event.get("text", "")
    thread_ts = event.get("thread_ts") or event.get("ts")

    # Channel restriction check
    if ALLOWED_CHANNELS and ALLOWED_CHANNELS[0]:  # Check if list is not empty/blank
        if channel_id not in ALLOWED_CHANNELS:
            logger.info(f"Ignoring message from non-allowed channel: {channel_id}")
            say(
                text="Sorry, I'm only configured to work in specific channels.",
                thread_ts=thread_ts
            )
            return

    # Remove the bot mention from the text
    clean_text = re.sub(r"<@[A-Z0-9]+>", "", text).strip()

    # Handle special commands
    if clean_text.lower() in ["clear", "reset", "forget"]:
        conversation_memory.clear_thread(channel_id, thread_ts)
        say(text="Conversation cleared. Starting fresh!", thread_ts=thread_ts)
        return

    if not clean_text:
        say(
            text="Hi! I'm the Ashby assistant. Ask me about your recruiting pipeline, candidates, or jobs. For example:\n• \"Show me stale candidates\"\n• \"Who's in the Phone Screen stage?\"\n• \"Give me a pipeline overview\"\n• \"Tell me about [candidate name]\"\n\nI remember our conversation in this thread, so you can ask follow-up questions!",
            thread_ts=thread_ts
        )
        return

    try:
        # Process with Claude (now with conversation memory)
        logger.info(f"Processing message from {user_id} in {channel_id}/{thread_ts}: {clean_text}")
        response = process_message_with_claude(
            user_message=clean_text,
            slack_user_id=user_id,
            channel_id=channel_id,
            thread_ts=thread_ts
        )

        # Send response (in thread if in a thread)
        say(text=response, thread_ts=thread_ts)

    except Exception as e:
        logger.error(f"Error processing message: {e}", exc_info=True)
        say(
            text=f"Sorry, I encountered an error: {str(e)}",
            thread_ts=thread_ts
        )


@app.event("reaction_added")
def handle_reaction(event: Dict, client: WebClient):
    """Handle emoji reactions for confirmations."""
    reaction = event.get("reaction")
    user_id = event.get("user")
    item = event.get("item", {})
    channel_id = item.get("channel")
    message_ts = item.get("ts")

    # Only process confirmation emojis
    if reaction not in ["white_check_mark", "x"]:
        return

    # TODO: Implement confirmation flow
    # This would require storing pending actions and matching them to reactions
    logger.info(f"Reaction {reaction} from {user_id} on message {message_ts}")


def main():
    """Start the Slack bot."""
    logger.info("Starting Ashby Slack Bot...")
    logger.info(f"Safety mode: {SAFETY_MODE}")
    logger.info(f"Allowed channels: {ALLOWED_CHANNELS if ALLOWED_CHANNELS[0] else 'ALL'}")

    handler = SocketModeHandler(app, SLACK_APP_TOKEN)
    handler.start()


if __name__ == "__main__":
    main()
