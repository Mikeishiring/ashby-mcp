/**
 * Tool Executor
 *
 * Handles execution of Claude tool calls against the Ashby service.
 */

import type { AshbyService } from "../ashby/service.js";
import type { SafetyGuards } from "../safety/guards.js";
import type { ToolResult } from "../types/index.js";
import { isWriteTool } from "./tools.js";

interface ToolInput {
  query?: string;
  limit?: number;
  days?: number;
  job_id?: string;
  job_title?: string;
  candidate_id?: string;
  name_or_email?: string;
  content?: string;
  target_stage?: string;
  start_time?: string;
  end_time?: string;
  interviewer_ids?: string[];
  meeting_link?: string;
  location?: string;
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
          toolName === "add_note"
            ? "add_note"
            : toolName === "schedule_interview"
              ? "add_note" // Treat scheduling like add_note for safety purposes
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
