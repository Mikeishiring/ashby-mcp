/**
 * Tool Executor
 *
 * Handles execution of Claude tool calls against the Ashby service.
 */

import type { AshbyService } from "../ashby/service.js";
import type { SafetyGuards } from "../safety/guards.js";
import type { ToolResult, Application } from "../types/index.js";
import { isWriteTool } from "./tools.js";

interface ToolInput {
  query?: string;
  limit?: number;
  days?: number;
  job_id?: string;
  job_title?: string;
  candidate_id?: string;
  candidate_ids?: string[];
  name_or_email?: string;
  content?: string;
  target_stage?: string;
  start_time?: string;
  end_time?: string;
  interviewer_ids?: string[];
  meeting_link?: string;
  location?: string;
  archive_reason_id?: string;
  remind_in?: string;
  note?: string;
  stage?: string;
  // Phase 1: Offers
  status?: string;
  offer_id?: string;
  offer_process_id?: string;
  start_date?: string;
  salary?: number;
  salary_frequency?: string;
  currency?: string;
  equity?: number;
  signing_bonus?: number;
  relocation_bonus?: number;
  notes?: string;
  approver_id?: string;
  // Phase 1: Interviews
  interview_schedule_id?: string;
  interview_id?: string;
  user_id?: string;
  end_date?: string;
  cancellation_reason?: string;
  // Phase 1: Candidate creation
  name?: string;
  email?: string;
  phone_number?: string;
  linkedin_url?: string;
  source_id?: string;
  tags?: string[];
  // Phase 3B: Tagging
  tag_id?: string;
  // Phase 3C: Hiring team & users
  application_id?: string;
  // Phase 3D/3E/3G: Feedback, custom fields, enhanced context
  feedback_submission_id?: string;
}

export class ToolExecutor {
  constructor(
    private readonly ashby: AshbyService,
    private readonly safety: SafetyGuards
  ) {}

  /**
   * Execute a tool call
   */
  async execute(toolName: string, input: ToolInput): Promise<ToolResult> {
    try {
      // Check if write operation needs confirmation
      if (isWriteTool(toolName)) {
        const candidateId = await this.resolveCandidateId(input);
        if (!candidateId) {
          return {
            success: false,
            error: "Could not identify candidate. Please provide a name, email, or candidate ID.",
          };
        }

        const operationType =
          toolName === "add_note" || toolName === "schedule_interview" || toolName === "set_reminder"
            ? "add_note"
            : toolName === "reject_candidate"
              ? "move_stage" // Rejecting is like moving stage (destructive)
              : "move_stage";

        const check = await this.safety.checkWriteOperation({
          type: operationType,
          candidateIds: [candidateId],
        });

        if (!check.allowed) {
          return { success: false, error: check.reason ?? "Operation not allowed" };
        }

        if (check.requiresConfirmation) {
          return {
            success: true,
            requiresConfirmation: true,
            data: {
              candidateId,
              toolName,
              input,
            },
          };
        }
      }

      // Execute the tool
      return await this.executeInternal(toolName, input);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: message };
    }
  }

  /**
   * Execute a confirmed write operation
   */
  async executeConfirmed(
    toolName: string,
    input: ToolInput,
    candidateId: string
  ): Promise<ToolResult> {
    try {
      if (toolName === "add_note") {
        const note = await this.ashby.addNote(candidateId, input.content ?? "");
        return {
          success: true,
          data: { note, message: "Note added successfully." },
        };
      }

      if (toolName === "move_candidate_stage") {
        const stage = await this.ashby.findStageByName(input.target_stage ?? "");
        if (!stage) {
          return {
            success: false,
            error: `Could not find stage "${input.target_stage}". Please check the stage name.`,
          };
        }

        // Get the application ID from the candidate
        const { applications } = await this.ashby.getCandidateFullContext(candidateId);
        const activeApp = applications.find((a) => a.status === "Active");
        if (!activeApp) {
          return {
            success: false,
            error: "No active application found for this candidate.",
          };
        }

        const result = await this.ashby.moveToStage(activeApp.id, stage.id);
        return {
          success: true,
          data: {
            application: result,
            message: `Candidate moved to ${stage.title}.`,
          },
        };
      }

      if (toolName === "schedule_interview") {
        if (!input.start_time || !input.end_time || !input.interviewer_ids) {
          return {
            success: false,
            error: "Missing required fields: start_time, end_time, interviewer_ids",
          };
        }

        const schedule = await this.ashby.scheduleInterview(
          candidateId,
          input.start_time,
          input.end_time,
          input.interviewer_ids,
          input.meeting_link,
          input.location
        );

        return {
          success: true,
          data: {
            schedule,
            message: `Interview scheduled successfully.`,
          },
        };
      }

      if (toolName === "reject_candidate") {
        if (!input.archive_reason_id) {
          return {
            success: false,
            error: "Missing required field: archive_reason_id. Use get_rejection_reasons to get available reasons.",
          };
        }

        const result = await this.ashby.rejectCandidate(candidateId, input.archive_reason_id);
        return {
          success: true,
          data: {
            application: result,
            message: "Candidate rejected/archived. If Ashby has rejection email automation configured, an email will be sent.",
          },
        };
      }

      if (toolName === "set_reminder") {
        // Reminders need special handling - they require the Slack client
        // For now, return data that the bot can use to schedule the reminder
        return {
          success: true,
          data: {
            candidateId,
            remindIn: input.remind_in,
            note: input.note,
            message: "Reminder will be scheduled.",
            requiresSlackScheduling: true,
          },
        };
      }

      // =========================================================================
      // Phase 1: Offer Write Operations
      // =========================================================================

      if (toolName === "create_offer") {
        if (!input.offer_process_id || !input.start_date || !input.salary) {
          return {
            success: false,
            error: "Missing required fields: offer_process_id, start_date, salary",
          };
        }

        const offer = await this.ashby.createOffer({
          candidateId,
          offerProcessId: input.offer_process_id,
          startDate: input.start_date,
          salary: input.salary,
          ...(input.salary_frequency && { salaryFrequency: input.salary_frequency as "Annual" | "Hourly" }),
          ...(input.currency && { currency: input.currency }),
          ...(input.equity !== undefined && { equity: input.equity }),
          ...(input.signing_bonus !== undefined && { signingBonus: input.signing_bonus }),
          ...(input.relocation_bonus !== undefined && { relocationBonus: input.relocation_bonus }),
          ...(input.notes && { notes: input.notes }),
        });

        return {
          success: true,
          data: {
            offer,
            message: `Offer created successfully. Status: ${offer.status}`,
          },
        };
      }

      if (toolName === "update_offer") {
        if (!input.offer_id) {
          return { success: false, error: "Missing required field: offer_id" };
        }

        const updates: any = {};
        if (input.salary !== undefined) updates.salary = input.salary;
        if (input.start_date) updates.startDate = input.start_date;
        if (input.equity !== undefined) updates.equity = input.equity;
        if (input.signing_bonus !== undefined) updates.signingBonus = input.signing_bonus;
        if (input.relocation_bonus !== undefined) updates.relocationBonus = input.relocation_bonus;
        if (input.notes) updates.notes = input.notes;

        const offer = await this.ashby.updateOffer(input.offer_id, updates);

        return {
          success: true,
          data: {
            offer,
            message: `Offer updated successfully.`,
          },
        };
      }

      if (toolName === "approve_offer") {
        if (!input.offer_id || !input.approver_id) {
          return {
            success: false,
            error: "Missing required fields: offer_id, approver_id",
          };
        }

        const offer = await this.ashby.approveOffer(input.offer_id, input.approver_id);

        return {
          success: true,
          data: {
            offer,
            message: `Offer approved. Status: ${offer.status}`,
          },
        };
      }

      if (toolName === "send_offer") {
        if (!input.offer_id) {
          return { success: false, error: "Missing required field: offer_id" };
        }

        const offer = await this.ashby.sendOffer(input.offer_id);

        return {
          success: true,
          data: {
            offer,
            message: `Offer sent to candidate. Status: ${offer.status}`,
          },
        };
      }

      // =========================================================================
      // Phase 1: Interview Write Operations
      // =========================================================================

      if (toolName === "reschedule_interview") {
        if (!input.interview_schedule_id || !input.start_time || !input.end_time || !input.interviewer_ids) {
          return {
            success: false,
            error: "Missing required fields: interview_schedule_id, start_time, end_time, interviewer_ids",
          };
        }

        const schedule = await this.ashby.rescheduleInterview(
          input.interview_schedule_id,
          input.start_time,
          input.end_time,
          input.interviewer_ids,
          input.meeting_link,
          input.location
        );

        return {
          success: true,
          data: {
            schedule,
            message: `Interview rescheduled successfully.`,
          },
        };
      }

      if (toolName === "cancel_interview") {
        if (!input.interview_schedule_id) {
          return { success: false, error: "Missing required field: interview_schedule_id" };
        }

        const result = await this.ashby.cancelInterview(
          input.interview_schedule_id,
          input.cancellation_reason
        );

        return {
          success: true,
          data: {
            result,
            message: `Interview canceled successfully.`,
          },
        };
      }

      // =========================================================================
      // Phase 1: Candidate Creation
      // =========================================================================

      if (toolName === "create_candidate") {
        if (!input.name || !input.email) {
          return {
            success: false,
            error: "Missing required fields: name, email",
          };
        }

        const params: any = {
          name: input.name,
          email: input.email,
        };

        if (input.phone_number) params.phoneNumber = input.phone_number;
        if (input.linkedin_url) {
          params.socialLinks = [{
            url: input.linkedin_url,
            type: "LinkedIn",
          }];
        }
        if (input.tags) params.tags = input.tags;
        if (input.source_id) params.source = { sourceId: input.source_id };

        const candidate = await this.ashby.createCandidate(params);

        return {
          success: true,
          data: {
            candidate,
            message: `Candidate created successfully: ${candidate.name} (${candidate.primaryEmailAddress?.value})`,
          },
        };
      }

      // =========================================================================
      // Phase 3A: Application Management
      // =========================================================================

      if (toolName === "apply_to_job") {
        const candidateId = await this.resolveCandidateId(input);
        if (!candidateId) {
          return {
            success: false,
            error: "Could not identify candidate. Please provide a name, email, or candidate ID.",
          };
        }

        const jobId = await this.resolveJobId(input);
        if (!jobId) {
          return {
            success: false,
            error: "Could not identify job. Please provide a job title or job ID.",
          };
        }

        const params: { candidateId: string; jobId: string; sourceId?: string } = {
          candidateId,
          jobId,
        };
        if (input.source_id) {
          params.sourceId = input.source_id;
        }

        const application = await this.ashby.createApplication(params);

        return {
          success: true,
          data: {
            application,
            message: `Application created successfully for candidate.`,
          },
        };
      }

      if (toolName === "transfer_application") {
        const candidateId = await this.resolveCandidateId(input);
        if (!candidateId) {
          return {
            success: false,
            error: "Could not identify candidate. Please provide a name, email, or candidate ID.",
          };
        }

        // Get the active application
        const { applications } = await this.ashby.getCandidateWithApplications(candidateId);
        const activeApp = applications.find((a: Application) => a.status === "Active");
        if (!activeApp) {
          return {
            success: false,
            error: "No active application found for candidate.",
          };
        }

        const jobId = await this.resolveJobId(input);
        if (!jobId) {
          return {
            success: false,
            error: "Could not identify job. Please provide a job title or job ID.",
          };
        }

        const application = await this.ashby.transferApplication(activeApp.id, jobId);

        return {
          success: true,
          data: {
            application,
            message: `Application transferred successfully to new job.`,
          },
        };
      }

      // =========================================================================
      // Phase 3B: Tagging
      // =========================================================================

      if (toolName === "add_candidate_tag") {
        const candidateId = await this.resolveCandidateId(input);
        if (!candidateId) {
          return {
            success: false,
            error: "Could not identify candidate. Please provide a name, email, or candidate ID.",
          };
        }

        if (!input.tag_id) {
          return {
            success: false,
            error: "Missing required field: tag_id. Use list_candidate_tags to see available tags.",
          };
        }

        const candidate = await this.ashby.addCandidateTag(candidateId, input.tag_id);

        return {
          success: true,
          data: {
            candidate,
            message: `Tag added successfully to candidate.`,
          },
        };
      }

      return { success: false, error: "Unknown write operation" };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: message };
    }
  }

  /**
   * Internal execution without safety checks
   */
  private async executeInternal(
    toolName: string,
    input: ToolInput
  ): Promise<ToolResult> {
    switch (toolName) {
      case "get_pipeline_overview": {
        const summary = await this.ashby.getPipelineSummary();
        return { success: true, data: summary };
      }

      case "get_stale_candidates": {
        const candidates = await this.ashby.getStaleCandidates(input.limit ?? 10);
        return { success: true, data: candidates };
      }

      case "get_candidates_needing_decision": {
        const candidates = await this.ashby.getCandidatesNeedingDecision(
          input.limit ?? 10
        );
        return { success: true, data: candidates };
      }

      case "get_recent_applications": {
        const applications = await this.ashby.getRecentApplications(
          input.days ?? 7
        );
        return { success: true, data: applications };
      }

      case "search_candidates": {
        if (!input.query) {
          return { success: false, error: "Search query is required" };
        }
        const candidates = await this.ashby.searchCandidates(input.query);
        return { success: true, data: candidates };
      }

      case "get_candidates_for_job": {
        const jobId = await this.resolveJobId(input);
        if (!jobId) {
          return {
            success: false,
            error: "Could not identify job. Please provide a job ID or title.",
          };
        }
        const { job, candidates } = await this.ashby.getJobWithCandidates(jobId);
        return { success: true, data: { job, candidates } };
      }

      case "get_candidate_details": {
        const candidateId = await this.resolveCandidateId(input);
        if (!candidateId) {
          return {
            success: false,
            error: "Could not identify candidate. Please provide a name, email, or candidate ID.",
          };
        }

        const check = await this.safety.checkReadOperation(candidateId);
        if (!check.allowed) {
          return { success: false, error: check.reason ?? "Access denied" };
        }

        const context = await this.ashby.getCandidateFullContext(candidateId);
        return { success: true, data: context };
      }

      case "get_open_jobs": {
        const jobs = await this.ashby.getOpenJobs();
        return { success: true, data: jobs };
      }

      case "get_job_details": {
        const jobId = await this.resolveJobId(input);
        if (!jobId) {
          return {
            success: false,
            error: "Could not identify job. Please provide a job ID or title.",
          };
        }
        const { job, candidates } = await this.ashby.getJobWithCandidates(jobId);
        return { success: true, data: { job, candidates } };
      }

      case "list_interview_plans": {
        const plans = await this.ashby.listInterviewPlans();
        return { success: true, data: plans };
      }

      case "get_interview_schedules": {
        const candidateId = await this.resolveCandidateId(input);
        if (!candidateId) {
          return {
            success: false,
            error: "Could not identify candidate. Please provide a name, email, or candidate ID.",
          };
        }
        const schedules = await this.ashby.getInterviewSchedulesForCandidate(
          candidateId
        );
        return { success: true, data: schedules };
      }

      case "get_team_members": {
        const users = await this.ashby.listUsers();
        return { success: true, data: users };
      }

      // =========================================================================
      // New Feature Tools
      // =========================================================================

      case "get_candidate_scorecard": {
        const candidateId = await this.resolveCandidateId(input);
        if (!candidateId) {
          return {
            success: false,
            error: "Could not identify candidate. Please provide a name, email, or candidate ID.",
          };
        }
        const scorecard = await this.ashby.getCandidateScorecard(candidateId);
        return { success: true, data: scorecard };
      }

      case "list_feedback_submissions": {
        // Build filters
        const filters: {
          applicationId?: string;
          interviewId?: string;
        } = {};

        // Get application ID for the candidate if provided
        if (input.candidate_id || input.name_or_email) {
          const candidateId = await this.resolveCandidateId(input);
          if (!candidateId) {
            return {
              success: false,
              error: "Could not identify candidate. Please provide a name, email, or candidate ID.",
            };
          }
          const { applications } = await this.ashby.getCandidateWithApplications(candidateId);
          const activeApp = applications.find((a: Application) => a.status === "Active");
          if (!activeApp) {
            return {
              success: false,
              error: "No active application found for candidate.",
            };
          }
          filters.applicationId = activeApp.id;
        }

        // Add interview filter if provided
        if (input.interview_id) {
          filters.interviewId = input.interview_id;
        }

        const feedback = await this.ashby.listFeedbackSubmissions(filters);
        return { success: true, data: feedback };
      }

      case "compare_candidates": {
        const jobId = input.job_title ? await this.resolveJobId(input) : undefined;
        const comparison = await this.ashby.compareCandidates(
          input.candidate_ids,
          jobId ?? undefined,
          input.limit ?? 3
        );
        return { success: true, data: comparison };
      }

      case "get_source_analytics": {
        const analytics = await this.ashby.getSourceAnalytics(input.days ?? 90);
        return { success: true, data: analytics };
      }

      case "get_interview_prep": {
        const candidateId = await this.resolveCandidateId(input);
        if (!candidateId) {
          return {
            success: false,
            error: "Could not identify candidate. Please provide a name, email, or candidate ID.",
          };
        }
        const prepPacket = await this.ashby.getInterviewPrepPacket(candidateId);
        return { success: true, data: prepPacket };
      }

      case "get_rejection_reasons": {
        const reasons = await this.ashby.getArchiveReasons();
        return { success: true, data: reasons };
      }

      case "list_candidate_tags": {
        const tags = await this.ashby.listCandidateTags();
        return { success: true, data: tags };
      }

      case "list_candidate_sources": {
        const sources = await this.ashby.listSources();
        return { success: true, data: sources };
      }

      case "get_hiring_team": {
        let applicationId = input.application_id;

        if (!applicationId && input.candidate_id) {
          const { applications } = await this.ashby.getCandidateWithApplications(input.candidate_id);
          const activeApp = applications.find((a: Application) => a.status === "Active");
          if (activeApp) applicationId = activeApp.id;
        }

        if (!applicationId) {
          const candidateId = await this.resolveCandidateId(input);
          if (candidateId) {
            const { applications } = await this.ashby.getCandidateWithApplications(candidateId);
            const activeApp = applications.find((a: Application) => a.status === "Active");
            if (activeApp) applicationId = activeApp.id;
          }
        }

        if (!applicationId) {
          return {
            success: false,
            error: "Could not find active application for candidate.",
          };
        }

        const hiringTeam = await this.ashby.getApplicationHiringTeam(applicationId);
        return { success: true, data: hiringTeam };
      }

      case "search_users": {
        if (!input.name && !input.email) {
          return {
            success: false,
            error: "Please provide either name or email to search.",
          };
        }
        const params: { name?: string; email?: string } = {};
        if (input.name) params.name = input.name;
        if (input.email) params.email = input.email;

        const users = await this.ashby.searchUsers(params);
        return { success: true, data: users };
      }

      case "get_feedback_details": {
        if (!input.feedback_submission_id) {
          return {
            success: false,
            error: "Missing required field: feedback_submission_id",
          };
        }
        const feedback = await this.ashby.getFeedbackDetails(input.feedback_submission_id);
        return { success: true, data: feedback };
      }

      case "list_custom_fields": {
        const customFields = await this.ashby.listCustomFields();
        return { success: true, data: customFields };
      }

      case "list_locations": {
        const locations = await this.ashby.listLocations();
        return { success: true, data: locations };
      }

      case "list_departments": {
        const departments = await this.ashby.listDepartments();
        return { success: true, data: departments };
      }

      case "get_application_history": {
        let applicationId = input.application_id;

        if (!applicationId) {
          const candidateId = await this.resolveCandidateId(input);
          if (candidateId) {
            const { applications } = await this.ashby.getCandidateWithApplications(candidateId);
            const activeApp = applications.find((a: Application) => a.status === "Active");
            if (activeApp) applicationId = activeApp.id;
          }
        }

        if (!applicationId) {
          return {
            success: false,
            error: "Could not find application. Please provide application_id or candidate info.",
          };
        }

        const history = await this.ashby.getApplicationHistory(applicationId);
        return { success: true, data: history };
      }

      case "list_interview_events": {
        const events = await this.ashby.listInterviewEvents(input.interview_schedule_id);
        return { success: true, data: events };
      }

      case "start_triage": {
        // Get candidates for triage based on filters
        const jobId = input.job_title ? await this.resolveJobId(input) : undefined;
        let candidates;

        if (jobId) {
          const { candidates: jobCandidates } = await this.ashby.getJobWithCandidates(jobId);
          candidates = jobCandidates;
        } else {
          // Get recent applications or filter by stage
          candidates = await this.ashby.getRecentApplications(14);
        }

        // Filter by stage if specified
        if (input.stage) {
          const stageLower = input.stage.toLowerCase();
          candidates = candidates.filter((c) =>
            c.currentInterviewStage?.title.toLowerCase().includes(stageLower)
          );
        }

        // Limit candidates
        const limit = Math.min(input.limit ?? 5, 10);
        candidates = candidates.slice(0, limit);

        return {
          success: true,
          data: {
            candidates,
            message: `Found ${candidates.length} candidates for triage. React with ✅ to advance, ❌ to reject, or 🤔 to skip.`,
            triageMode: true,
          },
        };
      }

      // =========================================================================
      // Phase 1: Offers
      // =========================================================================

      case "list_offers": {
        const filters: { applicationId?: string; status?: any } = {};

        if (input.candidate_id) {
          const candidateId = await this.resolveCandidateId(input);
          if (candidateId) {
            const { applications } = await this.ashby["client"].getCandidateWithApplications(candidateId);
            const activeApp = applications.find(a => a.status === "Active");
            if (activeApp) filters.applicationId = activeApp.id;
          }
        }

        if (input.status) filters.status = input.status as any;

        const offers = await this.ashby.listOffers(filters);
        return { success: true, data: offers };
      }

      case "get_pending_offers": {
        const offers = await this.ashby.getPendingOffers();
        return { success: true, data: offers };
      }

      case "get_candidate_offer": {
        const candidateId = await this.resolveCandidateId(input);
        if (!candidateId) {
          return {
            success: false,
            error: "Could not identify candidate. Please provide a name, email, or candidate ID.",
          };
        }
        const offer = await this.ashby.getOfferForCandidate(candidateId);
        return { success: true, data: offer };
      }

      // =========================================================================
      // Phase 1: Interviews
      // =========================================================================

      case "list_all_interviews": {
        const filters: {
          applicationId?: string;
          userId?: string;
          startDate?: string;
          endDate?: string;
        } = {};

        if (input.candidate_id) {
          const candidateId = await this.resolveCandidateId(input);
          if (candidateId) {
            const { applications } = await this.ashby["client"].getCandidateWithApplications(candidateId);
            const activeApp = applications.find(a => a.status === "Active");
            if (activeApp) filters.applicationId = activeApp.id;
          }
        }

        if (input.user_id) filters.userId = input.user_id;
        if (input.start_date) filters.startDate = input.start_date;
        if (input.end_date) filters.endDate = input.end_date;

        const interviews = await this.ashby.listAllInterviews(filters);
        return { success: true, data: interviews };
      }

      case "get_upcoming_interviews": {
        const interviews = await this.ashby.getUpcomingInterviews(input.limit ?? 10);
        return { success: true, data: interviews };
      }

      // Phase A: Proactive Status Analysis
      case "analyze_candidate_status": {
        const candidateId = await this.resolveCandidateId(input);
        if (!candidateId) {
          return {
            success: false,
            error: "Could not find candidate. Please provide candidate_id, name, or email.",
          };
        }
        const analysis = await this.ashby.analyzeCandidateStatus(candidateId);
        return { success: true, data: analysis };
      }

      case "analyze_candidate_blockers": {
        const analysis = await this.ashby.analyzeCandidateBlockers(input.candidate_ids);
        return { success: true, data: analysis };
      }

      default:
        return { success: false, error: `Unknown tool: ${toolName}` };
    }
  }

  /**
   * Resolve a candidate ID from various input formats
   */
  private async resolveCandidateId(input: ToolInput): Promise<string | null> {
    if (input.candidate_id) {
      return input.candidate_id;
    }

    if (input.name_or_email) {
      const candidate = await this.ashby.findCandidateByNameOrEmail(
        input.name_or_email
      );
      return candidate?.id ?? null;
    }

    return null;
  }

  /**
   * Resolve a job ID from various input formats
   */
  private async resolveJobId(input: ToolInput): Promise<string | null> {
    if (input.job_id) {
      return input.job_id;
    }

    if (input.job_title) {
      const jobs = await this.ashby.getOpenJobs();
      const normalizedTitle = input.job_title.toLowerCase();
      const job = jobs.find((j) =>
        j.title.toLowerCase().includes(normalizedTitle)
      );
      return job?.id ?? null;
    }

    return null;
  }
}
