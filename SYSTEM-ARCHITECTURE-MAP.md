# System Architecture & API Coverage Map

**Date:** 2026-01-20
**Purpose:** Visual map of current system architecture, API coverage, and common user workflows

---

## 1. System Flow Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                           USER (Slack)                               │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        SLACK BOT (Socket Mode)                       │
│  src/slack/bot.ts                                                    │
│  - Receives messages                                                 │
│  - Handles reactions (✅/❌ for confirmations)                       │
│  - Manages scheduled summaries                                       │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        CLAUDE AGENT (AI Layer)                       │
│  src/ai/agent.ts                                                     │
│  - System prompt (defines behavior)                                  │
│  - Tool execution loop                                               │
│  - Confirmation handling                                             │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        TOOL EXECUTOR                                 │
│  src/ai/executor.ts                                                  │
│  - Route tool calls to service methods                               │
│  - Handle confirmations for write operations                         │
│  - Resolve candidate IDs from names/emails                           │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        ASHBY SERVICE (Business Logic)                │
│  src/ashby/service.ts                                                │
│  - High-level operations                                             │
│  - Data enrichment                                                   │
│  - Multi-step workflows                                              │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        ASHBY CLIENT (API Layer)                      │
│  src/ashby/client.ts                                                 │
│  - Direct API calls to Ashby                                         │
│  - Pagination handling                                               │
│  - Caching (5 min TTL)                                               │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        ASHBY API (External)                          │
│  https://api.ashbyhq.com/                                            │
│  - 200+ endpoints available                                          │
│  - 33 endpoints currently implemented (16.5% coverage)               │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. Current API Coverage by Category

### 🟢 Well Covered (>50% implementation)

| Category | Total Endpoints | Implemented | Coverage | Tools |
|----------|----------------|-------------|----------|-------|
| **Candidates** | 8 | 6 | 75% | search_candidates, get_candidate, get_candidate_scorecard, create_candidate, etc. |
| **Applications** | 10 | 5 | 50% | search_applications, get_application, move_candidate_stage, add_note |
| **Jobs** | 6 | 3 | 50% | list_jobs, get_job, search_jobs_by_title |

### 🟡 Partially Covered (25-50% implementation)

| Category | Total Endpoints | Implemented | Coverage | Tools |
|----------|----------------|-------------|----------|-------|
| **Interviews** | 8 | 4 | 50% | list_all_interviews, get_upcoming_interviews, schedule_interview, reschedule_interview, cancel_interview |
| **Offers** | 10 | 7 | 70% | list_offers, create_offer, update_offer, approve_offer, send_offer, get_pending_offers, get_candidate_offer |

### 🔴 Poorly Covered (<25% implementation)

| Category | Total Endpoints | Implemented | Coverage | Priority |
|----------|----------------|-------------|----------|----------|
| **Custom Fields** | 6 | 0 | 0% | HIGH - needed for custom data |
| **Feedback** | 8 | 1 | 12% | HIGH - interview feedback |
| **Sources** | 4 | 0 | 0% | MEDIUM - candidate sourcing |
| **Reports** | 5 | 0 | 0% | MEDIUM - analytics |
| **Hiring Team** | 6 | 0 | 0% | MEDIUM - team management |
| **Job Postings** | 8 | 0 | 0% | LOW - handled externally |
| **Webhooks** | 4 | 0 | 0% | LOW - event subscriptions |
| **Archives** | 4 | 1 | 25% | LOW - candidate archiving |

---

## 3. Common User Workflows → Tool Chains

### Workflow 1: "What's the status on [candidate]?"

**Current flow:**
```
User question
  ↓
search_candidates (find by name/email)
  ↓
get_candidate (get full details)
  ↓
Response: Raw data (stage, dates, etc.)
```

**What's missing:**
- No analysis of blocking issues
- No next-step suggestions
- No proactive problem identification

**Proposed enhanced flow:**
```
User question
  ↓
search_candidates (find by name/email)
  ↓
analyze_candidate_status (NEW - intelligent analysis)
  ↓
Response: "Jane is in Technical Screen since Jan 10 (10 days).
          ⚠️ No interview scheduled yet.
          → Suggested action: Schedule technical interview with DevOps team"
```

**Tools involved:** `search_candidates`, `get_candidate`, `analyze_candidate_status` (NEW)

---

### Workflow 2: "Show me stale candidates"

**Current flow:**
```
get_stale_candidates
  ↓
Response: List of candidates stuck >14 days
```

**What's missing:**
- Why they're stale (no interview? waiting for feedback? ready to move?)
- Suggested actions per candidate

**Proposed enhanced flow:**
```
get_stale_candidates
  ↓
analyze_candidate_blockers (NEW - batch analysis)
  ↓
Response: "*John Doe* - Technical Screen (18 days)
          ⚠️ Interview completed 5 days ago, no feedback yet
          → Ping Alice and Bob for feedback

          *Jane Smith* - Final Round (21 days)
          ✅ Strong feedback, ready to move
          → Move to Offer stage"
```

**Tools involved:** `get_stale_candidates`, `analyze_candidate_blockers` (NEW)

---

### Workflow 3: "Schedule an interview for [candidate]"

**Current flow:**
```
schedule_interview
  ↓
Ask for: time, interviewers, type
  ↓
Create interview
```

**What's missing:**
- No suggestions for interviewers based on interview type
- No awareness of interviewer availability
- No historical pattern matching

**Proposed enhanced flow (with memory layer):**
```
User: "Schedule DevOps technical for Jane"
  ↓
analyze_historical_patterns (NEW - from past 2 years data)
  ↓
Response: "I'll schedule a DevOps technical interview for Jane.
          Based on past interviews, I suggest:
          - *Alice Chen* (conducted 23 DevOps technicals, avg 4.2/5 feedback)
          - *Bob Kumar* (conducted 18 DevOps technicals, avg 4.5/5 feedback)
          - Typical duration: 60 minutes
          - Typical next available: Tue/Thu afternoons

          Should I check their calendars for availability?"
```

**Tools involved:** `schedule_interview`, `analyze_historical_patterns` (FUTURE), `get_interviewer_suggestions` (FUTURE)

---

### Workflow 4: "Who needs an offer?"

**Current flow:**
```
search_applications (status filter)
  ↓
Response: List of candidates
```

**What's missing:**
- No check if offer already exists
- No check if feedback is strong enough
- No priority scoring

**Proposed enhanced flow:**
```
get_candidates_ready_for_offer (NEW)
  ↓
analyze_offer_readiness (NEW)
  ↓
Response: "3 candidates ready for offers:

          🔥 *Jane Doe* - URGENT (14 days in Offer stage, no offer created)
             Last feedback: Strong Yes from all 3 interviewers
             → Create offer now (she has competing offers)

          ⚠️ *John Smith* - Ready (7 days in Offer stage)
             Last feedback: Yes with minor concerns about timeline
             → Create offer this week

          ✅ *Alice Wang* - Offer sent 2 days ago, waiting for response"
```

**Tools involved:** `search_applications`, `get_candidates_ready_for_offer` (NEW), `analyze_offer_readiness` (NEW)

---

## 4. Tool → API Endpoint Mapping

### Read Operations (23 tools)

| Tool Name | API Endpoint(s) | Frequency | Complexity |
|-----------|----------------|-----------|------------|
| `search_candidates` | `candidate.list` | ⭐⭐⭐⭐⭐ Very High | Low |
| `get_candidate` | `candidate.info` | ⭐⭐⭐⭐⭐ Very High | Low |
| `search_applications` | `application.list` | ⭐⭐⭐⭐ High | Medium |
| `get_application` | `application.info` | ⭐⭐⭐⭐ High | Low |
| `get_stale_candidates` | `application.list` + enrichment | ⭐⭐⭐⭐ High | High |
| `list_jobs` | `job.list` | ⭐⭐⭐ Medium | Low |
| `get_job` | `job.info` | ⭐⭐⭐ Medium | Low |
| `list_offers` | `offer.list` | ⭐⭐⭐ Medium | Low |
| `get_pending_offers` | `offer.list` + filter | ⭐⭐⭐ Medium | Medium |
| `list_all_interviews` | `interview.list` | ⭐⭐ Low | Low |
| `get_upcoming_interviews` | `interview.list` + filter | ⭐⭐⭐ Medium | Medium |
| `get_candidate_scorecard` | `feedbackFormDefinition.list` + `feedbackSubmission.list` | ⭐⭐ Low | High |

### Write Operations (10 tools)

| Tool Name | API Endpoint(s) | Frequency | Safety Level |
|-----------|----------------|-----------|--------------|
| `move_candidate_stage` | `application.update` | ⭐⭐⭐⭐ High | ⚠️ Requires confirmation |
| `add_note` | `note.create` | ⭐⭐⭐⭐ High | ✅ Safe |
| `schedule_interview` | `interviewSchedule.create` | ⭐⭐⭐ Medium | ⚠️ Requires confirmation |
| `create_offer` | `offer.create` | ⭐⭐ Low | ⚠️ Requires confirmation |
| `update_offer` | `offer.update` | ⭐⭐ Low | ⚠️ Requires confirmation |
| `approve_offer` | `offer.approve` | ⭐⭐ Low | ⚠️ Requires confirmation |
| `send_offer` | `offer.start` | ⭐⭐ Low | ⚠️ Requires confirmation |
| `reschedule_interview` | `interviewSchedule.update` | ⭐⭐ Low | ⚠️ Requires confirmation |
| `cancel_interview` | `interviewSchedule.cancel` | ⭐ Very Low | ⚠️ Requires confirmation |
| `create_candidate` | `candidate.create` | ⭐⭐ Low | ⚠️ Requires confirmation |

---

## 5. Missing High-Value Tools (Gap Analysis)

### 🔴 Critical Gaps (Should implement in Phase 2)

| Missing Tool | Why It's Needed | API Endpoint | User Pain Point |
|-------------|-----------------|--------------|----------------|
| `analyze_candidate_status` | Proactive status analysis | Multiple (candidate, application, interview, feedback) | "Tell me what's blocking Jane" → bot just shows raw data |
| `analyze_candidate_blockers` | Batch blocker detection | Multiple | "Who's stuck?" → no analysis of WHY |
| `get_interviewer_suggestions` | Smart interviewer matching | `user.list` + historical patterns | Manual interviewer selection every time |
| `get_candidates_ready_for_offer` | Proactive offer pipeline | `application.list` + `feedbackSubmission.list` | No visibility into offer-ready candidates |
| `analyze_feedback_sentiment` | Understand feedback quality | `feedbackSubmission.list` | Can't tell if feedback is strong/weak |

### 🟡 High-Value Extensions

| Missing Tool | Why It's Needed | API Endpoint | Benefit |
|-------------|-----------------|--------------|---------|
| `bulk_move_candidates` | Move multiple at once | `application.update` (batch) | Faster pipeline management |
| `add_candidate_tag` | Organize candidates | `candidate.addTag` | Better filtering/search |
| `get_source_analytics` | Track where candidates come from | `source.list` + analytics | Optimize recruiting channels |
| `set_custom_field` | Store custom data | `customField.setValue` | Track custom metrics |

---

## 6. Proposed New Tools (Phase A - Proactive Analysis)

### Tool 1: `analyze_candidate_status`

**Purpose:** Deep analysis of a single candidate's status with blocking issue detection

**Input:**
```typescript
{
  candidate_id: string;
  candidate_name?: string;
  candidate_email?: string;
}
```

**Output:**
```typescript
{
  candidate: Candidate;
  currentStage: InterviewStage;
  daysInStage: number;
  blockers: Array<{
    type: "no_interview_scheduled" | "awaiting_feedback" | "ready_to_move" | "offer_pending";
    severity: "critical" | "warning" | "info";
    message: string;
    suggestedAction: string;
  }>;
  recentActivity: Array<{
    type: "interview" | "note" | "stage_change" | "feedback";
    timestamp: string;
    summary: string;
  }>;
  nextSteps: string[];
  priority: "urgent" | "high" | "medium" | "low";
}
```

**Logic:**
1. Get candidate + applications
2. Get all interviews for active application
3. Get all feedback submissions
4. Analyze patterns:
   - If in interview stage but no interview scheduled → "critical blocker"
   - If interview happened >3 days ago but no feedback → "awaiting_feedback"
   - If all feedback positive and in stage >7 days → "ready_to_move"
   - If in offer stage but no offer created → "offer_pending"

---

### Tool 2: `analyze_candidate_blockers`

**Purpose:** Batch analysis of multiple candidates (e.g., all stale candidates)

**Input:**
```typescript
{
  candidate_ids?: string[];
  stage?: string;
  days_in_stage_min?: number;
}
```

**Output:**
```typescript
{
  analyzed: number;
  byBlockerType: {
    no_interview_scheduled: Candidate[];
    awaiting_feedback: Candidate[];
    ready_to_move: Candidate[];
    offer_pending: Candidate[];
    other: Candidate[];
  };
  summary: {
    critical: number;
    warning: number;
    info: number;
  };
}
```

**Use case:** "Show me who's stuck and why"

---

### Tool 3: `get_interviewer_patterns`

**Purpose:** Analyze historical data to find interviewer patterns

**Input:**
```typescript
{
  interview_type?: string;
  user_id?: string;
  lookback_days?: number; // default 730 (2 years)
}
```

**Output:**
```typescript
{
  interviewers: Array<{
    userId: string;
    name: string;
    interviewCount: number;
    avgFeedbackScore: number;
    typicalDuration: number;
    specialties: string[]; // e.g., ["DevOps", "Backend", "System Design"]
  }>;
  commonPatterns: {
    typicalDuration: number;
    commonDaysOfWeek: string[];
    commonTimesOfDay: string[];
  };
}
```

**Use case:** "Who should interview this DevOps candidate?"

---

## 7. Priority Roadmap

### ✅ Completed (Phase 1)
- Offer management (7 endpoints)
- Interview management (4 endpoints)
- Candidate creation (1 endpoint)
- Casual system prompt

### 🚀 Phase A - Proactive Analysis (CURRENT)
**Timeline:** Next 2-3 hours
**Impact:** 10x smarter bot immediately

1. Update system prompt to be analytical
2. Add `analyze_candidate_status` service method
3. Add `analyze_candidate_blockers` service method
4. Create tools for both
5. Test with real scenarios

### 📊 Phase B - Historical Pattern Analysis
**Timeline:** After Phase A
**Impact:** Memory and learning capabilities

1. Add `get_interviewer_patterns` service method
2. Query last 2 years of interview/feedback data
3. Build pattern detection logic
4. Add interviewer suggestion tool

### 🔮 Phase C - Full Memory Layer
**Timeline:** After Phase B
**Impact:** Persistent learning and optimization

1. Create persistent memory store (JSON or SQLite)
2. Track interaction patterns
3. Learn from user corrections
4. Personalization per user

---

## 8. API Coverage Heatmap

```
Legend:
🟢 Fully implemented (>75%)
🟡 Partially implemented (25-75%)
🔴 Not implemented (<25%)
⚫ Out of scope / not needed

┌─────────────────────────────────────────────────────────────────┐
│ CATEGORY              │ COVERAGE │ PRIORITY │ PHASE          │
├─────────────────────────────────────────────────────────────────┤
│ Candidates            │   🟢 75% │   HIGH   │ Phase 1 ✅      │
│ Applications          │   🟡 50% │   HIGH   │ Phase 1 ✅      │
│ Jobs                  │   🟡 50% │   HIGH   │ Phase 1 ✅      │
│ Interviews            │   🟡 50% │   HIGH   │ Phase 1 ✅      │
│ Offers                │   🟢 70% │   HIGH   │ Phase 1 ✅      │
├─────────────────────────────────────────────────────────────────┤
│ Feedback              │   🔴 12% │   HIGH   │ Phase B 🎯      │
│ Custom Fields         │   🔴  0% │   HIGH   │ Phase 2         │
│ Users                 │   🔴  0% │  MEDIUM  │ Phase B 🎯      │
│ Sources               │   🔴  0% │  MEDIUM  │ Phase 2         │
│ Hiring Team           │   🔴  0% │  MEDIUM  │ Phase 2         │
│ Reports               │   🔴  0% │  MEDIUM  │ Phase 3         │
├─────────────────────────────────────────────────────────────────┤
│ Job Postings          │   🔴  0% │    LOW   │ ⚫ External     │
│ Webhooks              │   🔴  0% │    LOW   │ ⚫ Future       │
│ Archives              │   🟡 25% │    LOW   │ ⚫ Low priority │
└─────────────────────────────────────────────────────────────────┘
```

---

## 9. Tool Usage Patterns (Predicted)

Based on common recruiting workflows:

```
Most Frequent (Daily):
  search_candidates         ████████████████████ 100%
  get_candidate            ████████████████     80%
  search_applications      ███████████          55%
  add_note                 ██████████           50%
  get_stale_candidates     █████████            45%

Medium Frequency (Weekly):
  move_candidate_stage     ████████             40%
  list_jobs                ██████               30%
  schedule_interview       █████                25%
  get_upcoming_interviews  ████                 20%

Low Frequency (Monthly):
  create_offer             ███                  15%
  approve_offer            ██                   10%
  send_offer               ██                   10%
  create_candidate         ██                   10%
  reschedule_interview     █                    5%
  cancel_interview         █                    5%
```

---

## 10. Crossover Points (Where Intelligence Matters Most)

### 🎯 Critical Decision Points

1. **Status Check → Action Suggestion**
   - User asks: "What's up with Jane?"
   - Bot needs to: Analyze blockers + suggest actions
   - **Current gap:** No analysis layer
   - **Fix:** Phase A - `analyze_candidate_status`

2. **Stale Candidates → Prioritization**
   - User asks: "Who's stuck?"
   - Bot needs to: Explain why + prioritize urgency
   - **Current gap:** Just lists candidates
   - **Fix:** Phase A - `analyze_candidate_blockers`

3. **Interview Scheduling → Interviewer Selection**
   - User asks: "Schedule a DevOps interview"
   - Bot needs to: Suggest best interviewers based on history
   - **Current gap:** No pattern analysis
   - **Fix:** Phase B - `get_interviewer_patterns`

4. **Offer Creation → Readiness Check**
   - User asks: "Create offer for Jane"
   - Bot needs to: Verify feedback is strong enough
   - **Current gap:** No validation
   - **Fix:** Phase B - `analyze_offer_readiness`

---

## Summary

**Current State:**
- 33 tools implemented (16.5% API coverage)
- Strong foundation for candidate/job/application/interview/offer management
- Missing: Analysis layer, pattern detection, proactive suggestions

**Immediate Next Steps (Phase A):**
1. Add analysis methods to service layer
2. Create proactive tools
3. Update system prompt to use them

**Long-term Vision:**
- Historical pattern analysis (2 years of data)
- Interviewer suggestions based on past performance
- Offer readiness scoring
- Persistent memory for continuous learning

---

**Ready to proceed with Phase A implementation!**
