# Ashby API Endpoint Reference
**Complete endpoint catalog for internal reference**
**Last Updated:** 2026-01-19
**Source:** https://developers.ashbyhq.com/reference

---

## API Basics

- **Base URL:** `https://api.ashbyhq.com`
- **Auth:** Basic Authentication (API key as username, empty password)
- **Format:** RPC-style POST requests to `/{category}.{method}`
- **Content-Type:** `application/json`
- **Response:** `{ success: boolean, results: T, errors?: [...] }`

---

## Candidates (15 endpoints)

### Read Operations
- **`candidate.info`** - Get candidate by ID
  - Params: `{ candidateId: string }`
  - Returns: `Candidate`

- **`candidate.list`** - List all candidates (paginated)
  - Params: `{ cursor?: string }`
  - Returns: `Candidate[]` (paginated)

- **`candidate.search`** - Search candidates by name or email
  - Params: `{ name?: string, email?: string }`
  - Returns: `Candidate[]`

- **`candidate.listNotes`** - Get all notes for a candidate
  - Params: `{ candidateId: string }`
  - Returns: `Note[]`

- **`candidate.listProjects`** - Get candidate projects
  - Params: `{ candidateId: string }`
  - Returns: `Project[]`

- **`candidate.listClientInfo`** - Get client-visible info
  - Params: `{ candidateId: string }`
  - Returns: `ClientInfo`

### Write Operations
- **`candidate.create`** - Create new candidate
  - Params: `{ name: string, email: string, phoneNumber?: string, resumeFileHandle?: string, socialLinks?: SocialLink[], tags?: string[], source?: { sourceId: string } }`
  - Returns: `Candidate`
  - Permission: `candidatesWrite`

- **`candidate.update`** - Update candidate details
  - Params: `{ candidateId: string, name?: string, primaryEmailAddress?: string, ... }`
  - Returns: `Candidate`
  - Permission: `candidatesWrite`

- **`candidate.createNote`** - Add note to candidate
  - Params: `{ candidateId: string, content: string, visibility?: "Public" | "Private" }`
  - Returns: `Note`
  - Permission: `candidatesWrite`

- **`candidate.addTag`** - Add tag to candidate
  - Params: `{ candidateId: string, tagId: string }`
  - Returns: `Candidate`
  - Permission: `candidatesWrite`

- **`candidate.addProject`** - Add project to candidate
  - Params: `{ candidateId: string, projectId: string }`
  - Returns: Success
  - Permission: `candidatesWrite`

- **`candidate.uploadFile`** - Upload file to candidate
  - Params: `{ candidateId: string, fileHandle: string, fileName: string, fileType: string }`
  - Returns: `File`
  - Permission: `candidatesWrite`

- **`candidate.uploadResume`** - Upload resume
  - Params: `{ candidateId: string, fileHandle: string, fileName: string }`
  - Returns: `Resume`
  - Permission: `candidatesWrite`

- **`candidate.anonymize`** - Anonymize candidate (GDPR)
  - Params: `{ candidateId: string }`
  - Returns: Success
  - Permission: `admin`

---

## Applications (13 endpoints)

### Read Operations
- **`application.info`** - Get application by ID
  - Params: `{ applicationId: string }`
  - Returns: `Application`

- **`application.list`** - List applications (paginated)
  - Params: `{ jobId?: string, interviewStageId?: string, status?: "Active" | "Hired" | "Archived", cursor?: string }`
  - Returns: `Application[]` (paginated)

- **`application.listHistory`** - Get application stage history
  - Params: `{ applicationId: string }`
  - Returns: `ApplicationHistory[]`

- **`application.listCriteriaEvaluations`** - Get evaluation scores
  - Params: `{ applicationId: string }`
  - Returns: `CriteriaEvaluation[]`

### Write Operations
- **`application.create`** - Create application for candidate
  - Params: `{ candidateId: string, jobId: string, source?: { sourceId: string }, creditedToUserId?: string }`
  - Returns: `Application`
  - Permission: `candidatesWrite`

- **`application.update`** - Update application
  - Params: `{ applicationId: string, ... }`
  - Returns: `Application`
  - Permission: `candidatesWrite`

- **`application.changeStage`** - Move to different stage OR archive
  - Params: `{ applicationId: string, interviewStageId?: string, archiveReasonId?: string }`
  - Returns: `Application`
  - Permission: `candidatesWrite`

- **`application.changeSource`** - Change application source
  - Params: `{ applicationId: string, sourceId: string, creditedToUserId?: string }`
  - Returns: `Application`
  - Permission: `candidatesWrite`

- **`application.transfer`** - Transfer to different job
  - Params: `{ applicationId: string, jobId: string }`
  - Returns: `Application`
  - Permission: `candidatesWrite`

- **`application.updateHistory`** - Update history entry
  - Params: `{ applicationId: string, historyId: string, ... }`
  - Returns: `ApplicationHistory`
  - Permission: `candidatesWrite`

- **`application.addHiringTeamMember`** - Add hiring team member
  - Params: `{ applicationId: string, userId: string, roleId: string }`
  - Returns: Success
  - Permission: `candidatesWrite`

- **`application.removeHiringTeamMember`** - Remove hiring team member
  - Params: `{ applicationId: string, userId: string, roleId: string }`
  - Returns: Success
  - Permission: `candidatesWrite`

---

## Jobs (8 endpoints)

### Read Operations
- **`job.list`** - List all jobs (paginated)
  - Params: `{ cursor?: string }`
  - Returns: `Job[]` (paginated)
  - Note: Filter by status client-side (API doesn't support status filter)

- **`job.info`** - Get job by ID
  - Params: `{ jobId: string }`
  - Returns: `Job`

- **`job.search`** - Search jobs by title
  - Params: `{ title: string }`
  - Returns: `Job[]`

### Write Operations
- **`job.create`** - Create new job
  - Params: `{ title: string, departmentId?: string, locationId?: string, employmentType?: string, ... }`
  - Returns: `Job`
  - Permission: `jobsWrite`

- **`job.update`** - Update job details
  - Params: `{ jobId: string, title?: string, description?: string, ... }`
  - Returns: `Job`
  - Permission: `jobsWrite`

- **`job.setStatus`** - Change job status
  - Params: `{ jobId: string, status: "Open" | "Closed" | "Draft" }`
  - Returns: `Job`
  - Permission: `jobsWrite`

- **`job.updateCompensation`** - Update compensation info
  - Params: `{ jobId: string, compensationTierSummary?: string, salaryRangeMin?: number, salaryRangeMax?: number, ... }`
  - Returns: `Job`
  - Permission: `jobsWrite`

---

## Interviews (3 endpoints)

### Read Operations
- **`interview.list`** - List all interviews (paginated)
  - Params: `{ applicationId?: string, userId?: string, startDate?: string, endDate?: string, cursor?: string }`
  - Returns: `Interview[]` (paginated)
  - **HIGH PRIORITY - NOT IMPLEMENTED**

- **`interview.info`** - Get interview by ID
  - Params: `{ interviewId: string }`
  - Returns: `Interview`

- **`interviewEvent.list`** - List interview events
  - Params: `{ interviewScheduleId?: string, cursor?: string }`
  - Returns: `InterviewEvent[]` (paginated)

---

## Interview Schedules (4 endpoints)

### Read Operations
- **`interviewSchedule.list`** - List interview schedules
  - Params: `{ applicationId?: string, cursor?: string }`
  - Returns: `InterviewSchedule[]` (paginated)

### Write Operations
- **`interviewSchedule.create`** - Create interview schedule
  - Params: `{ applicationId: string, interviewEvents: [{ startTime: ISO8601, endTime: ISO8601, interviewerIds: string[], location?: string, meetingLink?: string }] }`
  - Returns: `InterviewSchedule`
  - Permission: `interviewsWrite`

- **`interviewSchedule.update`** - Update/reschedule interview
  - Params: `{ interviewScheduleId: string, interviewEvents: [...] }`
  - Returns: `InterviewSchedule`
  - Permission: `interviewsWrite`
  - **HIGH PRIORITY - NOT IMPLEMENTED**

- **`interviewSchedule.cancel`** - Cancel interview
  - Params: `{ interviewScheduleId: string, cancellationReason?: string }`
  - Returns: Success
  - Permission: `interviewsWrite`
  - **HIGH PRIORITY - NOT IMPLEMENTED**

---

## Interview Plans (1 endpoint)

- **`interviewPlan.list`** - List interview plans
  - Params: `{ includeArchived?: boolean }`
  - Returns: `{ interviewPlans: InterviewPlan[] }`

---

## Interview Stages (2 endpoints)

- **`interviewStage.list`** - List interview stages
  - Params: `{ cursor?: string }`
  - Returns: `InterviewStage[]` (paginated)

- **`interviewStage.info`** - Get interview stage by ID
  - Params: `{ interviewStageId: string }`
  - Returns: `InterviewStage`

---

## Interview Stage Groups (1 endpoint)

- **`interviewStageGroup.list`** - List stage groups
  - Params: `{ cursor?: string }`
  - Returns: `InterviewStageGroup[]` (paginated)

---

## Offers (7 endpoints)

### Read Operations
- **`offer.list`** - List all offers (paginated)
  - Params: `{ applicationId?: string, status?: "Draft" | "Pending" | "Accepted" | "Declined" | "Expired", cursor?: string }`
  - Returns: `Offer[]` (paginated)
  - **CRITICAL - NOT IMPLEMENTED**

- **`offer.info`** - Get offer by ID
  - Params: `{ offerId: string }`
  - Returns: `Offer`
  - **CRITICAL - NOT IMPLEMENTED**

### Write Operations
- **`offer.create`** - Create new offer
  - Params: `{ applicationId: string, offerProcessId: string, startDate: string, salary: number, equity?: number, signingBonus?: number, ... }`
  - Returns: `Offer`
  - Permission: `offersWrite`
  - **CRITICAL - NOT IMPLEMENTED**

- **`offer.update`** - Update offer details
  - Params: `{ offerId: string, salary?: number, startDate?: string, ... }`
  - Returns: `Offer`
  - Permission: `offersWrite`
  - **CRITICAL - NOT IMPLEMENTED**

- **`offer.approve`** - Approve offer
  - Params: `{ offerId: string, approverId: string }`
  - Returns: `Offer`
  - Permission: `offersWrite`
  - **CRITICAL - NOT IMPLEMENTED**

- **`offer.start`** - Start offer (send to candidate)
  - Params: `{ offerId: string }`
  - Returns: `Offer`
  - Permission: `offersWrite`
  - **CRITICAL - NOT IMPLEMENTED**

- **`offerProcess.start`** - Start offer process for application
  - Params: `{ applicationId: string, offerProcessId: string }`
  - Returns: `OfferProcess`
  - Permission: `offersWrite`
  - **CRITICAL - NOT IMPLEMENTED**

---

## Users (4 endpoints)

- **`user.list`** - List all users (paginated)
  - Params: `{ cursor?: string }`
  - Returns: `User[]` (paginated)

- **`user.info`** - Get user by ID
  - Params: `{ userId: string }`
  - Returns: `User`

- **`user.search`** - Search users by name or email
  - Params: `{ name?: string, email?: string }`
  - Returns: `User[]`

- **`user.interviewerSettings`** - Get interviewer settings
  - Params: `{ userId: string }`
  - Returns: `InterviewerSettings`

- **`user.updateInterviewerSettings`** - Update interviewer settings
  - Params: `{ userId: string, ... }`
  - Returns: `InterviewerSettings`
  - Permission: `usersWrite`

---

## Application Feedback (2 endpoints)

- **`applicationFeedback.list`** - List feedback for application
  - Params: `{ applicationId: string }`
  - Returns: `{ feedbackSubmissions: FeedbackSubmission[] }`

- **`applicationFeedback.submit`** - Submit interview feedback
  - Params: `{ applicationId: string, interviewId: string, feedbackFormId: string, overallRecommendation?: string, overallRating?: number, fieldSubmissions: [...] }`
  - Returns: `FeedbackSubmission`
  - Permission: `feedbackWrite`

---

## Archive Reasons (1 endpoint)

- **`archiveReason.list`** - List rejection/archive reasons
  - Params: `{}`
  - Returns: `{ archiveReasons: ArchiveReason[] }`

---

## Hiring Teams (3 endpoints)

- **`hiringTeam.addMember`** - Add member to hiring team
  - Params: `{ jobId: string, userId: string, roleId: string }`
  - Returns: Success
  - Permission: `jobsWrite`

- **`hiringTeam.removeMember`** - Remove member from hiring team
  - Params: `{ jobId: string, userId: string, roleId: string }`
  - Returns: Success
  - Permission: `jobsWrite`

- **`hiringTeamRole.list`** - List hiring team roles
  - Params: `{}`
  - Returns: `HiringTeamRole[]`

- **`applicationHiringTeamRole.list`** - List roles for application
  - Params: `{ applicationId: string }`
  - Returns: `ApplicationHiringTeamRole[]`

---

## Interviewer Pools (8 endpoints)

- **`interviewerPool.list`** - List interviewer pools
  - Params: `{ cursor?: string }`
  - Returns: `InterviewerPool[]` (paginated)

- **`interviewerPool.info`** - Get pool details
  - Params: `{ interviewerPoolId: string }`
  - Returns: `InterviewerPool`

- **`interviewerPool.create`** - Create pool
  - Params: `{ name: string, interviewStageId: string }`
  - Returns: `InterviewerPool`
  - Permission: `interviewsWrite`

- **`interviewerPool.update`** - Update pool
  - Params: `{ interviewerPoolId: string, name?: string, ... }`
  - Returns: `InterviewerPool`
  - Permission: `interviewsWrite`

- **`interviewerPool.archive`** - Archive pool
  - Params: `{ interviewerPoolId: string }`
  - Returns: Success
  - Permission: `interviewsWrite`

- **`interviewerPool.restore`** - Restore archived pool
  - Params: `{ interviewerPoolId: string }`
  - Returns: Success
  - Permission: `interviewsWrite`

- **`interviewerPool.addUser`** - Add interviewer to pool
  - Params: `{ interviewerPoolId: string, userId: string }`
  - Returns: Success
  - Permission: `interviewsWrite`

- **`interviewerPool.removeUser`** - Remove interviewer from pool
  - Params: `{ interviewerPoolId: string, userId: string }`
  - Returns: Success
  - Permission: `interviewsWrite`

---

## Custom Fields (6 endpoints)

- **`customField.list`** - List custom fields
  - Params: `{ objectType?: "Candidate" | "Application" | "Job" | "Opening" }`
  - Returns: `CustomField[]`

- **`customField.info`** - Get custom field details
  - Params: `{ customFieldId: string }`
  - Returns: `CustomField`

- **`customField.create`** - Create custom field
  - Params: `{ title: string, objectType: string, fieldType: string, ... }`
  - Returns: `CustomField`
  - Permission: `customFieldsWrite`

- **`customField.setValue`** - Set custom field value
  - Params: `{ customFieldId: string, objectId: string, value: any }`
  - Returns: Success
  - Permission: `customFieldsWrite`

- **`customField.setValues`** - Set multiple custom field values
  - Params: `{ objectId: string, values: [{ customFieldId: string, value: any }] }`
  - Returns: Success
  - Permission: `customFieldsWrite`

- **`customField.updateSelectableValues`** - Update dropdown options
  - Params: `{ customFieldId: string, selectableValues: string[] }`
  - Returns: `CustomField`
  - Permission: `customFieldsWrite`

---

## Candidate Tags (2 endpoints)

- **`candidateTag.list`** - List all tags
  - Params: `{}`
  - Returns: `CandidateTag[]`

- **`candidateTag.create`** - Create new tag
  - Params: `{ title: string, isArchived?: boolean }`
  - Returns: `CandidateTag`
  - Permission: `candidatesWrite`

---

## Projects (3 endpoints)

- **`project.list`** - List projects
  - Params: `{ cursor?: string }`
  - Returns: `Project[]` (paginated)

- **`project.info`** - Get project details
  - Params: `{ projectId: string }`
  - Returns: `Project`

- **`project.search`** - Search projects
  - Params: `{ title: string }`
  - Returns: `Project[]`

---

## Reports (2 endpoints)

- **`report.generate`** - Generate async report
  - Params: `{ reportType: string, parameters: object }`
  - Returns: `{ reportId: string }`
  - Permission: `reportsRead`

- **`report.synchronous`** - Generate sync report
  - Params: `{ reportType: string, parameters: object }`
  - Returns: Report data
  - Permission: `reportsRead`

---

## Openings (11 endpoints)

- **`opening.list`** - List openings/requisitions
- **`opening.info`** - Get opening details
- **`opening.search`** - Search openings
- **`opening.create`** - Create opening
- **`opening.update`** - Update opening
- **`opening.addJob`** - Link job to opening
- **`opening.removeJob`** - Unlink job
- **`opening.addLocation`** - Add location
- **`opening.removeLocation`** - Remove location
- **`opening.setOpeningState`** - Change state
- **`opening.setArchived`** - Archive opening

---

## Job Postings (3 endpoints)

- **`jobPosting.list`** - List job postings
  - Params: `{ jobId?: string, cursor?: string }`
  - Returns: `JobPosting[]` (paginated)

- **`jobPosting.info`** - Get posting details
  - Params: `{ jobPostingId: string }`
  - Returns: `JobPosting`

- **`jobPosting.update`** - Update posting
  - Params: `{ jobPostingId: string, ... }`
  - Returns: `JobPosting`
  - Permission: `jobsWrite`

---

## Sources (2 endpoints)

- **`source.list`** - List candidate sources
  - Params: `{}`
  - Returns: `Source[]`

- **`sourceTrackingLink.list`** - List tracking links
  - Params: `{ sourceId?: string }`
  - Returns: `SourceTrackingLink[]`

---

## Departments (7 endpoints)

- **`department.list`**, **`department.info`**, **`department.create`**
- **`department.update`**, **`department.archive`**, **`department.restore`**, **`department.move`**

---

## Locations (8 endpoints)

- **`location.list`**, **`location.info`**, **`location.create`**
- **`location.archive`**, **`location.restore`**, **`location.move`**
- **`location.updateName`**, **`location.updateaddress`**, **`location.updateremotestatus`**, **`location.updateworkplacetype`**

---

## Assessments (5 endpoints)

- **`assessment.list`**, **`assessment.start`**, **`assessment.update`**, **`assessment.cancel`**, **`assessment.addCompletedToCandidate`**

---

## Other Categories (Low Priority)

- **Webhooks** (4 endpoints): `webhook.create`, `webhook.update`, `webhook.info`, `webhook.delete`
- **Surveys** (5 endpoints): Survey forms, requests, and submissions
- **Referrals** (2 endpoints): `referral.create`, `referralForm.info`
- **Communication Templates** (1 endpoint): `communicationTemplate.list`
- **Feedback Form Definitions** (2 endpoints): `feedbackFormDefinition.list`, `feedbackFormDefinition.info`
- **Close Reasons** (1 endpoint): `closeReason.list`
- **Job Templates** (1 endpoint): `jobTemplate.list`
- **Job Boards** (1 endpoint): `jobBoard.list`
- **Approvals** (2 endpoints): `approval.list`, `approvalDefinition.update`
- **Application Forms** (1 endpoint): `applicationForm.submit` (public endpoint)
- **Files** (1 endpoint): `file.info`
- **Brand** (1 endpoint): `brand.list`
- **API Key** (1 endpoint): `apiKey.info`

---

## Implementation Status Legend

- ✅ **Implemented** - Available in current codebase
- ❌ **Not Implemented** - Missing
- 🔴 **HIGH PRIORITY** - Critical for workflows
- 🟡 **MEDIUM PRIORITY** - Valuable for power users
- ⚪ **LOW PRIORITY** - Nice to have

---

**Total Endpoints:** 200+
**Currently Implemented:** 22 (11%)
**Phase 1 Target:** 32 (16%)
**Phase 2 Target:** 52 (26%)
**Phase 3 Target:** 65 (33%)
