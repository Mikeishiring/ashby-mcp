# Ashby MCP Server & Slack Bot

An MCP (Model Context Protocol) server that enables Claude Desktop to interact with your Ashby ATS, plus a Slack bot for team access. Query your recruiting pipeline, search candidates, add notes, and move candidates between stages - all through natural conversation.

## Components

This project has two components:

1. **MCP Server** (Python) - For Claude Desktop integration
2. **Slack Bot** (TypeScript) - For team access via Slack

---

## Slack Bot (TypeScript)

A Slack bot that provides natural language access to Ashby ATS using Claude AI.

### Features

- **@mention interaction** - `@AshbyBot who's stale in the pipeline?`
- **Thread memory** - Remembers context within conversation threads
- **26 tools** - Full Ashby API coverage (see below)
- **Write operations with confirmation** - Add notes, move candidates, schedule interviews
- **Safety controls** - Batch limits, hired candidate protection, confirmation flows

### Available Tools (26 total)

**Search & Discovery**
- `search_candidates` - Search by name or email
- `get_candidate_details` - Full candidate info with history
- `get_candidates_by_job` - All candidates for a specific job
- `get_candidates_by_stage` - All candidates in a specific stage
- `get_candidates_by_source` - Filter by application source (LinkedIn, referral, etc.)
- `get_candidates_needing_decision` - Candidates waiting on hiring decisions

**Pipeline & Analytics**
- `get_pipeline_overview` - Full pipeline summary by stage and job
- `get_stale_candidates` - Candidates stuck >14 days in stage
- `get_recent_applications` - New candidates in last N days
- `get_pipeline_velocity` - Velocity metrics and conversion rates
- `generate_report` - Generate recruiting reports

**Jobs**
- `get_open_jobs` - List all open positions
- `get_job_details` - Job description and requirements
- `get_interview_stages` - Available interview stages

**Candidate Actions**
- `add_candidate_note` - Add notes (auto-tagged [via Claude])
- `move_candidate_stage` - Move candidates between stages
- `create_candidate` - Create new candidate
- `archive_candidate` - Remove from active pipeline
- `apply_candidate_to_job` - Apply existing candidate to different job
- `reject_application` - Reject/archive an application

**Interviews**
- `get_upcoming_interviews` - All scheduled interviews
- `schedule_interview` - Schedule new interview
- `reschedule_interview` - Change time/interviewer/location
- `cancel_interview` - Cancel scheduled interview

**Offers**
- `get_pending_offers` - Offers awaiting response
- `get_candidate_offer` - Get offer details for a candidate
- `create_offer` - Create new offer

**Team & Sources**
- `get_team_members` - List interviewers/hiring team
- `get_sources` - Candidate sources list

**History & Feedback**
- `get_application_history` - Stage transition timeline
- `get_application_feedback` - Interview feedback/scorecards

### Quick Start

```bash
# Install dependencies
npm install

# Copy environment template
cp .env.example .env
# Edit .env with your credentials

# Build
npm run build

# Run
npm start

# Development mode (with hot reload)
npm run dev
```

### Environment Variables

```bash
# Slack
SLACK_BOT_TOKEN=xoxb-...        # Bot User OAuth Token
SLACK_APP_TOKEN=xapp-...        # App-Level Token (for Socket Mode)

# Anthropic/Claude
ANTHROPIC_API_KEY=sk-ant-...

# Ashby
ASHBY_API_KEY=...

# Safety
SAFETY_MODE=CONFIRM_ALL         # or BATCH_LIMIT
BATCH_LIMIT=2

# Daily Summary (optional)
DAILY_SUMMARY_ENABLED=true
DAILY_SUMMARY_TIME=09:00
DAILY_SUMMARY_TIMEZONE=America/New_York
DAILY_SUMMARY_CHANNEL=C0123456789
```

### Slack App Setup

1. Create a Slack App at https://api.slack.com/apps
2. Enable **Socket Mode** in Settings
3. Add **Bot Token Scopes**:
   - `app_mentions:read`
   - `chat:write`
   - `reactions:read`
   - `reactions:write`
   - `channels:history`
4. Enable **Event Subscriptions** for `app_mention`
5. Install to workspace and invite bot to a channel

### Deploy to Railway

```bash
# Railway will use the Dockerfile automatically
railway up
```

---

## MCP Server (Python)

For Claude Desktop integration.

### Quick Start

```bash
pip install -r requirements.txt
```

### 2. Configure Claude Desktop

Open your Claude Desktop config file:
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`

Add the Ashby server:

```json
{
  "mcpServers": {
    "ashby": {
      "command": "python",
      "args": ["C:\\Projects\\ashby-mcp\\server.py"],
      "env": {
        "ASHBY_API_KEY": "YOUR_API_KEY_HERE"
      }
    }
  }
}
```

Replace `YOUR_API_KEY_HERE` with your Ashby API key.

### 3. Restart Claude Desktop

Close and reopen Claude Desktop. You should now see Ashby tools available.

## ✅ Working Tools (MVP)

### Pipeline & Overview
- **ashby_pipeline_overview** - Full pipeline summary by stage and job
- **ashby_stale_candidates** - Candidates stuck >14 days in stage
- **ashby_recent_applications** - New candidates in last N days
- **ashby_pipeline_stats** - Velocity metrics and conversion rates

### Search & Discovery
- **ashby_search_candidates** - Search by name or email
- **ashby_candidates_by_job** - All candidates for a specific job
- **ashby_candidates_by_stage** - All candidates in a specific stage
- **ashby_candidates_by_source** - Filter by application source

### Candidate Details
- **ashby_candidate_details** - Full info on a specific candidate
- **ashby_candidate_notes** - All notes/feedback for a candidate
- **ashby_candidate_full_context** - Complete candidate profile
- **ashby_application_history** - Stage-by-stage timeline
- **ashby_application_feedback** - Interview feedback

### Jobs
- **ashby_open_jobs** - List all open positions
- **ashby_job_details** - Job description and requirements
- **ashby_candidates_for_review** - Candidates with job description context

### Actions
- **ashby_add_note** - Add notes to candidates (auto-tagged [via Claude])
- **ashby_move_stage** - Move candidates between stages
- **ashby_batch_move** - Move up to 5 candidates at once (safety limit)

### Analysis & Decision Support
- **ashby_compare_candidates** - Side-by-side candidate comparison
- **ashby_needs_decision** - Candidates waiting on hiring decisions

## 🚧 Placeholder Tools (Mock Data Only)
Many advanced tools are implemented but return sample data. See SPEC.md for the complete list.

## Example Conversations

**"Give me a pipeline overview"**
> Shows total candidates, breakdown by stage and job, open positions

**"Who's stale in the pipeline?"**
> Lists candidates stuck >14 days (excluding Application Review backlog)

**"Show me recent applications for Senior Backend"**
> Candidates who applied in the last 7 days for that role

**"Find candidates with Rust experience"**
> Searches candidate names/emails (note: full-text search of resumes requires different approach)

**"Add a note to candidate abc123 saying we should schedule next week"**
> Adds timestamped note to their profile

## Getting Your API Key

1. Log into Ashby
2. Go to Admin → Developer Settings → API Keys
3. Create a new API key with appropriate permissions
4. Copy the key into your Claude Desktop config

## Security Notes

- Your API key is stored locally in the Claude Desktop config
- The server only runs when Claude Desktop is open
- Notes added via Claude are tagged with `[via Claude]` for auditability

## Troubleshooting

**"ASHBY_API_KEY environment variable required"**
- Make sure the API key is in your Claude Desktop config under `env`

**Tools not appearing in Claude**
- Restart Claude Desktop after editing config
- Check that Python path is correct
- Run `python server.py` manually to see any errors

**API errors**
- Verify your API key has the right permissions in Ashby
- Check Ashby's API status

## Architecture

The Ashby MCP server follows the Model Context Protocol:

- **MCP Server** (`server.py`): Exposes Ashby tools to AI assistants
- **Ashby Client** (`ashby_client.py`): Handles API calls, caching, and safety controls
- **Environment Mapping** (`setup_mapper.py`): Discovers Ashby configuration
- **Instructions** (`CLAUDE_INSTRUCTIONS.md`): Behavior guidelines for Claude Desktop

**Current Usage:** Claude Desktop only. Future Slack integration is planned but not implemented.

## Project Structure

```
ashby-mcp/
├── src/                       # TypeScript Slack bot source
│   ├── index.ts               # Main entry point
│   ├── config/                # Configuration & environment
│   ├── ashby/                 # Ashby API client & service
│   ├── ai/                    # Claude agent & tools
│   ├── slack/                 # Slack bot & formatters
│   ├── safety/                # Confirmations & guards
│   ├── scheduler/             # Daily summary scheduler
│   └── types/                 # TypeScript type definitions
├── dist/                      # Compiled JavaScript output
├── package.json               # Node.js dependencies
├── tsconfig.json              # TypeScript configuration
├── Dockerfile                 # Docker build for Railway
├── server.py                  # Python MCP server
├── ashby_client.py            # Python Ashby API client
├── CLAUDE_INSTRUCTIONS.md     # Claude Desktop behavior guidelines
├── SPEC.md                    # Specification & roadmap
├── Agents.md                  # Architecture documentation
└── README.md                  # This file
```
