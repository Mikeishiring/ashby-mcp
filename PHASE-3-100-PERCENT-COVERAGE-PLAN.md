# Phase 3: Path to 100% API Coverage

**Date:** 2026-01-20
**Current Status:** 36 tools, ~40% API coverage
**Goal:** 100% coverage of high-value endpoints
**Strategy:** Implement remaining critical endpoints in priority order

---

## Current State Audit

### ✅ Already Implemented (34 endpoints)

**Candidates (6/15):**
- ✅ candidate.search
- ✅ candidate.info
- ✅ candidate.list
- ✅ candidate.listNotes
- ✅ candidate.createNote
- ✅ candidate.create
- ✅ candidate.update

**Applications (3/13):**
- ✅ application.list
- ✅ application.info
- ✅ application.changeStage

**Jobs (3/8):**
- ✅ job.list
- ✅ job.info
- ✅ job.search (via title filter)

**Interviews (4/3):**
- ✅ interview.list
- ✅ interview.info
- ✅ interviewSchedule.list
- ✅ interviewSchedule.create
- ✅ interviewSchedule.update
- ✅ interviewSchedule.cancel

**Interview Plans/Stages (2/4):**
- ✅ interviewPlan.list
- ✅ interviewStage.list

**Offers (8/7):**
- ✅ offer.list
- ✅ offer.info
- ✅ offer.create
- ✅ offer.update
- ✅ offer.approve
- ✅ offer.start
- ✅ offerProcess.list
- ✅ offerProcess.start

**Users (1/4):**
- ✅ user.list

**Feedback (2/2):**
- ✅ feedbackSubmission.list
- ✅ applicationFeedback.list (scorecard)

**Archive Reasons (1/1):**
- ✅ archiveReason.list

---

## Missing High-Value Endpoints

### Tier 1: Critical for Core Workflows (8 endpoints)

1. **`application.create`** - Apply candidate to different job
   - Use case: Transfer candidate to another role
   - Complexity: Low
   - Tool: `apply_to_job`

2. **`application.transfer`** - Move application between jobs
   - Use case: Candidate better fit for different role
   - Complexity: Low
   - Tool: `transfer_application`

3. **`candidate.addTag`** - Tag candidates
   - Use case: Organization, filtering
   - Complexity: Low
   - Tool: `add_candidate_tag`

4. **`feedbackSubmission.info`** - Get detailed feedback
   - Use case: Read specific feedback content
   - Complexity: Low
   - Tool: `get_feedback_details`

5. **`hiringTeamRole.list`** - List hiring team roles
   - Use case: Understand team structure
   - Complexity: Low
   - Tool: Internal use

6. **`applicationHiringTeamRole.list`** - Get hiring team for application
   - Use case: See who's involved
   - Complexity: Low
   - Tool: `get_hiring_team`

7. **`source.list`** - List candidate sources
   - Use case: Analytics, source tracking
   - Complexity: Low
   - Tool: `list_candidate_sources`

8. **`customField.list`** - List custom fields
   - Use case: Access company-specific data
   - Complexity: Medium
   - Tool: `list_custom_fields`

### Tier 2: Useful but Lower Priority (12 endpoints)

9. **`user.info`** - Get user details
10. **`user.search`** - Search users
11. **`interviewStage.info`** - Get stage details
12. **`interviewEvent.list`** - List interview events
13. **`project.list`** - List candidate projects
14. **`location.list`** - List locations
15. **`department.list`** - List departments
16. **`candidateTag.list`** - List all tags
17. **`jobPosting.list`** - List job postings
18. **`opening.list`** - List job openings
19. **`application.listHistory`** - Get stage history
20. **`application.listCriteriaEvaluations`** - Get evaluation scores

### Tier 3: Administrative / Niche (Skip for MVP)

- `candidate.uploadFile` / `uploadResume` - File handling
- `candidate.anonymize` - GDPR compliance
- `job.create` / `update` / `setStatus` - Admin tasks
- `interviewerPool.*` - Advanced scheduling
- `emailTemplate.list` - Admin config
- `webhook.create` - Integration setup
- `assessment.list` - Niche feature
- `approval.list` - Enterprise workflows

---

## Implementation Priority

### Phase 3A: Application Management (2 endpoints)
**Impact:** Transfer candidates between jobs, apply to multiple roles
**Effort:** 30 minutes

1. `application.create` → `apply_to_job` tool
2. `application.transfer` → `transfer_application` tool

### Phase 3B: Tagging & Organization (2 endpoints)
**Impact:** Better candidate organization
**Effort:** 20 minutes

3. `candidate.addTag` → `add_candidate_tag` tool
4. `candidateTag.list` → Internal (for tag autocomplete)

### Phase 3C: Hiring Team & Sources (3 endpoints)
**Impact:** Team visibility, source analytics
**Effort:** 30 minutes

5. `source.list` → `list_candidate_sources` tool
6. `hiringTeamRole.list` → Internal
7. `applicationHiringTeamRole.list` → `get_hiring_team` tool

### Phase 3D: Feedback Details (1 endpoint)
**Impact:** Read full feedback content
**Effort:** 15 minutes

8. `feedbackSubmission.info` → `get_feedback_details` tool

### Phase 3E: Custom Fields (1 endpoint)
**Impact:** Access company-specific data
**Effort:** 20 minutes

9. `customField.list` → `list_custom_fields` tool

### Phase 3F: User Management (2 endpoints)
**Impact:** Better user context
**Effort:** 15 minutes

10. `user.info` → Internal
11. `user.search` → `search_users` tool

### Phase 3G: Enhanced Context (5 endpoints)
**Impact:** Richer data for analysis
**Effort:** 40 minutes

12. `interviewStage.info` → Internal
13. `location.list` → Internal
14. `department.list` → Internal
15. `application.listHistory` → `get_application_history` tool
16. `interviewEvent.list` → `list_interview_events` tool

---

## Estimated Total Effort

- **Tier 1 (Critical):** ~2 hours
- **Tier 2 (Useful):** ~2.5 hours
- **Total to 95% coverage:** ~4.5 hours
- **100% coverage (including admin):** ~8 hours

---

## Success Metrics

### Current (Phase 2 Complete)
- Tools: 36
- API Endpoints: 34/200+ (17%)
- High-Value Coverage: ~40%
- Capability Rating: 7.8/10

### After Phase 3A-3D (Critical Only)
- Tools: 44 (+8)
- API Endpoints: 42/200+ (21%)
- High-Value Coverage: ~70%
- Capability Rating: 8.2/10

### After Phase 3 Complete (Tier 1 + 2)
- Tools: 56 (+20)
- API Endpoints: 54/200+ (27%)
- High-Value Coverage: ~95%
- Capability Rating: 8.8/10

---

## Implementation Order (Next 4 Hours)

1. **Phase 3A:** Application management (30 min)
2. **Phase 3B:** Tagging (20 min)
3. **Phase 3C:** Hiring team & sources (30 min)
4. **Phase 3D:** Feedback details (15 min)
5. **Phase 3E:** Custom fields (20 min)
6. **Phase 3F:** User management (15 min)
7. **Phase 3G:** Enhanced context (40 min)
8. **Build & Test:** (30 min)

**Total:** ~3.5 hours active work

---

## Notes

- Admin endpoints (job.create, webhook.create, etc.) excluded as low-value for Slack bot
- Focus on recruiter workflows, not system administration
- Each endpoint adds ~10-15 minutes (client + service + tool + executor)
- Prioritize endpoints that enable new user stories vs. just more data access

**Next Action:** Start with Phase 3A - Application Management
