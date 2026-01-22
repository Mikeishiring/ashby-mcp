# Ashby API Audit Report

## Overview

This document provides a comprehensive audit of our Ashby MCP implementation against the official Ashby API documentation.

**Audit Date:** 2026-01-20
**Documentation Source:** https://developers.ashbyhq.com/reference

---

## Complete Ashby API Endpoint List

Based on the official Ashby API documentation, here are ALL available endpoints:

### API Key
| Endpoint | Our Implementation | Status |
|----------|-------------------|--------|
| `apiKey.info` | Not implemented | MISSING |

### Application (12 endpoints)
| Endpoint | Our Implementation | Status |
|----------|-------------------|--------|
| `application.changeSource` | Not implemented | MISSING |
| `application.changeStage` | `moveApplicationStage()` | OK |
| `application.create` | `createApplication()` | OK |
| `application.info` | `getApplication()` | OK |
| `application.list` | `listApplications()` | OK |
| `application.transfer` | `transferApplication()` | OK |
| `application.update` | Not implemented | MISSING |
| `application.updateHistory` | Not implemented | MISSING |
| `application.listHistory` | `getApplicationHistory()` | OK |
| `application.addHiringTeamMember` | Not implemented | MISSING |
| `application.listCriteriaEvaluations` | `listCriteriaEvaluations()` | OK - NEW |
| `application.removeHiringTeamMember` | Not implemented | MISSING |

### Application Feedback (2 endpoints)
| Endpoint | Our Implementation | Status |
|----------|-------------------|--------|
| `applicationFeedback.list` | `getApplicationFeedback()` | OK |
| `applicationFeedback.submit` | Not implemented | MISSING |

### Application Hiring Team Role (1 endpoint)
| Endpoint | Our Implementation | Status |
|----------|-------------------|--------|
| `applicationHiringTeamRole.list` | `listApplicationHiringTeam()` | OK |

### Application Form (1 endpoint)
| Endpoint | Our Implementation | Status |
|----------|-------------------|--------|
| `applicationForm.submit` | Not implemented | MISSING |

### Approval (1 endpoint)
| Endpoint | Our Implementation | Status |
|----------|-------------------|--------|
| `approval.list` | Not implemented | MISSING |

### Approval Definition (1 endpoint)
| Endpoint | Our Implementation | Status |
|----------|-------------------|--------|
| `approvalDefinition.update` | Not implemented | MISSING |

### Archive Reason (1 endpoint)
| Endpoint | Our Implementation | Status |
|----------|-------------------|--------|
| `archiveReason.list` | `listArchiveReasons()` | OK |

### Assessment (6 endpoints)
| Endpoint | Our Implementation | Status |
|----------|-------------------|--------|
| `assessment.addCompletedToCandidate` | Not implemented | MISSING |
| `assessment.start` | Partner API | N/A |
| `assessment.list` | Partner API | N/A |
| `assessment.update` | Not implemented | MISSING |
| `assessment.cancel` | Partner API | N/A |
| `customField.list` (Partner) | Partner API | N/A |

### Candidate (14 endpoints)
| Endpoint | Our Implementation | Status |
|----------|-------------------|--------|
| `candidate.addProject` | Not implemented | MISSING |
| `candidate.addTag` | `addCandidateTag()` | OK |
| `candidate.anonymize` | Not implemented | MISSING |
| `candidate.create` | `createCandidate()` | OK |
| `candidate.createNote` | `addNote()` | OK |
| `candidate.info` | `getCandidate()` | OK |
| `candidate.list` | `listCandidates()` | OK |
| `candidate.listClientInfo` | Not implemented | MISSING |
| `candidate.listNotes` | `getCandidateNotes()` | OK |
| `candidate.search` | `searchCandidates()` | OK |
| `candidate.listProjects` | Not implemented | MISSING |
| `candidate.update` | `updateCandidate()` | OK |
| `candidate.uploadFile` | Not implemented | MISSING |
| `candidate.uploadResume` | Not implemented | MISSING |

### Candidate Tag (2 endpoints)
| Endpoint | Our Implementation | Status |
|----------|-------------------|--------|
| `candidateTag.create` | Not implemented | MISSING |
| `candidateTag.list` | `listCandidateTags()` | OK |

### Close Reason (1 endpoint)
| Endpoint | Our Implementation | Status |
|----------|-------------------|--------|
| `closeReason.list` | Not implemented | MISSING - for closing jobs |

### Communication Template (1 endpoint)
| Endpoint | Our Implementation | Status |
|----------|-------------------|--------|
| `communicationTemplate.list` | Not implemented | MISSING |

### Custom Field (6 endpoints)
| Endpoint | Our Implementation | Status |
|----------|-------------------|--------|
| `customField.create` | Not implemented | MISSING |
| `customField.info` | Not implemented | MISSING |
| `customField.list` | `listCustomFields()` | OK |
| `customField.setValue` | Not implemented | MISSING |
| `customField.setValues` | Not implemented | MISSING |
| `customField.updateSelectableValues` | Not implemented | MISSING |

### Department & Team (5 endpoints)
| Endpoint | Our Implementation | Status |
|----------|-------------------|--------|
| `department.create` | Not implemented | MISSING |
| `department.archive` | Not implemented | MISSING |
| `department.restore` | Not implemented | MISSING |
| `department.move` | Not implemented | MISSING |
| `department.update` | Not implemented | MISSING |

### Department (2 endpoints)
| Endpoint | Our Implementation | Status |
|----------|-------------------|--------|
| `department.info` | Not implemented | MISSING |
| `department.list` | `listDepartments()` | OK |

### File (1 endpoint)
| Endpoint | Our Implementation | Status |
|----------|-------------------|--------|
| `file.info` | Not implemented | MISSING |

### Feedback Form Definition (2 endpoints)
| Endpoint | Our Implementation | Status |
|----------|-------------------|--------|
| `feedbackFormDefinition.info` | Not implemented | MISSING |
| `feedbackFormDefinition.list` | Not implemented | MISSING |

### Hiring Team (2 endpoints)
| Endpoint | Our Implementation | Status |
|----------|-------------------|--------|
| `hiringTeam.addMember` | Not implemented | MISSING |
| `hiringTeam.removeMember` | Not implemented | MISSING |

### Hiring Team Role (1 endpoint)
| Endpoint | Our Implementation | Status |
|----------|-------------------|--------|
| `hiringTeamRole.list` | `listHiringTeamRoles()` | OK |

### Interview (2 endpoints)
| Endpoint | Our Implementation | Status |
|----------|-------------------|--------|
| `interview.info` | `getInterview()` | OK |
| `interview.list` | `listInterviews()` | OK |

### Interview Event (1 endpoint)
| Endpoint | Our Implementation | Status |
|----------|-------------------|--------|
| `interviewEvent.list` | `listInterviewEvents()` | OK |

### Interview Plan (1 endpoint)
| Endpoint | Our Implementation | Status |
|----------|-------------------|--------|
| `interviewPlan.list` | `listInterviewPlans()` | OK |

### Interview Schedule (4 endpoints)
| Endpoint | Our Implementation | Status |
|----------|-------------------|--------|
| `interviewSchedule.cancel` | `cancelInterviewSchedule()` | OK |
| `interviewSchedule.create` | `createInterviewSchedule()` | OK |
| `interviewSchedule.list` | `listInterviewSchedules()` | OK |
| `interviewSchedule.update` | `updateInterviewSchedule()` | OK |

### Interview Stage (2 endpoints) - FIXED
| Endpoint | Our Implementation | Status |
|----------|-------------------|--------|
| `interviewStage.list` | `listInterviewStagesForPlan()`, `listInterviewStages()` | OK |
| `interviewStage.info` | `getInterviewStage()` | OK |

**FIXED:** Now uses proper `interviewStage.list` API. Added `listInterviewStagesForPlan(interviewPlanId)` for per-plan listing.

### Interview Stage Group (1 endpoint)
| Endpoint | Our Implementation | Status |
|----------|-------------------|--------|
| `interviewStageGroup.list` | Not implemented | MISSING |

### Interviewer Pool (8 endpoints)
| Endpoint | Our Implementation | Status |
|----------|-------------------|--------|
| `interviewerPool.list` | Not implemented | MISSING |
| `interviewerPool.info` | Not implemented | MISSING |
| `interviewerPool.create` | Not implemented | MISSING |
| `interviewerPool.update` | Not implemented | MISSING |
| `interviewerPool.archive` | Not implemented | MISSING |
| `interviewerPool.restore` | Not implemented | MISSING |
| `interviewerPool.addUser` | Not implemented | MISSING |
| `interviewerPool.removeUser` | Not implemented | MISSING |

### Job (7 endpoints)
| Endpoint | Our Implementation | Status |
|----------|-------------------|--------|
| `job.create` | Not implemented | MISSING |
| `job.info` | `getJob()` | OK |
| `job.list` | `listJobs()` | OK |
| `job.setStatus` | Not implemented | MISSING |
| `job.update` | Not implemented | MISSING |
| `job.updateCompensation` | Not implemented | MISSING |
| `job.search` | Not implemented | MISSING |

**NOTE:** `job.search` only searches by title, not status. Client-side filtering is correct. Comment updated.

### Job Board (1 endpoint)
| Endpoint | Our Implementation | Status |
|----------|-------------------|--------|
| `jobBoard.list` | Not implemented | MISSING |

### Job Posting (3 endpoints)
| Endpoint | Our Implementation | Status |
|----------|-------------------|--------|
| `jobPosting.info` | Not implemented | MISSING |
| `jobPosting.list` | Not implemented | MISSING |
| `jobPosting.update` | Not implemented | MISSING |

### Job Template (1 endpoint)
| Endpoint | Our Implementation | Status |
|----------|-------------------|--------|
| `jobTemplate.list` | Not implemented | MISSING |

### Location (10 endpoints)
| Endpoint | Our Implementation | Status |
|----------|-------------------|--------|
| `location.archive` | Not implemented | MISSING |
| `location.create` | Not implemented | MISSING |
| `location.info` | Not implemented | MISSING |
| `location.list` | `listLocations()` | OK |
| `location.move` | Not implemented | MISSING |
| `location.restore` | Not implemented | MISSING |
| `location.updateAddress` | Not implemented | MISSING |
| `location.updateName` | Not implemented | MISSING |
| `location.updateRemoteStatus` | Not implemented | MISSING |
| `location.updateWorkplaceType` | Not implemented | MISSING |

### Offer (6 endpoints)
| Endpoint | Our Implementation | Status |
|----------|-------------------|--------|
| `offer.create` | `createOffer()` | OK |
| `offer.approve` | `approveOffer()` | OK |
| `offer.info` | `getOffer()` | OK |
| `offer.list` | `listOffers()` | OK |
| `offer.start` | `startOffer()` | OK |
| `offer.update` | `updateOffer()` | OK |

### Offer Process (1 endpoint)
| Endpoint | Our Implementation | Status |
|----------|-------------------|--------|
| `offerProcess.start` | `startOfferProcess()` | OK |

### Opening (11 endpoints)
| Endpoint | Our Implementation | Status |
|----------|-------------------|--------|
| `opening.info` | Not implemented | MISSING |
| `opening.list` | Not implemented | MISSING |
| `opening.search` | Not implemented | MISSING |
| `opening.create` | Not implemented | MISSING |
| `opening.addJob` | Not implemented | MISSING |
| `opening.removeJob` | Not implemented | MISSING |
| `opening.addLocation` | Not implemented | MISSING |
| `opening.removeLocation` | Not implemented | MISSING |
| `opening.setOpeningState` | Not implemented | MISSING |
| `opening.setArchived` | Not implemented | MISSING |
| `opening.update` | Not implemented | MISSING |

### Project (3 endpoints)
| Endpoint | Our Implementation | Status |
|----------|-------------------|--------|
| `project.info` | Not implemented | MISSING |
| `project.list` | Not implemented | MISSING |
| `project.search` | Not implemented | MISSING |

### Referral (1 endpoint)
| Endpoint | Our Implementation | Status |
|----------|-------------------|--------|
| `referral.create` | Not implemented | MISSING |

### Referral Form (1 endpoint)
| Endpoint | Our Implementation | Status |
|----------|-------------------|--------|
| `referralForm.info` | Not implemented | MISSING |

### Report (2 endpoints)
| Endpoint | Our Implementation | Status |
|----------|-------------------|--------|
| `report.generate` | Not implemented | MISSING |
| `report.synchronous` | Not implemented | MISSING |

### Source (1 endpoint)
| Endpoint | Our Implementation | Status |
|----------|-------------------|--------|
| `source.list` | `listSources()` | OK |

### Source Tracking Links (1 endpoint)
| Endpoint | Our Implementation | Status |
|----------|-------------------|--------|
| `sourceTrackingLink.list` | Not implemented | MISSING |

### Survey Form Definition (2 endpoints)
| Endpoint | Our Implementation | Status |
|----------|-------------------|--------|
| `surveyFormDefinition.info` | Not implemented | MISSING |
| `surveyFormDefinition.list` | Not implemented | MISSING |

### Survey Request (2 endpoints)
| Endpoint | Our Implementation | Status |
|----------|-------------------|--------|
| `surveyRequest.create` | Not implemented | MISSING |
| `surveyRequest.list` | Not implemented | MISSING |

### Survey Submission (2 endpoints)
| Endpoint | Our Implementation | Status |
|----------|-------------------|--------|
| `surveySubmission.create` | Not implemented | MISSING |
| `surveySubmission.list` | Not implemented | MISSING |

### User (5 endpoints)
| Endpoint | Our Implementation | Status |
|----------|-------------------|--------|
| `user.info` | `getUser()` | OK |
| `user.list` | `listUsers()` | OK |
| `user.search` | `searchUsers()` | OK |
| `user.interviewerSettings` | Not implemented | MISSING |
| `user.updateInterviewerSettings` | Not implemented | MISSING |

### Webhook (4 endpoints)
| Endpoint | Our Implementation | Status |
|----------|-------------------|--------|
| `webhook.create` | Not implemented | MISSING |
| `webhook.update` | Not implemented | MISSING |
| `webhook.info` | Not implemented | MISSING |
| `webhook.delete` | Not implemented | MISSING |

### Brand (1 endpoint)
| Endpoint | Our Implementation | Status |
|----------|-------------------|--------|
| `brand.list` | Not implemented | MISSING |

### Feedback Submission - ⚠️ ENDPOINTS DO NOT EXIST
| Endpoint | Our Implementation | Status |
|----------|-------------------|--------|
| `feedbackSubmission.list` | ~~`listFeedbackSubmissions()`~~ | ❌ **DOES NOT EXIST** - Fixed to use `applicationFeedback.list` |
| `feedbackSubmission.info` | ~~`getFeedbackSubmission()`~~ | ❌ **DOES NOT EXIST** - Marked deprecated, throws error |

**FIXED:** These endpoints were never documented in the Ashby API. The correct endpoint is `applicationFeedback.list` which is used by `getApplicationFeedback()`. The `listFeedbackSubmissions()` method now delegates to `getApplicationFeedback()` and applies client-side filtering for `interviewId` and `authorId` parameters.

---

## Summary Statistics

### Implementation Coverage

| Category | Total Endpoints | Implemented | Missing | Coverage |
|----------|----------------|-------------|---------|----------|
| Application | 12 | 6 | 6 | 50% |
| Application Feedback | 2 | 1 | 1 | 50% |
| Application Hiring Team | 1 | 1 | 0 | 100% |
| Application Form | 1 | 0 | 1 | 0% |
| Approval | 2 | 0 | 2 | 0% |
| Archive Reason | 1 | 1 | 0 | 100% |
| Assessment | 6 | 0 | 6 | 0% |
| Candidate | 14 | 9 | 5 | 64% |
| Candidate Tag | 2 | 1 | 1 | 50% |
| Close Reason | 1 | 0 | 1 | 0% |
| Communication Template | 1 | 0 | 1 | 0% |
| Custom Field | 6 | 1 | 5 | 17% |
| Department | 7 | 1 | 6 | 14% |
| File | 1 | 0 | 1 | 0% |
| Feedback Form Definition | 2 | 0 | 2 | 0% |
| Feedback Submission | 0 | 0 | 0 | N/A - Endpoints don't exist |
| Hiring Team | 3 | 1 | 2 | 33% |
| Interview | 2 | 2 | 0 | 100% |
| Interview Event | 1 | 1 | 0 | 100% |
| Interview Plan | 1 | 1 | 0 | 100% |
| Interview Schedule | 4 | 4 | 0 | 100% |
| Interview Stage | 2 | 0 | 2 | 0% |
| Interview Stage Group | 1 | 0 | 1 | 0% |
| Interviewer Pool | 8 | 0 | 8 | 0% |
| Job | 7 | 2 | 5 | 29% |
| Job Board | 1 | 0 | 1 | 0% |
| Job Posting | 3 | 0 | 3 | 0% |
| Job Template | 1 | 0 | 1 | 0% |
| Location | 10 | 1 | 9 | 10% |
| Offer | 6 | 6 | 0 | 100% |
| Offer Process | 1 | 1 | 0 | 100% |
| Opening | 11 | 0 | 11 | 0% |
| Project | 3 | 0 | 3 | 0% |
| Referral | 2 | 0 | 2 | 0% |
| Report | 2 | 0 | 2 | 0% |
| Source | 1 | 1 | 0 | 100% |
| Source Tracking Links | 1 | 0 | 1 | 0% |
| Survey | 6 | 0 | 6 | 0% |
| User | 5 | 3 | 2 | 60% |
| Webhook | 4 | 0 | 4 | 0% |
| Brand | 1 | 0 | 1 | 0% |
| API Key | 1 | 0 | 1 | 0% |

**TOTAL: ~145 endpoints, ~45 implemented, ~100 missing (~31% coverage)**

---

## Critical Issues Found (RESOLVED)

### 1. Interview Stage List - ✅ FIXED

**Previous Issue:** Was extracting stages from applications instead of using proper API.

**Resolution:** Now uses `interviewStage.list` API with `interviewPlanId` parameter.
- Added `listInterviewStagesForPlan(interviewPlanId)`
- `listInterviewStages()` fetches all plans, then stages for each
- Added `getInterviewStage()` using `interviewStage.info`

### 2. Job List Status Filter Comment - ✅ CLARIFIED

**Previous Issue:** Comment suggested `job.search` might support status filtering.

**Resolution:** Verified that `job.search` only searches by **title**, not status.
Client-side filtering for status is the correct approach. Comment updated to be accurate.

### 3. Missing Feedback Submission Endpoint - ✅ FIXED

**Issue:** We were calling `feedbackSubmission.list` and `feedbackSubmission.info` which don't exist.

**Resolution:** Verified via API documentation that these endpoints DO NOT EXIST.
- `feedbackSubmission.list` - No such endpoint. Fixed `listFeedbackSubmissions()` to use `applicationFeedback.list` internally
- `feedbackSubmission.info` - No such endpoint. Marked deprecated and throws clear error

**Note:** The `applicationFeedback.list` endpoint returns full `FeedbackSubmission` objects with all details, so there's no need for a separate `.info` endpoint.

---

## CRITICAL ISSUES FOUND AND FIXED (2026-01-20)

After systematically reading ALL API documentation pages, 6 critical issues were discovered and fixed:

### Issue #1: `archiveApplication()` Missing Required Parameter ✅ FIXED

**Problem:** `archiveApplication()` was missing required `interviewStageId` parameter.

**Fix Applied:**
- Updated `archiveApplication()` to require `interviewStageId` parameter
- Added "Archived" to `InterviewStageType`
- Updated `rejectCandidate()` service method to find the archived stage from interview plan

---

### Issue #2: `listInterviews()` Filters Don't Exist ✅ FIXED

**Problem:** `listInterviews()` was passing non-existent filters (applicationId, userId, startDate, endDate).

**Fix Applied:**
- Removed fake filters from `listInterviews()`, now only supports actual API params: `includeArchived`, `includeNonSharedInterviews`
- Updated service layer to use `interviewSchedule.list` for scheduled events
- Updated `getCandidateStatusAnalysis()` to use `InterviewEvent[]` instead of `Interview[]`
- Updated tool definition and executor

---

### Issue #3: `createOffer()` Completely Wrong Parameters ✅ FIXED

**Problem:** Offer API uses a 3-step form-based flow, not direct field values.

**Fix Applied:**
- Rewrote offer API to follow correct flow: `startOfferProcess` → `startOffer` → `createOffer`
- Added new tools: `start_offer_process`, `start_offer`
- Updated `createOffer` to accept form-based params: `offerProcessId`, `offerFormId`, `offerForm`
- Updated `updateOffer` to accept `offerForm` object
- Updated `approveOffer` to use `offerVersionId` instead of `offerId`
- Removed non-existent `send_offer` tool

---

### Issue #4: `OfferStatus` Type is Wrong ✅ FIXED

**Problem:** Our status values didn't match API values.

**Fix Applied:**
- Updated `OfferStatus` type to: `WaitingOnApprovalStart`, `WaitingOnOfferApproval`, `WaitingOnApprovalDefinition`, `WaitingOnCandidateResponse`, `CandidateRejected`, `CandidateAccepted`, `OfferCancelled`
- Added new `OfferAcceptanceStatus` type
- Updated `Offer` interface to be form-based
- Updated service layer pending offer detection logic

---

### Issue #5: `CreateCandidateParams` Structure Wrong ✅ FIXED

**Problem:** Our type had wrong field structure (socialLinks, source nesting, etc).

**Fix Applied:**
- Updated `CreateCandidateParams` to match API: `name`, `email`, `phoneNumber`, `linkedInUrl`, `githubUrl`, `website`, `alternateEmailAddresses`, `sourceId`, `creditedToUserId`, `location`, `createdAt`
- Removed non-existent fields: `socialLinks`, `resumeFileHandle`, `customFields`, `source` object
- Updated executor to use correct field names
- Updated tool definition (email no longer required)

---

### Issue #6: `ApplicationStatus` May Have Extra Value ✅ FIXED

**Problem:** "Converted" value not in API documentation.

**Fix Applied:**
- Removed "Converted" from `ApplicationStatus` type
- Now only: `Active`, `Hired`, `Archived`, `Lead`

---

## Remaining Work

### P0 - Critical Fixes ✅ ALL COMPLETE

All 6 critical issues have been fixed.

### P1 - High Value Missing Features

1. **`candidate.uploadResume`** - Resume upload capability
2. **`candidate.uploadFile`** - File attachment capability

### P2 - Medium Value

1. **`application.update`** - Update application fields
2. **`applicationFeedback.submit`** - Submit feedback programmatically
3. **`customField.setValue`** - Set custom field values
4. **`report.generate`** - Generate reports
5. **`opening.*`** - Full opening management (11 endpoints)

### P3 - Low Priority (Admin Features)

1. Webhook management endpoints
2. Department/Team management
3. Location management
4. Interviewer Pool management
5. Survey endpoints

---

## Parameter Verification Complete ✅

All key endpoints have been verified against API documentation:

| Endpoint | Status | Notes |
|----------|--------|-------|
| `application.list` | ✅ Verified | Supports: createdAfter, cursor, syncToken, limit, status, jobId, expand |
| `application.changeStage` | ⚠️ Issue | Requires interviewStageId (we don't pass it for archive) |
| `application.create` | ✅ Verified | Correct parameters |
| `candidate.search` | ✅ Verified | email, name params, 100 result limit confirmed |
| `candidate.list` | ✅ Verified | Standard pagination params |
| `candidate.create` | ⚠️ Issue | Wrong parameter structure |
| `interview.list` | ⚠️ Issue | We pass unsupported filters |
| `offer.create` | ❌ Wrong | Completely wrong API structure |
| `offer.list` | ⚠️ Issue | Wrong OfferStatus values |
| `interviewSchedule.list` | ✅ Verified | applicationId filter exists |
| `applicationFeedback.list` | ✅ Verified | applicationId filter exists |

---

## API Conventions Verification

### Pagination Implementation - CORRECT

Our pagination implementation matches the official Ashby documentation:

**Response Structure:**
```json
{
  "success": true,
  "results": [...],
  "moreDataAvailable": true|false,
  "nextCursor": "some-token-value",
  "syncToken": "sync-token-value"
}
```

**Our Implementation:** `getAllPaginated()` and `requestPaginated()` in `client.ts:109-189` correctly handles:
- ✅ Cursor-based pagination with `nextCursor`
- ✅ Checking `moreDataAvailable` to continue
- ✅ Loop until `moreDataAvailable` is false

**Missing Feature:** We don't implement incremental sync with `syncToken`. This could be added for efficiency but is not critical.

### Offer Field Types - IMPORTANT

The `offer.create` endpoint accepts various field types:
- `Boolean` - A boolean value
- `Currency` - `{ currencyCode: "USD", value: 100000 }` format
- `Date` - ISO Date string
- `Number` - An integer
- `String` - A string
- `ValueSelect` - String matching selectable option
- `MultiValueSelect` - Array of strings

**Our Implementation:** Our `createOffer()` uses simpler types (salary as number, dates as strings). This may need enhancement for custom offer fields.

### Search Endpoint Limits

`candidate.search` is limited to 100 results and designed for autocomplete use cases. For larger result sets, use `candidate.list` with pagination. Our comment in `searchCandidates()` should note this limitation.

---

## Verified Working Endpoints

Through documentation review, these endpoints are confirmed correctly implemented:

1. **Authentication** - Basic auth with API key as username, empty password ✅
2. **Pagination** - Cursor-based pagination ✅
3. **Core Candidate CRUD** - create, info, list, search, update ✅
4. **Core Application CRUD** - create, info, list, changeStage, transfer ✅
5. **Interview Scheduling** - create, list, update, cancel ✅
6. **Offers** - create, list, info, update, approve, start ✅
7. **Notes** - createNote, listNotes ✅
8. **Feedback** - applicationFeedback.list ✅
9. **Metadata** - sources, tags, archiveReasons, departments, locations ✅

---

## Implementation Status (Updated 2026-01-20)

### Completed

1. ✅ **Fixed `listInterviewStages()`** - Now uses proper `interviewStage.list` API
   - Added `listInterviewStagesForPlan(interviewPlanId)` - lists stages for specific plan
   - `listInterviewStages()` now fetches all plans, then gets stages for each
   - Properly deduplicates stages across plans

2. ✅ **Added `interviewStage.info`** - `getInterviewStage(interviewStageId)` now uses proper API

3. ✅ **Added `application.listCriteriaEvaluations`** - New AI criteria evaluation endpoint
   - Added `CriteriaEvaluation` type (fields may need verification via testing)
   - Requires AI Application Review feature to be enabled

4. ✅ **Updated code comments** - Removed inaccurate statements about missing APIs

5. ✅ **Documented search limits** - Added JSDoc noting 100 result limit on candidate.search

6. ✅ **Clarified job.search** - Confirmed it only searches by title, not status
   - Client-side filtering for status is the correct approach

7. ✅ **Fixed `listFeedbackSubmissions()`** - Was using non-existent `feedbackSubmission.list`
   - Now delegates to `getApplicationFeedback()` (uses correct `applicationFeedback.list` API)
   - Client-side filtering for `interviewId` and `authorId` parameters

8. ✅ **Deprecated `getFeedbackSubmission()`** - Was using non-existent `feedbackSubmission.info`
   - Marked deprecated with clear error message
   - Recommends using `getApplicationFeedback()` which returns full details

### Still Needs Testing

1. ✅ ~~**`feedbackSubmission.*` endpoints**~~ - RESOLVED: These endpoints don't exist, fixed implementation
2. **`CriteriaEvaluation` type fields** - Based on documentation, may need adjustment

### Remaining Work (P2)

1. **Add file upload endpoints** - `candidate.uploadResume`, `candidate.uploadFile`
2. **Add custom field management** - `customField.setValue`, `customField.setValues`
3. **Consider incremental sync** - Implement `syncToken` for efficient data fetching
