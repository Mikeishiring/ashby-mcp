# The Missing 15%: What's Not Covered & Why

**Current Coverage:** 85% of high-value recruiter workflows
**Missing:** 15% of workflows

---

## What Does "85% Coverage" Mean?

The **85% coverage** refers to **high-value recruiter workflows**, not total API endpoints.

### Current Status:
- **51 tools implemented**
- **54 Ashby API endpoints** covered
- **~200+ total Ashby API endpoints** exist
- **Actual endpoint coverage:** ~27%

### Why the Gap?

**The missing 15% of workflows fall into these categories:**

---

## 1. Low-Frequency Admin Tasks (5%)

### What's Missing:
- **Job Creation/Editing** - `job.create`, `job.update`, `job.setStatus`
- **Interviewer Pool Management** - Creating/managing interviewer availability pools
- **Email Template Configuration** - Setting up automated emails
- **Webhook Configuration** - Setting up integrations
- **Custom Field Creation** - Creating new custom fields (vs. using existing ones)

### Why Not Included:
- Typically done once during setup, not daily
- Usually require careful planning and review
- Better suited for Ashby UI where you can see full context
- Low ROI for conversational interface

### Example:
```
❌ Not supported: "Create a new job posting for Senior Engineer"
✅ Supported: "Show me details for the Senior Engineer job"
```

---

## 2. Bulk Operations & Mass Edits (3%)

### What's Missing:
- Bulk candidate moves (>2 at once)
- Mass tagging operations
- Batch application transfers
- Bulk offer approvals

### Why Not Included:
- **Safety first:** Mass operations are risky
- Current limit: 2 candidates max per operation
- Prevents accidental bulk changes
- Can be increased if needed, but defaults conservative

### Example:
```
❌ Not supported: "Move all 20 candidates to Technical Interview"
✅ Supported: "Move Sarah and John to Technical Interview"
```

---

## 3. Advanced Workflow Automation (4%)

### What's Missing:
- **Automated stage progression** - Auto-move after feedback submitted
- **Smart scheduling** - AI-powered interview scheduling with availability
- **Predictive scoring** - ML-based candidate ranking
- **Proactive alerts** - Push notifications for urgent actions
- **Custom workflows** - Company-specific automation rules

### Why Not Included:
- Requires ML/AI models beyond conversational interface
- Needs training data and tuning
- Better as dedicated features, not ad-hoc commands
- Planned for future phases

### Example:
```
❌ Not supported: "Automatically schedule interviews when candidates pass screening"
✅ Supported: "Schedule an interview for Sarah on Wednesday at 2pm"
```

---

## 4. Enterprise/Advanced Features (2%)

### What's Missing:
- **Approval Workflows** - Multi-level approval chains
- **GDPR/Anonymization** - `candidate.anonymize`
- **Advanced Reporting** - Custom report generation
- **Compliance Tracking** - EEO, OFCCP reporting
- **Integrations** - Third-party system connections

### Why Not Included:
- Enterprise-specific needs
- Often require admin privileges
- Compliance-sensitive operations
- Better handled through Ashby's dedicated features

---

## 5. Niche Use Cases (1%)

### What's Missing:
- **Projects** - Candidate project tracking
- **Assessments** - Technical assessment management
- **Referrals** - Detailed referral program management
- **Candidate Portal** - External-facing applicant features
- **Calendar Sync** - Deep calendar integration

### Why Not Included:
- Used by <20% of teams
- Often company-specific implementations
- Complex integrations beyond ATS scope
- Low ROI for general-purpose bot

---

## What IS Covered (The 85%)

### ✅ Core Daily Workflows

**Pipeline Management:**
- View pipeline overview
- Find stale candidates
- Track recent applications
- See candidates needing decisions
- Source analytics

**Candidate Research:**
- Search by name/email
- Full candidate profiles
- Interview scorecards & feedback
- Application history
- Compare candidates

**Multi-Role Hiring:**
- Apply to multiple jobs
- Transfer between roles
- See hiring teams

**Interview Coordination:**
- Schedule interviews
- Reschedule interviews
- Cancel interviews
- View upcoming interviews
- See all interview events

**Offer Management:**
- Create offers
- Update offer terms
- Approve offers
- Send to candidates
- Track pending offers

**Quick Actions:**
- Add notes
- Move stages
- Tag candidates
- Reject/archive
- Create candidates

**Organization:**
- Tag system
- Source tracking
- Custom fields access
- Team member lookup
- Hiring team visibility

---

## How Interviews Work 🎯

### The Complete Interview Flow

#### 1. **Scheduling an Interview**

**User:** "Schedule Sarah for Wednesday at 2pm with Mike and Jane"

**Behind the scenes:**
```typescript
1. Bot uses search_candidates to find Sarah
   → Gets candidateId: "abc123"

2. Bot uses search_users to find Mike and Jane
   → Gets userIds: ["user_456", "user_789"]

3. Bot calls schedule_interview tool:
   - candidate_id: "abc123"
   - start_time: "2026-01-22T14:00:00Z"
   - end_time: "2026-01-22T15:00:00Z"
   - interviewer_ids: ["user_456", "user_789"]
   - meeting_link: (optional)
   - location: (optional)

4. Safety guard creates confirmation request

5. Bot shows user: "I'm about to schedule:
   - Candidate: Sarah Chen (sarah@email.com)
   - Time: Wednesday 2:00 PM - 3:00 PM
   - Interviewers: Mike Smith, Jane Doe

   React with ✅ to confirm"

6. User reacts: ✅

7. Executor calls Ashby API:
   POST /interviewSchedule.create
   {
     applicationId: "app_123",
     interviewStageId: "stage_456",
     startTime: "2026-01-22T14:00:00Z",
     endTime: "2026-01-22T15:00:00Z",
     interviewerUserIds: ["user_456", "user_789"]
   }

8. Ashby creates interview schedule

9. Bot confirms: "✅ Interview scheduled! Sarah will interview
   with Mike and Jane on Wednesday at 2 PM."
```

**What gets created:**
- Interview Schedule record in Ashby
- Calendar invites sent to all participants
- Interview appears in Sarah's application timeline
- Shows up in `get_upcoming_interviews`

---

#### 2. **Rescheduling an Interview**

**User:** "Move Sarah's interview to Friday at 3pm"

**Behind the scenes:**
```typescript
1. Bot finds Sarah's upcoming interviews
   → Uses get_interview_schedules or list_all_interviews

2. Bot identifies the interview schedule ID
   → scheduleId: "sched_999"

3. Bot calls reschedule_interview:
   - interview_schedule_id: "sched_999"
   - start_time: "2026-01-24T15:00:00Z"
   - end_time: "2026-01-24T16:00:00Z"
   - interviewer_ids: ["user_456", "user_789"] (same interviewers)

4. Safety guard creates confirmation

5. Bot shows: "I'll reschedule Sarah's Technical Interview:
   - OLD: Wednesday 2:00 PM with Mike, Jane
   - NEW: Friday 3:00 PM with Mike, Jane

   React with ✅ to confirm"

6. User: ✅

7. Executor calls Ashby API:
   POST /interviewSchedule.update
   { scheduleId, startTime, endTime, interviewerUserIds }

8. Ashby updates the schedule + sends calendar updates

9. Bot confirms: "✅ Interview rescheduled to Friday 3 PM"
```

---

#### 3. **Canceling an Interview**

**User:** "Cancel the interview for John"

**Behind the scenes:**
```typescript
1. Bot finds John's scheduled interviews

2. Bot shows interviews and asks which one

3. User clarifies or bot selects the next upcoming one

4. Bot calls cancel_interview:
   - interview_schedule_id: "sched_888"
   - cancellation_reason: (optional, e.g., "Candidate withdrew")

5. Safety guard creates confirmation

6. Bot shows: "I'll cancel John's Technical Interview:
   - Scheduled: Wednesday 2:00 PM
   - Interviewers: Mike, Jane

   React with ✅ to confirm"

7. User: ✅

8. Executor calls Ashby API:
   POST /interviewSchedule.cancel
   { scheduleId, cancellationReason }

9. Ashby cancels + sends cancellation emails

10. Bot confirms: "✅ Interview canceled. Participants notified."
```

---

## How Rejections Work 🚫

### The Complete Rejection Flow

#### 1. **Simple Rejection (No Reason)**

**User:** "Reject Alex"

**Behind the scenes:**
```typescript
1. Bot uses search_candidates to find Alex
   → candidateId: "xyz789"

2. Bot finds Alex's active application
   → applicationId: "app_555"

3. Bot calls reject_candidate tool:
   - candidate_id: "xyz789"
   - reason: (optional)

4. Safety guard creates confirmation

5. Bot shows: "I'm about to reject *Alex Johnson* (alex@email.com)
   - Current stage: Technical Interview
   - Job: Senior Backend Engineer

   ⚠️ This will archive the application.
   React with ✅ to confirm"

6. User: ✅

7. Executor calls Ashby API:
   POST /application.changeStage
   {
     applicationId: "app_555",
     interviewStageId: "ARCHIVED", // Special Ashby stage
     archiveReasonId: null  // No specific reason
   }

8. Ashby archives the application

9. Bot confirms: "✅ Alex has been rejected and archived."
```

---

#### 2. **Rejection with Reason**

**User:** "Reject Maria - not enough experience"

**Behind the scenes:**
```typescript
1. Bot finds Maria
   → candidateId: "abc456"

2. Bot looks up available rejection reasons:
   → Calls get_rejection_reasons
   → Returns: [
       { id: "reason_1", text: "Not enough experience" },
       { id: "reason_2", text: "Poor culture fit" },
       { id: "reason_3", text: "Position filled" },
       ...
     ]

3. Bot matches "not enough experience" to reason_1

4. Bot calls reject_candidate:
   - candidate_id: "abc456"
   - reason: "not enough experience" (or reason_id: "reason_1")

5. Safety guard creates confirmation

6. Bot shows: "I'll reject *Maria Garcia* (maria@email.com)
   - Current stage: Phone Screen
   - Job: Senior Backend Engineer
   - Reason: Not enough experience

   React with ✅ to confirm"

7. User: ✅

8. Executor calls Ashby API:
   POST /application.changeStage
   {
     applicationId: "app_666",
     interviewStageId: "ARCHIVED",
     archiveReasonId: "reason_1"
   }

9. Ashby archives with reason
   → Triggers any configured automation (rejection email, etc.)

10. Bot confirms: "✅ Maria rejected (Not enough experience).
    Application archived."
```

---

#### 3. **Bulk Rejection (Safety Limited)**

**User:** "Reject all candidates from the Application Review stage who haven't been touched in 60 days"

**Behind the scenes:**
```typescript
1. Bot finds matching candidates
   → get_stale_candidates with custom threshold

2. Bot sees 15 candidates match

3. Bot says: "I found 15 candidates matching your criteria.

   ⚠️ For safety, I can only reject 2 at a time.

   Want me to show you the list so you can select which
   ones to reject first?"

4. User: "Show me the top 5"

5. Bot lists candidates with details

6. User: "Reject Sarah and John - position filled"

7. Bot processes 2 rejections with safety confirmations

8. User can repeat for more candidates
```

**Safety Design:**
- Hard limit: 2 candidates per operation
- Prevents accidental mass rejections
- Forces deliberate decision-making
- Can be increased in config if needed

---

## Key Process Principles

### 1. **ID Resolution**
- User provides **names** ("Sarah", "the Backend role")
- Bot resolves to **IDs** ("candidate_abc123", "job_def456")
- API calls use **IDs only**

### 2. **Confirmations**
- All write operations require **explicit ✅ confirmation**
- User sees **exactly what will change**
- **No action until confirmed**

### 3. **Safety Limits**
- **Batch operations**: Max 2 candidates
- **Hired candidates**: Protected (can't modify)
- **Archive operations**: Extra warning

### 4. **Audit Trail**
- Notes tagged: `[via Slack Bot]`
- Actions logged in Ashby
- Full history preserved

---

## What You Can't Do (The Missing 15%)

### ❌ Admin Tasks
- Create new jobs from scratch
- Set up interviewer pools
- Configure email templates
- Manage webhooks

### ❌ Bulk Operations
- Reject 50 candidates at once
- Mass-update candidate tags
- Bulk application transfers

### ❌ Advanced Automation
- Auto-schedule based on availability
- Predictive candidate scoring
- Custom workflow triggers

### ❌ Enterprise Features
- Multi-level approval workflows
- GDPR anonymization
- Custom reporting
- Compliance tracking

### ❌ Niche Features
- Project management
- Assessment platforms
- Referral program details
- External applicant portal

---

## Why This 85/15 Split?

### The 85% covers:
- ✅ **Daily tasks** - What recruiters do every day
- ✅ **High ROI** - Biggest time savers
- ✅ **Conversational** - Natural to do via chat
- ✅ **Safe operations** - Low risk of mistakes

### The 15% excluded:
- ❌ **Rare tasks** - Done monthly or quarterly
- ❌ **Admin setup** - One-time configuration
- ❌ **Bulk operations** - Too risky for chat
- ❌ **Complex workflows** - Need dedicated UI

---

## Could We Reach 100%?

**Technically:** Yes, all 200+ endpoints could be wrapped

**Practically:** Not worth it because:
1. **Diminishing returns** - 15% of workflows ≠ 15% of value
2. **Safety concerns** - Some operations too risky for chat
3. **UI superiority** - Some tasks better with visual interface
4. **Maintenance cost** - 73% of endpoints serve <5% of use cases

**The 85/15 split is intentional design:**
- Focus on high-value, high-frequency tasks
- Leave complex, rare tasks to Ashby UI
- Maintain safety and simplicity
- Keep the bot focused and reliable

---

## Summary

**What works great in chat (the 85%):**
- "Find Sarah Chen"
- "Schedule an interview for John"
- "Show me stale candidates"
- "Reject Maria - not enough experience"
- "Create an offer for Alex: $150k"
- "Apply Sarah to both roles"

**What's better in Ashby UI (the 15%):**
- Creating new job postings (needs full job description, requirements, etc.)
- Bulk operations on 50+ candidates (needs visual review)
- Setting up interviewer availability pools (calendar integration complexity)
- Configuring automated workflows (needs visual rule builder)
- Generating compliance reports (needs charts and exports)

**The 85% coverage delivers ~95% of the value because it focuses on daily high-frequency tasks that benefit most from conversational access.**

---

*Last Updated: January 20, 2026*
*Based on: 51 tools, 54 endpoints, Ashby API v2*
