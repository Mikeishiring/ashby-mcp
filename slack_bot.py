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
# Security: Prompt Injection Protection
# ===========================================================================

# Patterns that indicate potential prompt injection attempts
INJECTION_PATTERNS = [
    r"ignore\s+(previous|all|above|prior)\s+(instructions?|prompts?|rules?)",
    r"forget\s+(everything|all|your)\s+(instructions?|rules?|training)",
    r"you\s+are\s+now\s+a",
    r"new\s+instructions?:",
    r"system\s*:\s*",
    r"<\s*system\s*>",
    r"\[\s*SYSTEM\s*\]",
    r"act\s+as\s+(if|though)",
    r"pretend\s+(you|to\s+be)",
    r"override\s+(your|all|safety)",
    r"disregard\s+(your|all|previous)",
]

# Compile patterns for efficiency
_injection_regex = re.compile("|".join(INJECTION_PATTERNS), re.IGNORECASE)


def sanitize_for_llm(text: str, field_name: str = "input") -> str:
    """
    Sanitize text from external sources before including in LLM context.
    Escapes quotes and wraps in clear delimiters.
    """
    if not text:
        return ""

    # Check for injection patterns
    if _injection_regex.search(text):
        logger.warning(f"Potential prompt injection detected in {field_name}: {text[:100]}")
        # Don't block, but clearly mark as untrusted
        text = f"[UNTRUSTED CONTENT - potential injection detected]: {text}"

    # Escape quotes to prevent breaking out of string context
    sanitized = text.replace('"', '\\"').replace("'", "\\'")

    # Wrap in clear delimiters
    return f'[{field_name.upper()}_START]{sanitized}[{field_name.upper()}_END]'


def sanitize_candidate_data(candidate: Dict) -> Dict:
    """Sanitize candidate data fields that could contain injections."""
    if not candidate:
        return candidate

    sanitized = candidate.copy()

    # Fields that could contain user-controlled content
    text_fields = ["name", "notes", "resume", "coverLetter", "headline"]

    for field in text_fields:
        if field in sanitized and sanitized[field]:
            sanitized[field] = sanitize_for_llm(sanitized[field], f"candidate_{field}")

    return sanitized


# ===========================================================================
# Security: Rate Limiting
# ===========================================================================

class RateLimiter:
    """Per-user rate limiting to prevent abuse."""

    def __init__(self, max_requests: int = 20, window_seconds: int = 60):
        self._requests: Dict[str, List[float]] = defaultdict(list)
        self._max_requests = max_requests
        self._window = window_seconds

    def is_allowed(self, user_id: str) -> bool:
        """Check if user is within rate limits."""
        now = time.time()
        window_start = now - self._window

        # Clean old requests
        self._requests[user_id] = [
            ts for ts in self._requests[user_id] if ts > window_start
        ]

        # Check limit
        if len(self._requests[user_id]) >= self._max_requests:
            return False

        # Record this request
        self._requests[user_id].append(now)
        return True

    def get_remaining(self, user_id: str) -> int:
        """Get remaining requests for user."""
        now = time.time()
        window_start = now - self._window
        recent = [ts for ts in self._requests[user_id] if ts > window_start]
        return max(0, self._max_requests - len(recent))


# Global rate limiter
rate_limiter = RateLimiter(max_requests=20, window_seconds=60)


# ===========================================================================
# Security: Secret Exposure Protection
# ===========================================================================

def sanitize_error(error: Exception) -> str:
    """Remove sensitive information from error messages."""
    error_str = str(error)

    # Patterns that might contain secrets
    secret_patterns = [
        (r"(api[_-]?key|apikey|token|secret|password|credential)[=:]\s*['\"]?[\w\-\.]+['\"]?", r"\1=[REDACTED]"),
        (r"(Bearer|Basic)\s+[\w\-\.]+", r"\1 [REDACTED]"),
        (r"sk-ant-[\w\-]+", "[ANTHROPIC_KEY_REDACTED]"),
        (r"xox[baprs]-[\w\-]+", "[SLACK_TOKEN_REDACTED]"),
    ]

    for pattern, replacement in secret_patterns:
        error_str = re.sub(pattern, replacement, error_str, flags=re.IGNORECASE)

    return error_str


# ===========================================================================
# Security: Pending Actions Store (Confirmation Flow)
# ===========================================================================

class PendingActionsStore:
    """Store pending actions awaiting user confirmation via emoji reaction."""

    def __init__(self, ttl_seconds: int = 300):  # 5 minute expiry
        self._actions: Dict[str, Dict] = {}
        self._ttl = ttl_seconds

    def _cleanup_expired(self):
        """Remove expired pending actions."""
        now = time.time()
        expired = [k for k, v in self._actions.items()
                   if now - v.get("created_at", 0) > self._ttl]
        for k in expired:
            del self._actions[k]

    def store(self, message_ts: str, channel_id: str, action_data: Dict, user_id: str) -> str:
        """Store a pending action and return its key."""
        self._cleanup_expired()
        key = f"{channel_id}:{message_ts}"
        self._actions[key] = {
            "action": action_data,
            "user_id": user_id,  # Only this user can confirm
            "channel_id": channel_id,
            "message_ts": message_ts,
            "created_at": time.time()
        }
        return key

    def get(self, channel_id: str, message_ts: str) -> Optional[Dict]:
        """Get a pending action by message coordinates."""
        self._cleanup_expired()
        key = f"{channel_id}:{message_ts}"
        return self._actions.get(key)

    def remove(self, channel_id: str, message_ts: str) -> Optional[Dict]:
        """Remove and return a pending action."""
        self._cleanup_expired()
        key = f"{channel_id}:{message_ts}"
        return self._actions.pop(key, None)

    def get_by_thread(self, channel_id: str, thread_ts: str) -> List[Dict]:
        """Get all pending actions for a thread."""
        self._cleanup_expired()
        prefix = f"{channel_id}:"
        return [v for k, v in self._actions.items()
                if k.startswith(prefix) and v.get("thread_ts") == thread_ts]


# Global pending actions store
pending_actions = PendingActionsStore(ttl_seconds=300)


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
SYSTEM_PROMPT = """You are a terse recruiting assistant. CRITICAL RULES:

1. MAX 2 SENTENCES. Never use bullet points or lists.
2. NEVER say "I don't have access" or "check Ashby directly" - USE YOUR TOOLS.
3. Remember context - if we just discussed Lena, don't ask "which candidate?"
4. If a tool fails, say what failed and offer ONE alternative.

YOUR TOOLS (use them!):
- search_candidates, get_candidate_details, get_candidates_by_job, get_candidates_by_stage, get_candidates_by_source
- get_candidate_scorecard (USE THIS for interview feedback/scores/ratings - returns formatted summary with 1-4 ratings per stage)
- move_candidate_stage, add_candidate_note, create_candidate, archive_candidate
- schedule_interview, reschedule_interview, cancel_interview, get_upcoming_interviews
- create_offer, get_pending_offers, get_candidate_offer
- reject_application, apply_candidate_to_job
- get_application_history, get_application_feedback
- get_pipeline_overview, get_stale_candidates, get_team_members, generate_report

Format: **Name** - status. Action?
Example: "**Lena Chen** in Phone Screen. Move to Technical?"
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
    },
    {
        "name": "reschedule_interview",
        "description": "Reschedule/update an existing interview. Change time, interviewers, or location. REQUIRES CONFIRMATION.",
        "input_schema": {
            "type": "object",
            "properties": {
                "interview_id": {
                    "type": "string",
                    "description": "The interview schedule ID to update"
                },
                "candidate_name": {
                    "type": "string",
                    "description": "Candidate name (will find their scheduled interview)"
                },
                "new_start_time": {
                    "type": "string",
                    "description": "New start time in ISO 8601 format or natural language"
                },
                "new_duration_minutes": {
                    "type": "integer",
                    "description": "New duration in minutes"
                },
                "new_interviewer_name": {
                    "type": "string",
                    "description": "New interviewer name (optional)"
                },
                "new_location": {
                    "type": "string",
                    "description": "New location (optional)"
                },
                "new_meeting_link": {
                    "type": "string",
                    "description": "New meeting link (optional)"
                }
            },
            "required": []
        }
    },
    {
        "name": "archive_candidate",
        "description": "Archive a candidate (remove from active pipeline). REQUIRES CONFIRMATION.",
        "input_schema": {
            "type": "object",
            "properties": {
                "candidate_id": {
                    "type": "string",
                    "description": "The candidate ID to archive"
                },
                "candidate_name": {
                    "type": "string",
                    "description": "Candidate name (alternative to ID)"
                },
                "reason": {
                    "type": "string",
                    "description": "Reason for archiving"
                }
            },
            "required": []
        }
    },
    {
        "name": "apply_candidate_to_job",
        "description": "Apply an existing candidate to a different/additional job. REQUIRES CONFIRMATION.",
        "input_schema": {
            "type": "object",
            "properties": {
                "candidate_id": {
                    "type": "string",
                    "description": "The candidate ID"
                },
                "candidate_name": {
                    "type": "string",
                    "description": "Candidate name (alternative to ID)"
                },
                "job_title": {
                    "type": "string",
                    "description": "Job title to apply for"
                }
            },
            "required": ["job_title"]
        }
    },
    {
        "name": "get_candidate_offer",
        "description": "Get the offer details for a specific candidate.",
        "input_schema": {
            "type": "object",
            "properties": {
                "candidate_name": {
                    "type": "string",
                    "description": "Candidate name"
                },
                "application_id": {
                    "type": "string",
                    "description": "Application ID (alternative)"
                }
            },
            "required": []
        }
    },
    {
        "name": "get_application_history",
        "description": "Get the full stage transition history for a candidate's application.",
        "input_schema": {
            "type": "object",
            "properties": {
                "candidate_name": {
                    "type": "string",
                    "description": "Candidate name"
                },
                "application_id": {
                    "type": "string",
                    "description": "Application ID (alternative)"
                }
            },
            "required": []
        }
    },
    {
        "name": "get_application_feedback",
        "description": "Get all interview feedback and scorecards for a candidate's application.",
        "input_schema": {
            "type": "object",
            "properties": {
                "candidate_name": {
                    "type": "string",
                    "description": "Candidate name"
                },
                "application_id": {
                    "type": "string",
                    "description": "Application ID (alternative)"
                }
            },
            "required": []
        }
    },
    {
        "name": "get_candidates_by_source",
        "description": "Get candidates grouped by their source (referral, LinkedIn, job board, etc.).",
        "input_schema": {
            "type": "object",
            "properties": {
                "source_filter": {
                    "type": "string",
                    "description": "Filter to a specific source (e.g., 'LinkedIn', 'Referral')"
                }
            },
            "required": []
        }
    },
    {
        "name": "generate_report",
        "description": "Generate a recruiting report (pipeline, time-to-hire, source effectiveness, etc.).",
        "input_schema": {
            "type": "object",
            "properties": {
                "report_type": {
                    "type": "string",
                    "description": "Type of report: 'pipeline', 'time_to_hire', 'source_effectiveness', 'offer_acceptance'"
                }
            },
            "required": ["report_type"]
        }
    },
    {
        "name": "get_candidate_scorecard",
        "description": "Get a formatted interview scorecard summary for a candidate. Shows each interview stage, interviewer, rating (1-4), and recommendation. Use this when asked about interview feedback, scores, or how a candidate did.",
        "input_schema": {
            "type": "object",
            "properties": {
                "candidate_name": {
                    "type": "string",
                    "description": "Candidate name to look up"
                },
                "candidate_id": {
                    "type": "string",
                    "description": "Candidate ID (alternative to name)"
                }
            },
            "required": []
        }
    }
]


# Indicators that a candidate has been hired (case-insensitive matching)
HIRED_INDICATORS = [
    "hired",
    "accepted",
    "offer accepted",
    "started",
    "onboarding",
    "employee",
    "converted",
    "joined",
]


def is_hired(candidate: Dict) -> bool:
    """
    Check if a candidate has been hired (should be protected).
    Uses robust multi-field checking to prevent bypass attempts.
    """
    if not candidate:
        return False

    def matches_hired(text: str) -> bool:
        """Check if text matches any hired indicator."""
        if not text:
            return False
        text_lower = text.lower()
        return any(indicator in text_lower for indicator in HIRED_INDICATORS)

    # Check application status and stage
    for app in candidate.get("applications", []):
        app_data = app.get("application", {}) if "application" in app else app

        # Check status field
        status = app_data.get("status", "")
        if matches_hired(status):
            return True

        # Check stage title
        stage = app_data.get("currentInterviewStage", {}).get("title", "")
        if matches_hired(stage):
            return True

        # Check stage type (some systems use type field)
        stage_type = app_data.get("currentInterviewStage", {}).get("type", "")
        if matches_hired(stage_type):
            return True

        # Check archiveReason (might indicate hired)
        archive_reason = app_data.get("archiveReason", {})
        if isinstance(archive_reason, dict):
            reason_text = archive_reason.get("text", "") or archive_reason.get("title", "")
            if matches_hired(reason_text):
                return True
        elif isinstance(archive_reason, str) and matches_hired(archive_reason):
            return True

        # Check outcome field if present
        outcome = app_data.get("outcome", "")
        if matches_hired(outcome):
            return True

    # Also check top-level status (some API responses put it here)
    top_status = candidate.get("status", "")
    if matches_hired(top_status):
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

        # ==================== NEW TOOL HANDLERS ====================

        elif tool_name == "reschedule_interview":
            interview_id = tool_input.get("interview_id")
            candidate_name = tool_input.get("candidate_name")
            new_start_time = tool_input.get("new_start_time")
            new_duration_minutes = tool_input.get("new_duration_minutes", 60)
            new_interviewer_name = tool_input.get("new_interviewer_name")
            new_location = tool_input.get("new_location")
            new_meeting_link = tool_input.get("new_meeting_link")

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

            # Find new interviewer if specified
            new_interviewer_id = None
            if new_interviewer_name:
                user = ashby.get_user_by_name(new_interviewer_name)
                if user:
                    new_interviewer_id = user.get("id")

            return json.dumps({
                "action": "reschedule_interview",
                "requires_confirmation": True,
                "interview_id": interview_id,
                "new_start_time": new_start_time,
                "new_duration_minutes": new_duration_minutes,
                "new_interviewer_id": new_interviewer_id,
                "new_interviewer_name": new_interviewer_name,
                "new_location": new_location,
                "new_meeting_link": new_meeting_link,
                "message": f"Ready to reschedule interview" + (f" to {new_start_time}" if new_start_time else "")
            })

        elif tool_name == "archive_candidate":
            candidate_id = tool_input.get("candidate_id")
            candidate_name = tool_input.get("candidate_name")
            reason = tool_input.get("reason")

            # Find candidate if only name provided
            if not candidate_id and candidate_name:
                apps = ashby.get_active_applications()
                for app in apps:
                    if candidate_name.lower() in app.get("candidate", {}).get("name", "").lower():
                        candidate_id = app.get("candidate", {}).get("id")
                        candidate_name = app.get("candidate", {}).get("name")
                        break
                if not candidate_id:
                    return json.dumps({"error": f"No candidate found matching '{candidate_name}'"})

            if not candidate_id:
                return json.dumps({"error": "Either candidate_id or candidate_name is required"})

            return json.dumps({
                "action": "archive_candidate",
                "requires_confirmation": True,
                "candidate_id": candidate_id,
                "candidate_name": candidate_name,
                "reason": reason,
                "message": f"Ready to archive {candidate_name or candidate_id}. Reason: {reason or 'Not specified'}"
            })

        elif tool_name == "apply_candidate_to_job":
            candidate_id = tool_input.get("candidate_id")
            candidate_name = tool_input.get("candidate_name")
            job_title = tool_input.get("job_title")

            # Find candidate if only name provided
            if not candidate_id and candidate_name:
                apps = ashby.get_active_applications()
                for app in apps:
                    if candidate_name.lower() in app.get("candidate", {}).get("name", "").lower():
                        candidate_id = app.get("candidate", {}).get("id")
                        candidate_name = app.get("candidate", {}).get("name")
                        break
                if not candidate_id:
                    return json.dumps({"error": f"No candidate found matching '{candidate_name}'"})

            if not candidate_id:
                return json.dumps({"error": "Either candidate_id or candidate_name is required"})

            # Find job
            job = ashby.get_job_by_title(job_title)
            if not job:
                return json.dumps({"error": f"No job found matching '{job_title}'"})

            return json.dumps({
                "action": "apply_candidate_to_job",
                "requires_confirmation": True,
                "candidate_id": candidate_id,
                "candidate_name": candidate_name,
                "job_id": job.get("id"),
                "job_title": job.get("title"),
                "message": f"Ready to apply {candidate_name or candidate_id} to {job.get('title')}"
            })

        elif tool_name == "get_candidate_offer":
            candidate_name = tool_input.get("candidate_name")
            application_id = tool_input.get("application_id")

            # Find application if only candidate name provided
            if not application_id and candidate_name:
                apps = ashby.get_active_applications()
                for app in apps:
                    if candidate_name.lower() in app.get("candidate", {}).get("name", "").lower():
                        application_id = app.get("id")
                        break
                if not application_id:
                    return json.dumps({"error": f"No application found for '{candidate_name}'"})

            if not application_id:
                return json.dumps({"error": "Either application_id or candidate_name is required"})

            offer = ashby.get_offer_by_application(application_id)
            if not offer:
                return json.dumps({"message": "No offer found for this candidate"})

            return json.dumps({
                "offer_id": offer.get("id"),
                "status": offer.get("status"),
                "start_date": offer.get("startDate"),
                "created_at": offer.get("createdAt")
            }, indent=2)

        elif tool_name == "get_application_history":
            candidate_name = tool_input.get("candidate_name")
            application_id = tool_input.get("application_id")

            # Find application if only candidate name provided
            if not application_id and candidate_name:
                apps = ashby.get_active_applications()
                for app in apps:
                    if candidate_name.lower() in app.get("candidate", {}).get("name", "").lower():
                        application_id = app.get("id")
                        break
                if not application_id:
                    return json.dumps({"error": f"No application found for '{candidate_name}'"})

            if not application_id:
                return json.dumps({"error": "Either application_id or candidate_name is required"})

            history = ashby.get_application_history(application_id)
            return json.dumps(history, indent=2, default=str)

        elif tool_name == "get_application_feedback":
            candidate_name = tool_input.get("candidate_name")
            application_id = tool_input.get("application_id")

            # Find application if only candidate name provided
            if not application_id and candidate_name:
                apps = ashby.get_active_applications()
                for app in apps:
                    if candidate_name.lower() in app.get("candidate", {}).get("name", "").lower():
                        application_id = app.get("id")
                        break
                if not application_id:
                    return json.dumps({"error": f"No application found for '{candidate_name}'"})

            if not application_id:
                return json.dumps({"error": "Either application_id or candidate_name is required"})

            feedback = ashby.get_application_feedback(application_id)
            if not feedback:
                return json.dumps({"message": "No feedback found for this application"})

            results = []
            for fb in feedback:
                results.append({
                    "feedback_id": fb.get("id"),
                    "rating": fb.get("rating"),
                    "submitted_by": fb.get("submittedBy", {}).get("name"),
                    "submitted_at": fb.get("submittedAt"),
                    "interview_stage": fb.get("interviewStage", {}).get("title"),
                    "notes": fb.get("notes")
                })
            return json.dumps(results, indent=2, default=str)

        elif tool_name == "get_candidates_by_source":
            source_filter = tool_input.get("source_filter")
            by_source = ashby.get_applications_by_source(source_filter)
            results = {}
            for source, apps in by_source.items():
                results[source] = []
                for app in apps[:10]:  # Limit per source
                    results[source].append({
                        "name": app.get("candidate", {}).get("name"),
                        "job": app.get("job", {}).get("title"),
                        "stage": app.get("currentInterviewStage", {}).get("title")
                    })
            return json.dumps(results, indent=2)

        elif tool_name == "generate_report":
            report_type = tool_input.get("report_type")
            report = ashby.generate_report(report_type)
            if not report:
                return json.dumps({"error": f"Could not generate report of type '{report_type}'"})
            return json.dumps(report, indent=2, default=str)

        elif tool_name == "get_candidate_scorecard":
            candidate_id = tool_input.get("candidate_id")
            candidate_name = tool_input.get("candidate_name")

            # Find candidate if only name provided
            if not candidate_id and candidate_name:
                apps = ashby.get_active_applications()
                for app in apps:
                    if candidate_name.lower() in app.get("candidate", {}).get("name", "").lower():
                        candidate_id = app.get("candidate", {}).get("id")
                        candidate_name = app.get("candidate", {}).get("name")
                        break
                if not candidate_id:
                    return json.dumps({"error": f"No candidate found matching '{candidate_name}'"})

            if not candidate_id:
                return json.dumps({"error": "Either candidate_id or candidate_name is required"})

            # Get full context
            context = ashby.get_candidate_full_context(candidate_id)
            candidate_info = context.get("candidate", {})
            actual_name = candidate_info.get("name", candidate_name or "Unknown")

            # Build scorecard summary
            scorecard = {
                "candidate": actual_name,
                "current_stage": None,
                "job": None,
                "interviews": []
            }

            for app_data in context.get("applications", []):
                app = app_data.get("application", {})
                scorecard["current_stage"] = app.get("currentInterviewStage", {}).get("title")
                scorecard["job"] = app.get("job", {}).get("title")

                # Process feedback/scorecards
                for fb in app_data.get("feedback", []):
                    interview_entry = {
                        "stage": fb.get("interviewStage", {}).get("title", "Unknown Stage"),
                        "interviewer": fb.get("submittedBy", {}).get("name", "Unknown"),
                        "submitted_at": fb.get("submittedAt"),
                        "rating": None,
                        "overall_rating": None,
                        "recommendation": None,
                        "notes_summary": None
                    }

                    # Extract rating - could be in different places depending on form
                    # Common fields: overallRating, rating, overallRecommendation
                    interview_entry["rating"] = fb.get("rating") or fb.get("overallRating")
                    interview_entry["overall_rating"] = fb.get("overallRating")
                    interview_entry["recommendation"] = fb.get("overallRecommendation") or fb.get("recommendation")

                    # Check submittedValues for structured feedback
                    submitted = fb.get("submittedValues", {})
                    if isinstance(submitted, dict):
                        # Look for common rating field names
                        for key in ["overallRating", "rating", "score", "Overall Rating", "Overall Score"]:
                            if key in submitted and submitted[key]:
                                interview_entry["rating"] = submitted[key]
                                break
                        # Look for recommendation
                        for key in ["recommendation", "overallRecommendation", "Recommendation", "Hiring Recommendation"]:
                            if key in submitted and submitted[key]:
                                interview_entry["recommendation"] = submitted[key]
                                break

                    # Get notes summary (first 200 chars)
                    notes = fb.get("notes") or fb.get("submittedValues", {}).get("notes", "")
                    if notes and isinstance(notes, str):
                        interview_entry["notes_summary"] = notes[:200] + "..." if len(notes) > 200 else notes

                    scorecard["interviews"].append(interview_entry)

                # Also include scheduled/completed interviews from interview events
                for interview in app_data.get("interviews", []):
                    # Check if we already have feedback for this stage
                    stage_title = interview.get("interviewStage", {}).get("title")
                    existing = [i for i in scorecard["interviews"] if i.get("stage") == stage_title]
                    if not existing:
                        interview_entry = {
                            "stage": stage_title or "Scheduled Interview",
                            "interviewer": ", ".join([i.get("name", "") for i in interview.get("interviewers", [])]),
                            "scheduled_time": interview.get("startTime"),
                            "status": interview.get("status", "scheduled"),
                            "rating": None,
                            "recommendation": None,
                            "notes_summary": "(No feedback submitted yet)"
                        }
                        scorecard["interviews"].append(interview_entry)

            # Sort interviews by date if available
            scorecard["interviews"].sort(
                key=lambda x: x.get("submitted_at") or x.get("scheduled_time") or "",
                reverse=False
            )

            return json.dumps(scorecard, indent=2, default=str)

        else:
            return json.dumps({"error": f"Unknown tool: {tool_name}"})

    except Exception as e:
        logger.error(f"Tool execution error: {e}")
        # Sanitize error message to prevent secret exposure
        safe_error = sanitize_error(e)
        return json.dumps({"error": safe_error})


def process_message_with_claude(
    user_message: str,
    slack_user_id: str,
    channel_id: str,
    thread_ts: str
) -> Dict[str, Any]:
    """
    Send message to Claude and process tool calls with conversation memory.
    Returns dict with 'text' and optionally 'pending_action' for confirmation flow.
    """

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

    # Track if we have a pending action requiring confirmation
    pending_action_data = None

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

            # Check if this tool result requires confirmation
            try:
                result_data = json.loads(result)
                if result_data.get("requires_confirmation"):
                    pending_action_data = result_data
                    logger.info(f"Action requires confirmation: {result_data.get('action')}")
            except (json.JSONDecodeError, TypeError):
                pass

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
    response_text = "\n".join(text_blocks)

    # Return result with pending action if any
    result = {"text": response_text}
    if pending_action_data:
        result["pending_action"] = pending_action_data
        result["user_id"] = slack_user_id

    return result


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

    # Rate limiting check
    if not rate_limiter.is_allowed(user_id):
        remaining_wait = 60  # Approximate wait time
        say(
            text=f"You've sent too many requests. Please wait ~{remaining_wait}s before trying again.",
            thread_ts=thread_ts
        )
        logger.warning(f"Rate limit exceeded for user {user_id}")
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
        result = process_message_with_claude(
            user_message=clean_text,
            slack_user_id=user_id,
            channel_id=channel_id,
            thread_ts=thread_ts
        )

        response_text = result.get("text", "")

        # Send response (in thread if in a thread)
        msg_response = client.chat_postMessage(
            channel=channel_id,
            thread_ts=thread_ts,
            text=response_text
        )

        # If there's a pending action requiring confirmation, add emoji reactions
        if result.get("pending_action"):
            message_ts = msg_response.get("ts")
            if message_ts:
                # Store the pending action
                pending_actions.store(
                    message_ts=message_ts,
                    channel_id=channel_id,
                    action_data=result["pending_action"],
                    user_id=user_id
                )

                # Add reaction buttons
                try:
                    client.reactions_add(
                        channel=channel_id,
                        timestamp=message_ts,
                        name="white_check_mark"
                    )
                    client.reactions_add(
                        channel=channel_id,
                        timestamp=message_ts,
                        name="x"
                    )
                except Exception as react_error:
                    logger.warning(f"Could not add reaction emojis: {react_error}")

    except Exception as e:
        logger.error(f"Error processing message: {e}", exc_info=True)
        # Sanitize error to prevent secret exposure
        safe_error = sanitize_error(e)
        say(
            text=f"Sorry, I encountered an error: {safe_error}",
            thread_ts=thread_ts
        )


def execute_confirmed_action(action_data: Dict) -> str:
    """Execute an action that has been confirmed by the user."""
    action_type = action_data.get("action")

    try:
        if action_type == "add_note":
            result = ashby.add_note(
                candidate_id=action_data.get("candidate_id"),
                note=action_data.get("note")
            )
            return f"Note added successfully to candidate."

        elif action_type == "move_stage":
            result = ashby.move_to_stage(
                application_id=action_data.get("application_id"),
                stage_id=action_data.get("stage_id")
            )
            return f"Candidate moved to {action_data.get('stage_name')}."

        elif action_type == "create_candidate":
            result = ashby.create_candidate(
                name=action_data.get("name"),
                email=action_data.get("email"),
                phone=action_data.get("phone"),
                linkedin_url=action_data.get("linkedin_url"),
                location=action_data.get("location")
            )
            msg = f"Candidate {action_data.get('name')} created."
            # Apply to job if specified
            if action_data.get("job_title"):
                job = ashby.get_job_by_title(action_data.get("job_title"))
                if job and result.get("id"):
                    ashby.create_application(result.get("id"), job.get("id"))
                    msg += f" Applied to {action_data.get('job_title')}."
            return msg

        elif action_type == "schedule_interview":
            result = ashby.schedule_interview(
                application_id=action_data.get("application_id"),
                interviewer_user_id=action_data.get("interviewer_id"),
                start_time=action_data.get("start_time"),
                duration_minutes=action_data.get("duration_minutes", 60),
                interview_type=action_data.get("interview_type", "video"),
                meeting_link=action_data.get("meeting_link"),
                location=action_data.get("location")
            )
            return f"Interview scheduled with {action_data.get('interviewer_name')}."

        elif action_type == "cancel_interview":
            result = ashby.cancel_interview(action_data.get("interview_id"))
            return "Interview cancelled."

        elif action_type == "reschedule_interview":
            result = ashby.update_interview(
                interview_schedule_id=action_data.get("interview_id"),
                start_time=action_data.get("new_start_time"),
                duration_minutes=action_data.get("new_duration_minutes"),
                interviewer_user_ids=[action_data.get("new_interviewer_id")] if action_data.get("new_interviewer_id") else None,
                location=action_data.get("new_location"),
                meeting_link=action_data.get("new_meeting_link")
            )
            return "Interview rescheduled."

        elif action_type == "create_offer":
            result = ashby.create_offer(
                application_id=action_data.get("application_id"),
                start_date=action_data.get("start_date")
            )
            return "Offer created."

        elif action_type == "reject_application":
            result = ashby.reject_application(
                application_id=action_data.get("application_id"),
                reason=action_data.get("reason")
            )
            return f"Application rejected for {action_data.get('candidate_name', 'candidate')}."

        elif action_type == "archive_candidate":
            result = ashby.archive_candidate(
                candidate_id=action_data.get("candidate_id"),
                reason=action_data.get("reason")
            )
            return f"Candidate {action_data.get('candidate_name', '')} archived."

        elif action_type == "apply_candidate_to_job":
            result = ashby.create_application(
                candidate_id=action_data.get("candidate_id"),
                job_id=action_data.get("job_id")
            )
            return f"Applied {action_data.get('candidate_name', 'candidate')} to {action_data.get('job_title')}."

        else:
            return f"Unknown action type: {action_type}"

    except Exception as e:
        logger.error(f"Error executing confirmed action: {e}")
        return f"Failed to execute: {sanitize_error(e)}"


@app.event("reaction_added")
def handle_reaction(event: Dict, say, client: WebClient):
    """Handle emoji reactions for confirmations."""
    reaction = event.get("reaction")
    user_id = event.get("user")
    item = event.get("item", {})
    channel_id = item.get("channel")
    message_ts = item.get("ts")

    # Only process confirmation emojis
    if reaction not in ["white_check_mark", "x"]:
        return

    logger.info(f"Reaction {reaction} from {user_id} on message {message_ts}")

    # Look up pending action
    pending = pending_actions.get(channel_id, message_ts)
    if not pending:
        # No pending action for this message
        return

    # Security: Only the user who initiated the action can confirm
    if pending.get("user_id") != user_id:
        logger.warning(f"User {user_id} tried to confirm action by {pending.get('user_id')}")
        return

    # Remove the pending action
    action_data = pending_actions.remove(channel_id, message_ts)
    if not action_data:
        return

    action = action_data.get("action", {})

    # Get thread_ts for replying in thread
    # Need to fetch original message to get thread_ts
    try:
        msg_result = client.conversations_history(
            channel=channel_id,
            latest=message_ts,
            inclusive=True,
            limit=1
        )
        thread_ts = message_ts
        if msg_result.get("messages"):
            thread_ts = msg_result["messages"][0].get("thread_ts", message_ts)
    except Exception:
        thread_ts = message_ts

    if reaction == "white_check_mark":
        # Execute the confirmed action
        result_msg = execute_confirmed_action(action)
        client.chat_postMessage(
            channel=channel_id,
            thread_ts=thread_ts,
            text=f"Done: {result_msg}"
        )
    else:  # "x" reaction
        client.chat_postMessage(
            channel=channel_id,
            thread_ts=thread_ts,
            text="Action cancelled."
        )


def main():
    """Start the Slack bot."""
    logger.info("Starting Ashby Slack Bot...")
    logger.info(f"Safety mode: {SAFETY_MODE}")
    logger.info(f"Allowed channels: {ALLOWED_CHANNELS if ALLOWED_CHANNELS[0] else 'ALL'}")

    handler = SocketModeHandler(app, SLACK_APP_TOKEN)
    handler.start()


if __name__ == "__main__":
    main()
