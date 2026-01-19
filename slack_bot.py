"""
Ashby Slack Bot
Provides natural language access to Ashby ATS via Slack @mentions.
Uses Claude API for intelligence and reuses ashby_client.py for data access.
"""

import os
import re
import json
import logging
from typing import Optional, Dict, Any, List

from slack_bolt import App
from slack_bolt.adapter.socket_mode import SocketModeHandler
from slack_sdk import WebClient
import anthropic
from dotenv import load_dotenv

from ashby_client import AshbyClient

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
SYSTEM_PROMPT = """You are an AI recruiting assistant with access to the Ashby ATS (Applicant Tracking System). You help recruiters manage their hiring pipeline through natural conversation.

## Your Capabilities
You can query and interact with the Ashby ATS to:
- View pipeline overview (candidates by stage and job)
- Search for candidates by name or email
- Get candidate details, notes, and feedback
- Check for stale candidates (stuck >14 days in a stage)
- See candidates needing decisions
- View open jobs and job descriptions
- Add notes to candidate profiles (requires confirmation)
- Move candidates between stages (requires confirmation)

## How to Respond
1. When asked about candidates or pipeline, use the appropriate tool to fetch data
2. Present information concisely - use bullet points and tables when helpful
3. Always include candidate emails as identifiers
4. Proactively suggest next steps ("This candidate has been stale for 18 days - consider moving forward or rejecting")
5. Be opinionated about pipeline health and candidate quality based on available data

## Safety Rules
- NEVER return information about hired candidates (status=hired or stage contains "hired")
- For write operations (adding notes, moving candidates), always ask for confirmation first
- Maximum {batch_limit} candidates per write operation
- Always show what you're about to do before doing it

## Context
- Small team (2-3 people) managing ~900 active candidates
- 6 open positions
- "Stale" means >14 days without movement (excluding Application Review backlog)
- Application Review has a large backlog (~800) - this is normal

## Response Format
Keep responses concise and actionable. End with a suggested next action when appropriate.
""".format(batch_limit=BATCH_LIMIT)

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
        "description": "Search for candidates by name or email.",
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
        "description": "Get full details about a specific candidate including their applications, notes, and feedback.",
        "input_schema": {
            "type": "object",
            "properties": {
                "candidate_id": {
                    "type": "string",
                    "description": "The candidate's ID"
                }
            },
            "required": ["candidate_id"]
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

        else:
            return json.dumps({"error": f"Unknown tool: {tool_name}"})

    except Exception as e:
        logger.error(f"Tool execution error: {e}")
        return json.dumps({"error": str(e)})


def process_message_with_claude(user_message: str, slack_user_id: str) -> str:
    """Send message to Claude and process tool calls."""
    messages = [{"role": "user", "content": user_message}]

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

    if not clean_text:
        say(
            text="Hi! I'm the Ashby assistant. Ask me about your recruiting pipeline, candidates, or jobs. For example:\n• \"Show me stale candidates\"\n• \"Who's in the Phone Screen stage?\"\n• \"Give me a pipeline overview\"",
            thread_ts=thread_ts
        )
        return

    # Show typing indicator
    try:
        # Process with Claude
        logger.info(f"Processing message from {user_id}: {clean_text}")
        response = process_message_with_claude(clean_text, user_id)

        # Send response (in thread if in a thread)
        say(text=response, thread_ts=thread_ts)

    except Exception as e:
        logger.error(f"Error processing message: {e}")
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
