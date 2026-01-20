# Ashby API Coverage Audit & Rating
**Generated:** 2026-01-19
**Bot Version:** TypeScript Slack Bot v1.0.0

## Rating Methodology

Each API endpoint is rated across 4 dimensions (1-10 scale):

1. **Business Value** - Impact on recruiter workflow efficiency
2. **Implementation Complexity** - Technical difficulty (inverse: 10 = easy, 1 = hard)
3. **Usage Frequency** - How often recruiters need this (estimated)
4. **Data Completeness** - How well current implementation exposes API data

**Overall Score** = (Business Value × 0.4) + (Implementation Complexity × 0.2) + (Usage Frequency × 0.3) + (Data Completeness × 0.1)

---

## TIER S: Fully Mapped & Working (14 endpoints)

| API Endpoint | Bot Tool/Method | BizVal | Complexity | Frequency | Completeness | **Total** |
|--------------|-----------------|--------|------------|-----------|--------------|-----------|
| `candidate.search` | `search_candidates` | 10 | 10 | 10 | 10 | **10.0** ⭐ |
| `candidate.info` | `get_candidate_details` | 9 | 10 | 9 | 9 | **9.2** ⭐ |
| `candidate.list` | `listCandidates()` (internal) | 8 | 9 | 8 | 8 | **8.2** |
| `candidate.listNotes` | `get_candidate_details` (includes notes) | 8 | 10 | 7 | 9 | **8.2** |
| `candidate.createNote` | `add_note` | 9 | 10 | 9 | 10 | **9.4** ⭐ |
| `application.list` | `listApplications()` (internal) | 9 | 8 | 9 | 9 | **8.9** |
| `application.info` | `getApplication()` (internal) | 8 | 10 | 7 | 9 | **8.2** |
| `application.changeStage` | `move_candidate_stage` | 10 | 9 | 8 | 10 | **9.3** ⭐ |
| `job.list` | `get_open_jobs` | 9 | 10 | 8 | 9 | **8.9** |
| `job.info` | `get_job_details` | 8 | 10 | 7 | 9 | **8.2** |
| `interviewPlan.list` | `list_interview_plans` | 7 | 10 | 5 | 10 | **7.3** |
| `interviewStage.list` | `listInterviewStages()` (internal) | 8 | 9 | 6 | 9 | **7.9** |
| `interviewSchedule.create` | `schedule_interview` | 9 | 7 | 7 | 8 | **8.1** |
| `interviewSchedule.list` | `get_interview_schedules` | 7 | 9 | 6 | 9 | **7.4** |

**TIER S Average:** 8.4 / 10

---

## TIER A: Partially Mapped or Missing Key Features (12 endpoints)

| API Endpoint | Status | BizVal | Complexity | Frequency | Gap | **Priority** |
|--------------|--------|--------|------------|-----------|-----|--------------|
| `candidate.create` | ❌ Missing | 8 | 7 | 6 | No tool to create candidates | **7.1** 🔴 |
| `candidate.update` | ❌ Missing | 7 | 8 | 5 | Can't update candidate fields | **6.6** 🟡 |
| `candidate.addTag` | ❌ Missing | 6 | 9 | 5 | No tagging support | **6.2** 🟡 |
| `candidate.uploadResume` | ❌ Missing | 7 | 5 | 4 | No resume upload | **5.8** 🟡 |
| `application.create` | ⚠️ Partial | 7 | 7 | 5 | Via `candidate.create` only | **6.5** 🟡 |
| `application.update` | ❌ Missing | 6 | 8 | 4 | Can't update app metadata | **5.8** 🟡 |
| `applicationFeedback.list` | ⚠️ Partial | 8 | 9 | 7 | Not exposed to bot tools | **7.7** 🔴 |
| `applicationFeedback.submit` | ❌ Missing | 7 | 6 | 5 | No feedback submission | **6.2** 🟡 |
| `interview.list` | ⚠️ Partial | 7 | 9 | 6 | Only schedules, not interviews | **7.0** 🔴 |
| `interviewSchedule.update` | ❌ Missing | 8 | 7 | 6 | Can't reschedule | **7.1** 🔴 |
| `interviewSchedule.cancel` | ❌ Missing | 8 | 9 | 5 | Can't cancel interviews | **7.2** 🔴 |
| `archiveReason.list` | ❌ Missing | 6 | 10 | 4 | Can't see rejection reasons | **6.2** 🟡 |

**TIER A Average:** 6.6 / 10
**Top 3 Gaps:** interviewSchedule.cancel (7.2), interviewSchedule.update (7.1), applicationFeedback.list (7.7)

---

## TIER B: Low Priority or Edge Cases (18 endpoints)

| API Endpoint | Status | BizVal | Complexity | Frequency | Why Low Priority | **Score** |
|--------------|--------|--------|------------|-----------|------------------|-----------|
| `job.create` | ❌ Missing | 5 | 6 | 2 | Jobs created via UI typically | **4.1** |
| `job.update` | ❌ Missing | 5 | 7 | 2 | Job updates rare mid-posting | **4.3** |
| `job.setStatus` | ❌ Missing | 6 | 9 | 3 | Closing jobs manual process | **5.3** |
| `jobPosting.list` | ❌ Missing | 6 | 9 | 4 | Job postings secondary to jobs | **5.9** |
| `jobPosting.update` | ❌ Missing | 5 | 6 | 2 | Posting edits via UI | **4.1** |
| `opening.list` | ❌ Missing | 6 | 8 | 3 | Headcount tracking, not urgent | **5.1** |
| `opening.create` | ❌ Missing | 5 | 7 | 2 | Openings created at job creation | **4.3** |
| `source.list` | ❌ Missing | 6 | 10 | 4 | Useful but not critical | **6.0** |
| `candidateTag.list` | ❌ Missing | 5 | 10 | 3 | Tags exist but low usage | **5.3** |
| `user.list` | ⚠️ Partial | 7 | 9 | 5 | Needed for interviewer IDs | **6.7** 🟡 |
| `department.list` | ❌ Missing | 4 | 10 | 2 | Org structure queries rare | **4.4** |
| `location.list` | ❌ Missing | 4 | 10 | 2 | Location filtering niche | **4.4** |
| `customField.list` | ❌ Missing | 5 | 7 | 3 | Custom fields company-specific | **4.7** |
| `offer.create` | ❌ Missing | 7 | 5 | 4 | Offers created manually | **5.5** 🟡 |
| `offer.list` | ❌ Missing | 6 | 9 | 4 | Offer tracking useful | **5.9** 🟡 |
| `referral.create` | ❌ Missing | 5 | 7 | 3 | Referrals via dedicated flow | **4.7** |
| `webhook.create` | ❌ Missing | 6 | 8 | 2 | Admin/setup task | **5.0** |
| `apiKey.info` | ❌ Missing | 3 | 10 | 1 | Debugging only | **3.5** |

**TIER B Average:** 5.0 / 10

---

## TIER C: Not Applicable / Admin Only (8 endpoints)

| API Endpoint | Why Excluded | Score |
|--------------|--------------|-------|
| `candidate.anonymize` | GDPR compliance, admin-only | N/A |
| `applicationForm.submit` | External applicant flow | N/A |
| `referralForm.info` | External referral flow | N/A |
| `assessment.list` | Technical assessments niche | N/A |
| `approval.list` | Enterprise approval workflows | N/A |
| `hiringTeam.list` | Already in job.info | N/A |
| `emailTemplate.list` | Email config, admin task | N/A |
| `file.info` | Low-level file ops | N/A |

---

## Summary Statistics

| Tier | Endpoint Count | Avg Score | Coverage % |
|------|----------------|-----------|------------|
| **S** (Fully Mapped) | 14 | 8.4 | **100%** ✅ |
| **A** (Partial/Missing High Priority) | 12 | 6.6 | **25%** ⚠️ |
| **B** (Low Priority) | 18 | 5.0 | **6%** ❌ |
| **C** (Not Applicable) | 8 | N/A | N/A |
| **TOTAL** | 52 | - | **27%** overall |

---

## Top 10 Missing APIs by Priority Score

| Rank | API Endpoint | Score | Impact | Implementation Effort |
|------|--------------|-------|--------|----------------------|
| 1 | `applicationFeedback.list` | 7.7 | View interview feedback in Slack | **Low** - read-only |
| 2 | `interviewSchedule.cancel` | 7.2 | Cancel interviews from Slack | **Low** - simple DELETE |
| 3 | `interviewSchedule.update` | 7.1 | Reschedule interviews | **Medium** - complex params |
| 4 | `candidate.create` | 7.1 | Add candidates directly | **Medium** - many fields |
| 5 | `interview.list` | 7.0 | See all upcoming interviews | **Low** - read-only |
| 6 | `user.list` | 6.7 | Get interviewer IDs for scheduling | **Low** - read-only |
| 7 | `candidate.update` | 6.6 | Update candidate info | **Medium** - validation |
| 8 | `application.create` | 6.5 | Apply candidate to another job | **Medium** - workflow |
| 9 | `candidate.addTag` | 6.2 | Tag candidates for organization | **Low** - simple write |
| 10 | `applicationFeedback.submit` | 6.2 | Submit feedback via bot | **High** - complex form |

---

## Recommended Next Steps (Prioritized)

### Phase 1: Quick Wins (Low Effort, High Value)
1. ✅ **`applicationFeedback.list`** - Add to `get_candidate_details` output
2. ✅ **`interviewSchedule.cancel`** - Add `cancel_interview` tool
3. ✅ **`interview.list`** - Add `get_upcoming_interviews` tool
4. ✅ **`user.list`** - Add `get_team_members` tool (needed for scheduling)

### Phase 2: Core Gaps (Medium Effort, High Value)
5. ⚠️ **`interviewSchedule.update`** - Add `reschedule_interview` tool
6. ⚠️ **`candidate.create`** - Add `create_candidate` tool
7. ⚠️ **`candidate.addTag`** - Add tagging support

### Phase 3: Advanced Features (Higher Effort)
8. ⚠️ **`offer.list`** / **`offer.create`** - Offer management
9. ⚠️ **`applicationFeedback.submit`** - Feedback submission
10. ⚠️ **`source.list`** - Source filtering

---

## Critical Insight: The "Interviewer ID" Problem

**BLOCKER IDENTIFIED:** The `schedule_interview` tool requires `interviewer_ids`, but we have **no way to get user IDs**!

### Current State
```typescript
schedule_interview({
  candidate_id: "...",
  start_time: "2026-01-20T14:00:00Z",
  end_time: "2026-01-20T15:00:00Z",
  interviewer_ids: ["???"] // ❌ Where do we get these?
})
```

### Solution Required
Add `user.list` API mapping immediately:
- **API:** `user.list` → returns `User[]` with `{ id, firstName, lastName, email }`
- **Tool:** `get_team_members` → "List all users (interviewers, recruiters)"
- **Usage:** Bot can say "Here are available interviewers: 1) Sarah (sarah@..., ID: abc123), 2) Mike..."

**Priority:** 🔴 **CRITICAL** - Without this, `schedule_interview` is unusable.

---

## Sources
- [Ashby API Documentation](https://developers.ashbyhq.com/)
- [Ashby API Directory](https://www.getknit.dev/blog/ashby-api-directory-jx2VSB)
- [Ashby API Guide](https://www.bindbee.dev/blog/ashby-api-guide)
- [API Tracker: Ashby](https://apitracker.io/a/ashbyhq)
