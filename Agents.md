# Ashby Agent Architecture

This document describes the architecture and operational flow of the Ashby Slack recruiting assistant.

## System Overview

The assistant lives in Slack and uses Claude (Anthropic) for reasoning, with Ashby as the source of truth.

```mermaid
graph TD
    User[User / Recruiter] <--> Slack[Slack Channel]
    Slack <--> Bot[Slack Bot (Bolt, Socket Mode)]
    Bot <--> Claude[Claude Agent]
    Claude <--> Tools[Tool Executor + Safety]
    Tools <--> Ashby[Ashby Service + Client]
    Ashby <--> API[Ashby REST API]
```

## Core Architecture

### 1. Slack Interface (`src/slack/bot.ts`)
- Listens for @mentions in channels
- Handles emoji confirmations and triage reactions
- Posts replies, summaries, and alerts

### 2. AI Layer (`src/ai/*`)
- Tool definitions (`tools.ts`) describe 52 available actions (37 read, 15 write)
- Agent (`agent.ts`) manages Claude tool use
- Executor (`executor.ts`) validates inputs and calls services
- Includes proactive analysis tools (`analyze_candidate_status`, `analyze_candidate_blockers`)

### 3. Service Layer (`src/ashby/*`)
- `client.ts` handles Ashby API requests (45 endpoints), pagination, and caching
- `service.ts` provides higher-level workflows and analysis

### 4. Safety (`src/safety/*`)
- Confirmation manager tracks pending write actions
- Safety guards block hired candidates and enforce batch limits

### 5. Scheduling & Extras
- `src/scheduler/*` handles daily summaries and pipeline alerts
- `src/reminders/*` schedules Slack reminders
- `src/triage/*` supports review-only triage sessions with emoji reactions (✅/❌/🤔)

## Operational Flow

1. User @mentions the bot in Slack
2. Claude selects tools based on the request
3. Safety checks run before any write action
4. Bot asks for ✅ confirmation when required
5. Ashby API executes the requested action

## Constraints
- Ashby is the source of truth; no local database
- Hired candidates are blocked for reads and writes
- Triage is review-only; no changes are applied automatically

## Legacy Notes
Python files in the repository are legacy or experimental and are not used by the TypeScript Slack bot runtime.
