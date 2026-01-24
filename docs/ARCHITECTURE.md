# Architecture

## Overview

The Ashby Recruiting Assistant is a TypeScript Slack application that uses Claude (Anthropic) to interpret natural language requests and an Ashby API client to execute reads and writes against the ATS.

```
Slack User
  → Slack Bot (Bolt, Socket Mode)
  → Claude Agent (tool use)
  → Tool Executor + Safety Guards
  → Ashby Service + Client
  → Ashby REST API
```

## Core Components

| Directory | Purpose |
|-----------|---------|
| `src/index.ts` | Entry point - wires together all services, handles graceful shutdown |
| `src/slack/` | Slack Bolt app, Socket Mode connection, Block Kit formatting |
| `src/ai/` | Claude agent, 51 tool definitions, tool executor |
| `src/safety/` | Write confirmations, batch limits, hired candidate guards |
| `src/ashby/` | REST API client with caching, high-level service layer |
| `src/scheduler/` | Daily summaries and pipeline alerts (cron-based) |
| `src/reminders/` | Slack scheduled reminders for candidates |
| `src/triage/` | Review-only rapid triage sessions |
| `src/config/` | Zod-validated environment configuration |
| `src/types/` | TypeScript type definitions |

## Data Flow

1. **Message Received** - User @mentions the bot in Slack
2. **Agent Processing** - Claude interprets request and selects tools
3. **Safety Validation** - Tool executor validates inputs and applies guards
4. **API Execution** - Ashby service fetches or updates data
5. **Response Formatting** - Bot formats Slack Block Kit response
6. **Confirmation (writes)** - Write operations wait for emoji confirmation

## Tool Categories

**51 total tools** (36 read, 15 write):

| Category | Tools | Examples |
|----------|-------|----------|
| Pipeline & Overview | 4 | `get_pipeline_overview`, `get_stale_candidates` |
| Search & Discovery | 2 | `search_candidates`, `get_candidates_for_job` |
| Candidate Details | 6 | `get_candidate_details`, `get_application_history` |
| Interview Management | 8 | `schedule_interview`, `reschedule_interview` |
| Offer Management | 7 | `create_offer`, `approve_offer`, `send_offer` |
| Feedback & Scoring | 3 | `get_candidate_scorecard`, `list_feedback_submissions` |
| Organization & Metadata | 8 | `list_candidate_tags`, `get_hiring_team` |
| Proactive Analysis | 2 | `analyze_candidate_status`, `analyze_candidate_blockers` |
| Write Operations | 11 | `add_note`, `move_candidate_stage`, `create_candidate` |

## Safety Mechanisms

1. **Confirmation Manager** - All write operations require emoji (✅) confirmation
2. **Batch Limits** - Max 2 candidates per batch operation (configurable)
3. **Hired Candidate Protection** - No access to hired candidates (privacy)
4. **Auto-tagged Notes** - All bot notes include `[via Slack Bot]` tag
5. **Timeout Protection** - Confirmations expire after 5 minutes

## Caching Strategy

| Data Type | TTL | Reason |
|-----------|-----|--------|
| Jobs | 5 minutes | Rarely change |
| Interview Stages | 10 minutes | Configuration data |
| Users | 5 minutes | Team membership stable |
| Candidates | 1 minute | Frequently updated |
| Applications | 1 minute | Active data |

## Error Handling

- Comprehensive try-catch with detailed error messages
- Graceful degradation (partial data shown when available)
- Request retry logic with exponential backoff (2 retries)
- Request timeout: 15 seconds

## Configuration

All configuration via environment variables, validated with Zod:

| Variable | Purpose | Default |
|----------|---------|---------|
| `ASHBY_API_KEY` | Ashby authentication | Required |
| `ANTHROPIC_API_KEY` | Claude API access | Required |
| `SLACK_BOT_TOKEN` | Slack bot token | Required |
| `SLACK_APP_TOKEN` | Socket Mode token | Required |
| `SAFETY_MODE` | `CONFIRM_ALL` or `BATCH_LIMIT` | `CONFIRM_ALL` |
| `BATCH_LIMIT` | Max batch operation size | 2 |
| `STALE_DAYS` | Days before candidate is "stale" | 14 |

## Scheduled Features

| Feature | Schedule | Purpose |
|---------|----------|---------|
| Daily Summary | Configurable (default 9am) | Pipeline overview to channel |
| Pipeline Alerts | Configurable | Stale/decision candidate notifications |
| Reminders | User-defined | Candidate follow-up reminders |

## Legacy Files

Python files in the repository (`server.py`, `ashby_client.py`, `setup_mapper.py`) are experimental MCP server implementations for Claude Desktop integration. They are not used by the TypeScript Slack bot runtime.

---

*Last Updated: 2026-01-24*
