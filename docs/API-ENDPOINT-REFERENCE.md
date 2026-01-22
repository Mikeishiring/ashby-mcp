# Ashby API Endpoint Reference
**Complete endpoint catalog with implementation status**
**Last Updated:** 2026-01-22
**Source:** https://developers.ashbyhq.com/reference

---

## Summary

| Category | Total | Implemented | Coverage |
|----------|-------|-------------|----------|
| Candidates | 15 | 8 | 53% |
| Applications | 13 | 6 | 46% |
| Jobs | 8 | 2 | 25% |
| Interviews | 3 | 3 | 100% |
| Interview Schedules | 4 | 4 | 100% |
| Interview Plans | 1 | 1 | 100% |
| Interview Stages | 2 | 0 | 0% |
| Offers | 7 | 7 | 100% |
| Users | 5 | 3 | 60% |
| Feedback | 4 | 3 | 75% |
| Archive Reasons | 1 | 1 | 100% |
| Hiring Teams | 4 | 2 | 50% |
| Sources | 2 | 1 | 50% |
| Tags | 2 | 1 | 50% |
| Custom Fields | 6 | 1 | 17% |
| Locations | 8 | 1 | 13% |
| Departments | 7 | 1 | 14% |
| Interviewer Pools | 8 | 0 | 0% |
| Projects | 3 | 0 | 0% |
| Reports | 2 | 0 | 0% |
| Openings | 11 | 0 | 0% |
| Job Postings | 3 | 0 | 0% |
| Assessments | 5 | 0 | 0% |
| Other (admin) | ~25 | 0 | 0% |
| **TOTAL** | **~145** | **45** | **~31%** |

---

## API Basics

- **Base URL:** `https://api.ashbyhq.com`
- **Auth:** Basic Authentication (API key as username, empty password)
- **Format:** RPC-style POST requests to `/{category}.{method}`
- **Content-Type:** `application/json`
- **Response:** `{ success: boolean, results: T, errors?: [...] }`

---

## Candidates (15 endpoints)

| Endpoint | Status | Priority | Notes |
|----------|--------|----------|-------|
| `candidate.info` | ✅ | - | Get candidate by ID |
| `candidate.list` | ✅ | - | List all candidates (paginated) |
| `candidate.search` | ✅ | - | Search by name or email |
| `candidate.listNotes` | ✅ | - | Get notes for candidate |
| `candidate.listProjects` | ❌ | ⚪ | Get candidate projects |
| `candidate.listClientInfo` | ❌ | ⚪ | Get client-visible info |
| `candidate.create` | ✅ | - | Create new candidate |
| `candidate.update` | ✅ | - | Update candidate details |
| `candidate.createNote` | ✅ | - | Add note to candidate |
| `candidate.addTag` | ✅ | - | Add tag to candidate |
| `candidate.addProject` | ❌ | ⚪ | Add project to candidate |
| `candidate.uploadFile` | ❌ | 🟡 | Upload file to candidate |
| `candidate.uploadResume` | ❌ | 🟡 | Upload resume |
| `candidate.anonymize` | ❌ | ⚪ | GDPR anonymization |
| `candidate.removeTag` | ❌ | 🟡 | Remove tag from candidate |

**Coverage: 8/15 (53%)**

---

## Applications (13 endpoints)

| Endpoint | Status | Priority | Notes |
|----------|--------|----------|-------|
| `application.info` | ✅ | - | Get application by ID |
| `application.list` | ✅ | - | List applications (paginated) |
| `application.listHistory` | ✅ | - | Get stage history |
| `application.listCriteriaEvaluations` | ❌ | 🟡 | Get evaluation scores |
| `application.create` | ✅ | - | Create application |
| `application.update` | ❌ | ⚪ | Update application |
| `application.changeStage` | ✅ | - | Move/archive application |
| `application.changeSource` | ❌ | 🟡 | Change source |
| `application.transfer` | ✅ | - | Transfer to different job |
| `application.updateHistory` | ❌ | ⚪ | Update history entry |
| `application.addHiringTeamMember` | ❌ | 🟡 | Add hiring team member |
| `application.removeHiringTeamMember` | ❌ | ⚪ | Remove hiring team member |
| `application.hire` | ❌ | 🔴 | Mark as hired |

**Coverage: 6/13 (46%)**

---

## Jobs (8 endpoints)

| Endpoint | Status | Priority | Notes |
|----------|--------|----------|-------|
| `job.list` | ✅ | - | List all jobs |
| `job.info` | ✅ | - | Get job by ID |
| `job.search` | ❌ | 🟡 | Search jobs by title |
| `job.create` | ❌ | ⚪ | Create new job |
| `job.update` | ❌ | ⚪ | Update job details |
| `job.setStatus` | ❌ | ⚪ | Change job status |
| `job.updateCompensation` | ❌ | ⚪ | Update compensation |
| `job.listHiringTeam` | ❌ | 🟡 | Get job's hiring team |

**Coverage: 2/8 (25%)**

---

## Interviews (3 endpoints)

| Endpoint | Status | Priority | Notes |
|----------|--------|----------|-------|
| `interview.list` | ✅ | - | List all interviews |
| `interview.info` | ✅ | - | Get interview by ID |
| `interviewEvent.list` | ✅ | - | List interview events |

**Coverage: 3/3 (100%)** ✅

---

## Interview Schedules (4 endpoints)

| Endpoint | Status | Priority | Notes |
|----------|--------|----------|-------|
| `interviewSchedule.list` | ✅ | - | List schedules |
| `interviewSchedule.create` | ✅ | - | Create schedule |
| `interviewSchedule.update` | ✅ | - | Reschedule |
| `interviewSchedule.cancel` | ✅ | - | Cancel interview |

**Coverage: 4/4 (100%)** ✅

---

## Interview Plans (1 endpoint)

| Endpoint | Status | Priority | Notes |
|----------|--------|----------|-------|
| `interviewPlan.list` | ✅ | - | List interview plans |

**Coverage: 1/1 (100%)** ✅

---

## Interview Stages (2 endpoints)

| Endpoint | Status | Priority | Notes |
|----------|--------|----------|-------|
| `interviewStage.list` | ❌ | 🟡 | Requires interviewPlanId; we derive from interviewPlan.list |
| `interviewStage.info` | ❌ | ⚪ | Get stage by ID |

**Coverage: 0/2 (0%)** - We derive stages from interview plans instead

---

## Offers (7 endpoints)

| Endpoint | Status | Priority | Notes |
|----------|--------|----------|-------|
| `offer.list` | ✅ | - | List all offers |
| `offer.info` | ✅ | - | Get offer by ID |
| `offer.create` | ✅ | - | Create new offer |
| `offer.update` | ✅ | - | Update offer details |
| `offer.approve` | ✅ | - | Approve offer |
| `offer.start` | ✅ | - | Send to candidate |
| `offerProcess.start` | ✅ | - | Start offer process |

**Coverage: 7/7 (100%)** ✅

---

## Users (5 endpoints)

| Endpoint | Status | Priority | Notes |
|----------|--------|----------|-------|
| `user.list` | ✅ | - | List all users |
| `user.info` | ✅ | - | Get user by ID |
| `user.search` | ✅ | - | Search by name/email |
| `user.interviewerSettings` | ❌ | ⚪ | Get interviewer settings |
| `user.updateInterviewerSettings` | ❌ | ⚪ | Update interviewer settings |

**Coverage: 3/5 (60%)**

---

## Feedback (4 endpoints)

| Endpoint | Status | Priority | Notes |
|----------|--------|----------|-------|
| `applicationFeedback.list` | ✅ | - | List feedback for app |
| `applicationFeedback.submit` | ❌ | 🟡 | Submit feedback |
| `feedbackSubmission.list` | ✅ | - | List submissions |
| `feedbackSubmission.info` | ✅ | - | Get submission details |

**Coverage: 3/4 (75%)**

---

## Archive Reasons (1 endpoint)

| Endpoint | Status | Priority | Notes |
|----------|--------|----------|-------|
| `archiveReason.list` | ✅ | - | List rejection reasons |

**Coverage: 1/1 (100%)** ✅

---

## Hiring Teams (4 endpoints)

| Endpoint | Status | Priority | Notes |
|----------|--------|----------|-------|
| `hiringTeamRole.list` | ✅ | - | List hiring team roles |
| `applicationHiringTeamRole.list` | ✅ | - | List roles for application |
| `hiringTeam.addMember` | ❌ | 🟡 | Add member to job team |
| `hiringTeam.removeMember` | ❌ | ⚪ | Remove member |

**Coverage: 2/4 (50%)**

---

## Sources (2 endpoints)

| Endpoint | Status | Priority | Notes |
|----------|--------|----------|-------|
| `source.list` | ✅ | - | List candidate sources |
| `sourceTrackingLink.list` | ❌ | ⚪ | List tracking links |

**Coverage: 1/2 (50%)**

---

## Candidate Tags (2 endpoints)

| Endpoint | Status | Priority | Notes |
|----------|--------|----------|-------|
| `candidateTag.list` | ✅ | - | List all tags |
| `candidateTag.create` | ❌ | 🟡 | Create new tag |

**Coverage: 1/2 (50%)**

---

## Custom Fields (6 endpoints)

| Endpoint | Status | Priority | Notes |
|----------|--------|----------|-------|
| `customField.list` | ✅ | - | List custom fields |
| `customField.info` | ❌ | ⚪ | Get field details |
| `customField.create` | ❌ | ⚪ | Create custom field |
| `customField.setValue` | ❌ | 🟡 | Set field value |
| `customField.setValues` | ❌ | ⚪ | Set multiple values |
| `customField.updateSelectableValues` | ❌ | ⚪ | Update dropdown options |

**Coverage: 1/6 (17%)**

---

## Locations (8 endpoints)

| Endpoint | Status | Priority | Notes |
|----------|--------|----------|-------|
| `location.list` | ✅ | - | List locations |
| `location.info` | ❌ | ⚪ | Get location details |
| `location.create` | ❌ | ⚪ | Create location |
| `location.archive` | ❌ | ⚪ | Archive location |
| `location.restore` | ❌ | ⚪ | Restore location |
| `location.move` | ❌ | ⚪ | Move in hierarchy |
| `location.updateName` | ❌ | ⚪ | Update name |
| `location.updateAddress` | ❌ | ⚪ | Update address |

**Coverage: 1/8 (13%)**

---

## Departments (7 endpoints)

| Endpoint | Status | Priority | Notes |
|----------|--------|----------|-------|
| `department.list` | ✅ | - | List departments |
| `department.info` | ❌ | ⚪ | Get department details |
| `department.create` | ❌ | ⚪ | Create department |
| `department.update` | ❌ | ⚪ | Update department |
| `department.archive` | ❌ | ⚪ | Archive department |
| `department.restore` | ❌ | ⚪ | Restore department |
| `department.move` | ❌ | ⚪ | Move in hierarchy |

**Coverage: 1/7 (14%)**

---

## Interviewer Pools (8 endpoints)

| Endpoint | Status | Priority | Notes |
|----------|--------|----------|-------|
| `interviewerPool.list` | ❌ | ⚪ | List pools |
| `interviewerPool.info` | ❌ | ⚪ | Get pool details |
| `interviewerPool.create` | ❌ | ⚪ | Create pool |
| `interviewerPool.update` | ❌ | ⚪ | Update pool |
| `interviewerPool.archive` | ❌ | ⚪ | Archive pool |
| `interviewerPool.restore` | ❌ | ⚪ | Restore pool |
| `interviewerPool.addUser` | ❌ | ⚪ | Add user to pool |
| `interviewerPool.removeUser` | ❌ | ⚪ | Remove user |

**Coverage: 0/8 (0%)** - Admin function, not needed for recruiters

---

## Projects (3 endpoints)

| Endpoint | Status | Priority | Notes |
|----------|--------|----------|-------|
| `project.list` | ❌ | ⚪ | List projects |
| `project.info` | ❌ | ⚪ | Get project details |
| `project.search` | ❌ | ⚪ | Search projects |

**Coverage: 0/3 (0%)** - Rarely used feature

---

## Reports (2 endpoints)

| Endpoint | Status | Priority | Notes |
|----------|--------|----------|-------|
| `report.generate` | ❌ | 🟡 | Generate async report |
| `report.synchronous` | ❌ | 🟡 | Generate sync report |

**Coverage: 0/2 (0%)** - Could be valuable for analytics

---

## Openings/Requisitions (11 endpoints)

| Endpoint | Status | Priority | Notes |
|----------|--------|----------|-------|
| `opening.list` | ❌ | ⚪ | List openings |
| `opening.info` | ❌ | ⚪ | Get opening details |
| `opening.search` | ❌ | ⚪ | Search openings |
| `opening.create` | ❌ | ⚪ | Create opening |
| `opening.update` | ❌ | ⚪ | Update opening |
| `opening.addJob` | ❌ | ⚪ | Link job |
| `opening.removeJob` | ❌ | ⚪ | Unlink job |
| `opening.addLocation` | ❌ | ⚪ | Add location |
| `opening.removeLocation` | ❌ | ⚪ | Remove location |
| `opening.setOpeningState` | ❌ | ⚪ | Change state |
| `opening.setArchived` | ❌ | ⚪ | Archive |

**Coverage: 0/11 (0%)** - Enterprise feature

---

## Job Postings (3 endpoints)

| Endpoint | Status | Priority | Notes |
|----------|--------|----------|-------|
| `jobPosting.list` | ❌ | ⚪ | List postings |
| `jobPosting.info` | ❌ | ⚪ | Get posting details |
| `jobPosting.update` | ❌ | ⚪ | Update posting |

**Coverage: 0/3 (0%)** - Usually managed in Ashby UI

---

## Assessments (5 endpoints)

| Endpoint | Status | Priority | Notes |
|----------|--------|----------|-------|
| `assessment.list` | ❌ | ⚪ | List assessments |
| `assessment.start` | ❌ | ⚪ | Start assessment |
| `assessment.update` | ❌ | ⚪ | Update assessment |
| `assessment.cancel` | ❌ | ⚪ | Cancel assessment |
| `assessment.addCompletedToCandidate` | ❌ | ⚪ | Add completed |

**Coverage: 0/5 (0%)** - Integration-specific

---

## Other Categories (Low Priority ~25 endpoints)

| Category | Endpoints | Status | Notes |
|----------|-----------|--------|-------|
| Webhooks | 4 | ❌ | Admin config |
| Surveys | 5 | ❌ | Rarely via chat |
| Referrals | 2 | ❌ | Could add |
| Communication Templates | 1 | ❌ | Admin |
| Feedback Form Definitions | 2 | ❌ | Admin |
| Close Reasons | 1 | ❌ | Similar to archive |
| Job Templates | 1 | ❌ | Admin |
| Job Boards | 1 | ❌ | Admin |
| Approvals | 2 | ❌ | Could add |
| Application Forms | 1 | ❌ | Public endpoint |
| Files | 1 | ❌ | Could add |
| Brand | 1 | ❌ | Admin |
| API Key | 1 | ❌ | Admin |

**Coverage: 0/~25 (0%)** - Mostly admin/config functions

---

## Priority Legend

| Symbol | Meaning | Action |
|--------|---------|--------|
| ✅ | Implemented | Done |
| 🔴 | High Priority | Critical for workflows |
| 🟡 | Medium Priority | Valuable for power users |
| ⚪ | Low Priority | Nice to have / Admin only |

---

## High Priority Missing Endpoints

These endpoints would add significant value:

1. **`application.hire`** 🔴 - Mark candidate as hired
2. **`candidate.uploadResume`** 🟡 - Upload resume files
3. **`candidate.removeTag`** 🟡 - Remove tags
4. **`job.search`** 🟡 - Search jobs by title
5. **`application.changeSource`** 🟡 - Update source tracking
6. **`application.addHiringTeamMember`** 🟡 - Modify hiring team
7. **`applicationFeedback.submit`** 🟡 - Submit feedback via bot
8. **`candidateTag.create`** 🟡 - Create new tags
9. **`customField.setValue`** 🟡 - Set custom field values
10. **`report.synchronous`** 🟡 - Generate reports

---

## Implementation Summary

**Total Ashby API Endpoints:** ~145 (documented)
**Currently Implemented:** 45 (31%)

### By Workflow Coverage:

| Workflow | Status |
|----------|--------|
| Candidate search & lookup | ✅ Complete |
| Application management | ✅ Complete |
| Interview scheduling | ✅ Complete |
| Offer management | ✅ Complete |
| Pipeline visibility | ✅ Complete |
| Feedback viewing | ✅ Complete |
| Feedback submission | ❌ Missing |
| File uploads | ❌ Missing |
| Report generation | ❌ Missing |
| Admin/config | ❌ Not needed |
