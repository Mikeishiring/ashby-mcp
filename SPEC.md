# Ashby MCP Server - Project Specification

## Overview
An MCP (Model Context Protocol) server that enables Claude Desktop to interact with Ashby ATS, providing natural language access to recruiting pipeline management.

## Current Status: MVP (Working Features)

### ✅ Core Read Operations
- View full pipeline overview (candidates by stage and job)
- Search candidates by name/email
- Get candidates by job, stage, or source
- Get detailed candidate information and notes
- Fetch job descriptions and open positions
- Pipeline statistics and velocity metrics

### ✅ Core Write Operations
- Add notes to candidate profiles (auto-tagged with `[via Claude]`)
- Move candidates between interview stages (with safety limits)

### ✅ Safety & Security
- PII redaction for non-admin users
- Access level controls (READ_ONLY, COMMENT_ONLY, FULL_WRITE)
- Batch operation limits (max 5 candidates per operation)
- Hired candidate protection

## Future Roadmap (Not Yet Implemented)

### 🚀 Advanced Features (Planned)
- **Candidate Review Against JD**: LLM-assisted evaluation of candidates against job requirements
- **Decision Support**: Identify candidates needing hiring decisions, side-by-side comparisons
- **Advanced Analytics**: Deeper pipeline velocity trends, conversion analysis, source effectiveness
- **Interview Management**: Clash detection, rescheduling workflows, panel management
- **Offer Management**: Benchmarking, approval chains, template generation

### 🤖 AI-Powered Features (Future Vision)
- **Sentiment Analysis**: Automated analysis of candidate feedback
- **Job Post Optimization**: AI suggestions for improving job descriptions
- **Automated Pre-screening**: Intelligent candidate qualification
- **Predictive Analytics**: Time-to-hire forecasting, bottleneck identification

### 🔗 Integration Features (Future)
- **Slack Bot Integration**: Native Slack interface for team collaboration
- **Calendar Integration**: Interview scheduling with Google Calendar/Outlook
- **Agency Portal Sync**: Automated updates to external recruiting agencies
- **Webhook Notifications**: Real-time alerts for pipeline changes

## Technical Details

### Stack
- Language: Python
- Protocol: MCP (stdio transport)
- API: Ashby REST API

### Project Location
`C:\Projects\ashby-mcp\`

### Configuration
- API key via environment variable: `ASHBY_API_KEY`
- Stale threshold configurable (default: 14 days)

### Claude Desktop Integration
```json
{
  "mcpServers": {
    "ashby": {
      "command": "python",
      "args": ["C:\\Projects\\ashby-mcp\\server.py"],
      "env": {
        "ASHBY_API_KEY": "your-key-here"
      }
    }
  }
}
```

## Currently Implemented MCP Tools

### ✅ Pipeline & Overview
- `ashby_pipeline_overview` - Full pipeline summary by stage and job
- `ashby_stale_candidates` - Candidates stuck >14 days in stage
- `ashby_recent_applications` - New candidates in last N days
- `ashby_pipeline_stats` - Velocity metrics and conversion rates

### ✅ Search & Discovery
- `ashby_search_candidates` - Search by name or email
- `ashby_candidates_by_job` - All candidates for a specific job
- `ashby_candidates_by_stage` - All candidates in a specific stage
- `ashby_candidates_by_source` - Filter by application source

### ✅ Candidate Details
- `ashby_candidate_details` - Full info on a specific candidate
- `ashby_candidate_notes` - All notes/feedback for a candidate
- `ashby_candidate_full_context` - Comprehensive candidate profile
- `ashby_application_history` - Stage-by-stage timeline
- `ashby_application_feedback` - Interview feedback and scorecards

### ✅ Jobs
- `ashby_open_jobs` - List all open positions
- `ashby_job_details` - Job description and requirements
- `ashby_candidates_for_review` - Candidates with JD context

### ✅ Actions
- `ashby_add_note` - Add notes to candidate profiles
- `ashby_move_stage` - Move candidates between stages
- `ashby_batch_move` - Move up to 5 candidates at once

### ✅ Analysis & Decision Support
- `ashby_compare_candidates` - Side-by-side candidate comparison
- `ashby_needs_decision` - Candidates waiting on hiring decisions

### 🚧 Mock/Placeholder Tools (Return Sample Data)
The following tools are implemented but return mock data:
- `ashby_candidate_sentiment_analysis`
- `ashby_interview_clash_detector`
- `ashby_hiring_velocity_trends`
- `ashby_job_post_optimizer`
- And ~15 others (see server.py for full list)

## User Context
- Team size: Small (2-3 people), but primarily personal use
- Open jobs: 6 active positions
- Pipeline size: ~911 active candidates, 828 in Application Review
- Workflow: Mix of daily scan and ad-hoc queries

---

## Slack Bot Integration (MVP Specification)

### Overview
A Slack bot that provides team access to Ashby ATS via natural language in a dedicated channel. The bot uses Claude API (Anthropic) for intelligence and reuses the existing MCP server's Ashby client for data access.

### Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│     Slack       │────▶│   Slack Bot     │────▶│   Claude API    │────▶│   Ashby API     │
│   (Channel)     │◀────│   (Railway)     │◀────│   (Anthropic)   │◀────│                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘     └─────────────────┘
        │                       │
        │                       │
   @AshbyBot               Python app
   mentions               (slack_bot.py)
```

**Components:**
1. **Slack App**: Bot token, event subscriptions for @mentions
2. **Bot Server**: Python app hosted on Railway, receives Slack events
3. **Claude API**: Anthropic API for LLM intelligence (company account)
4. **Ashby Client**: Reused from existing MCP server (`ashby_client.py`)

### MVP Scope

#### ✅ In Scope (MVP)
- **Single channel deployment**: Bot invited to one channel for testing
- **@mention interaction**: `@AshbyBot who's stale in the pipeline?`
- **Read operations**: All existing MCP read tools
- **Write operations with confirmation**: Add notes, move candidates (emoji confirmation)
- **Daily summary**: Scheduled post of stale candidates + decisions needed
- **Stateless**: No memory between conversations

#### ❌ Out of Scope (MVP)
- DMs with the bot
- Per-user permissions (anyone in channel can interact)
- Candidate rejection with emails
- Interview scheduling
- Resume scanning/auto-qualification
- Memory/context across conversations

### Safety Controls

#### Write Operation Limits
Two modes (configurable via environment variable `SAFETY_MODE`):

| Mode | Behavior |
|------|----------|
| `BATCH_LIMIT` | Max 2 candidates per write operation |
| `CONFIRM_ALL` | Every write requires emoji confirmation |

**Default**: `CONFIRM_ALL` for MVP

#### Hired Candidate Protection
- Candidates with `status=hired` or stage containing "hired" are locked
- Bot will refuse to return information about hired candidates
- Prevents employees from querying themselves

#### Confirmation Flow (Destructive Actions)
```
User: @AshbyBot move John Doe to Phone Screen

Bot: I'm about to move John Doe (john@example.com) to Phone Screen.
     React with ✅ to confirm or ❌ to cancel.

User: [reacts with ✅]

Bot: ✅ Done! John Doe has been moved to Phone Screen.
```

**Roadmap improvement**: Replace emoji reactions with threaded replies for audit trail (emojis can be un-reacted, losing confirmation history).

### Slack App Setup

#### Requirements
- Slack Business+ plan (you have this)
- No Enterprise required for custom bots
- Bot tokens are free (no per-user cost)

#### Slack App Configuration
1. Create Slack App at https://api.slack.com/apps
2. Enable **Socket Mode** (simpler than webhooks for MVP)
3. Add **Bot Token Scopes**:
   - `app_mentions:read` - Receive @mentions
   - `chat:write` - Send messages
   - `reactions:read` - Read emoji confirmations
   - `channels:history` - Read channel messages (for context)
4. Enable **Event Subscriptions**:
   - `app_mention` - Triggered when bot is @mentioned
5. Install to workspace, invite bot to channel

#### Why Socket Mode?
- No public URL needed (Railway can use it)
- Simpler setup than webhooks
- Good for MVP, can migrate to webhooks later for scale

### Hosting: Railway

#### Why Railway over Render?
- **Simpler deployment**: Git push to deploy
- **Cost-efficient**: Usage-based, scales to zero when idle
- **Good enough security**: SOC 2 Type II, encrypted at rest
- **Easy secrets management**: Environment variables in dashboard

Railway pricing: ~$5/month for low-traffic bot

#### Data Privacy Considerations
- **No candidate PII stored on Railway**: Bot is stateless, processes in memory only
- **Ashby API key stored as Railway secret**: Encrypted, not in code
- **Claude API calls**: Data sent to Anthropic (check Anthropic's data policy)
- **Slack messages**: Stored in Slack (your workspace controls retention)

**Risk assessment**: Low risk for MVP. Candidate data flows through but isn't persisted. If compliance becomes a concern, consider self-hosted or BYOC options.

### Environment Variables

```bash
# Slack
SLACK_BOT_TOKEN=xoxb-...
SLACK_APP_TOKEN=xapp-...  # For Socket Mode

# Anthropic
ANTHROPIC_API_KEY=sk-ant-...

# Ashby
ASHBY_API_KEY=...

# Safety
SAFETY_MODE=CONFIRM_ALL  # or BATCH_LIMIT
BATCH_LIMIT=2

# Optional
DAILY_SUMMARY_TIME=09:00  # 24hr format, timezone TBD
DAILY_SUMMARY_CHANNEL=C0123456789  # Channel ID
```

### Daily Summary (Scheduled Task)

**Trigger**: Cron job at configured time (e.g., 9 AM)

**Content**:
```
📊 *Daily Pipeline Summary*

*Stale Candidates* (>14 days without movement):
• Jane Smith - Recruiter Screen (18 days) - Senior Backend
• Bob Jones - Technical Interview (15 days) - Product Manager

*Needs Decision*:
• Alice Lee - Final Round (5 days) - Senior Backend
• Carlos Garcia - Offer Stage (3 days) - Product Manager

*Quick Stats*:
• 45 active candidates across 6 open roles
• 3 new applications yesterday

Reply to this thread or @AshbyBot with questions!
```

### Resume Scanning (Roadmap)

**Ashby API supports this** via:
1. `candidate.info` returns `resumeFileHandle`
2. `file.info` with the handle returns a download URL
3. Download PDF, parse with LLM

**MVP deferral reason**: Adds complexity (PDF parsing, storage, LLM costs). Focus on core interactions first.

### Rejection Flow (Roadmap)

**Requirements gathered**:
- 4 rejection email templates in Ashby (based on how much you like them)
- Bot should ask which template to use
- Preview email before sending

**Flow**:
```
User: @AshbyBot reject John Doe

Bot: Which rejection template would you like to use for John Doe?
     1. ⭐ Strong - "Great candidate, not right for this role"
     2. 📋 Standard - "Thank you for your interest"
     3. 📝 Brief - "Position has been filled"
     4. 🚫 No fit - "Not a match for our requirements"

User: 2

Bot: Here's the email that will be sent to john@example.com:
     [Preview of template 2]
     React with ✅ to send or ❌ to cancel.
```

### Interview Scheduling (Roadmap)

**Flow**:
```
User: @AshbyBot schedule phone screen for John Doe

Bot: I'll send John Doe the scheduling link for Phone Screen.
     Email preview:
     [Template with calendar link]
     React with ✅ to send or ❌ to cancel.
```

**Dependency**: Need to understand Ashby's interview scheduling API and calendar integration.

---

## Roadmap Summary

### Phase 1: MVP (Current Sprint)
- [x] Existing MCP server with read/write tools
- [ ] Slack bot with @mention interaction
- [ ] Emoji-based confirmation for writes
- [ ] Daily summary post
- [ ] Deploy to Railway

### Phase 2: Enhanced Interactions
- [ ] Threaded replies for audit trail (replace emoji confirmations)
- [ ] Per-user permissions based on Slack user
- [ ] Memory/context across conversations (database)
- [ ] Rejection flow with template selection

### Phase 3: Automation
- [ ] Resume scanning and auto-qualification
- [ ] Rule-based auto-actions ("if resume mentions X, move forward")
- [ ] Interview scheduling with calendar links
- [ ] Proactive notifications (candidate stuck, decision needed)

### Phase 4: Scale
- [ ] Multi-channel support
- [ ] DM support
- [ ] Multi-tenant (multiple companies)
- [ ] Webhook-based events (replace Socket Mode)
- [ ] Other ATS integrations (Greenhouse, Lever, etc.)

---

## Open Questions

1. **Daily summary time**: What time zone? What time of day?
2. **Confirmation timeout**: How long to wait for emoji reaction before canceling?
3. **Error messages**: How verbose should errors be in Slack?
4. **Rate limits**: Ashby API rate limits? Slack event limits?

---

## Future Considerations (Unchanged)
- **Automated Exports**: Daily reports to Obsidian/Notion
- **Push Notifications**: Alerts for stale candidates and decisions needed
- **Calendar Integration**: Interview scheduling with calendar systems
- **Agency Portal Sync**: Automated updates to external recruiting agencies

---
Generated: 2026-01-13
Updated: 2026-01-19 (Slack Integration MVP spec added)
