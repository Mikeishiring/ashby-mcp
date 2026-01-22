# Architecture

## Overview
The bot is a TypeScript Slack application that uses Claude (Anthropic) to interpret requests and an Ashby API client to execute reads and writes.

```
Slack User
  -> Slack Bot (Bolt, Socket Mode)
  -> Claude Agent (tool use)
  -> Tool Executor + Safety Guards
  -> Ashby Service + Client
  -> Ashby REST API
```

## Core Components
- `src/index.ts`: Entry point and wiring
- `src/slack/`: Slack Bolt app and message formatting
- `src/ai/`: Claude agent, tool definitions, and executor
- `src/safety/`: Write confirmations and read/write guards
- `src/ashby/`: Ashby API client and higher-level service layer
- `src/scheduler/`: Daily summaries and pipeline alerts
- `src/reminders/`: Slack scheduled reminders
- `src/triage/`: Review-only triage sessions

## Data Flow
1. User @mentions the bot in Slack
2. Claude interprets the request and selects tools
3. Tool executor validates input and safety checks
4. Ashby service fetches or updates data
5. Bot formats a Slack response (with confirmation for writes)

## Legacy Files
Python files in the repository are legacy or experimental and are not used by the TypeScript Slack bot runtime.
