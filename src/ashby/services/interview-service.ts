/**
 * Interview Service
 *
 * Handles interview scheduling, plans, and related operations.
 */

import type { AshbyClient } from "../client.js";
import type { SearchService } from "./search-service.js";
import type {
  Interview,
  InterviewPlan,
  InterviewSchedule,
  InterviewEvent,
  User,
} from "../../types/index.js";
import { ErrorCode, AppError } from "../../utils/errors.js";

export class InterviewService {
  constructor(
    private readonly client: AshbyClient,
    private readonly searchService: SearchService
  ) {}

  async listInterviewPlans(): Promise<InterviewPlan[]> {
    return this.client.listInterviewPlans();
  }

  async listUsers(): Promise<User[]> {
    return this.client.listUsers();
  }

  /**
   * Find an Ashby user by their email address.
   * Useful for mapping Slack users to Ashby users.
   */
  async getUserByEmail(email: string): Promise<User | null> {
    const users = await this.client.listUsers();
    const normalizedEmail = email.toLowerCase();
    return users.find((u) => u.email.toLowerCase() === normalizedEmail) ?? null;
  }

  /**
   * Get upcoming interviews for a specific user (interviewer).
   * Optionally filter by candidate name to find a specific interview.
   */
  async getUpcomingInterviewsForUser(
    userId: string,
    options?: { candidateName?: string; limit?: number }
  ): Promise<Interview[]> {
    const now = new Date().toISOString();
    const allInterviews = await this.client.listInterviews({
      userId,
      startDate: now,
    });

    let interviews = allInterviews
      .filter((i) => i.scheduledStartTime && new Date(i.scheduledStartTime) > new Date())
      .sort((a, b) => {
        if (!a.scheduledStartTime || !b.scheduledStartTime) return 0;
        return new Date(a.scheduledStartTime).getTime() - new Date(b.scheduledStartTime).getTime();
      });

    // Filter by candidate name if provided
    if (options?.candidateName) {
      const searchTerm = options.candidateName.toLowerCase();
      // We need to get application info to filter by candidate
      // This is expensive, so only do it if a name is provided
      const interviewsWithCandidate = await Promise.all(
        interviews.map(async (interview) => {
          try {
            const application = await this.client.getApplication(interview.applicationId);
            const candidate = application.candidate;
            if (!candidate) return null;
            const nameMatch = candidate.name.toLowerCase().includes(searchTerm);
            return nameMatch ? interview : null;
          } catch {
            return null;
          }
        })
      );
      interviews = interviewsWithCandidate.filter((i): i is Interview => i !== null);
    }

    return interviews.slice(0, options?.limit ?? 10);
  }

  async getInterviewSchedulesForCandidate(candidateId: string): Promise<InterviewSchedule[]> {
    const { applications } = await this.client.getCandidateWithApplications(candidateId);

    // Get schedules for all applications - use allSettled to handle partial failures
    const results = await Promise.allSettled(
      applications.map((app) => this.client.listInterviewSchedules(app.id))
    );

    // Extract successful results, ignore failures
    return results
      .filter((r): r is PromiseFulfilledResult<InterviewSchedule[]> => r.status === "fulfilled")
      .flatMap((r) => r.value);
  }

  async scheduleInterview(
    candidateId: string,
    startTime: string,
    endTime: string,
    interviewerIds: string[],
    meetingLink?: string,
    location?: string,
    applicationId?: string
  ): Promise<InterviewSchedule> {
    const activeApp = await this.searchService.getActiveApplicationForCandidate(candidateId, applicationId);

    if (!activeApp) {
      throw new AppError(ErrorCode.NO_ACTIVE_APPLICATION, "No active application found for this candidate");
    }

    // Look up interviewer emails from user IDs
    const users = await this.client.listUsers();
    const userMap = new Map(users.map((u) => [u.id, u]));

    const interviewers = interviewerIds.map((id) => {
      const user = userMap.get(id);
      if (!user) {
        throw new AppError(ErrorCode.USER_NOT_FOUND, `Could not find user with ID ${id}`);
      }
      return {
        email: user.email,
        feedbackRequired: true,
      };
    });

    const event: {
      startTime: string;
      endTime: string;
      interviewers: Array<{ email: string; feedbackRequired: boolean }>;
      location?: string;
      meetingLink?: string;
    } = {
      startTime,
      endTime,
      interviewers,
    };

    if (meetingLink) event.meetingLink = meetingLink;
    if (location) event.location = location;

    return this.client.createInterviewSchedule(activeApp.id, [event]);
  }

  async listAllInterviews(filters?: {
    applicationId?: string;
    userId?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<Interview[]> {
    return this.client.listInterviews(filters);
  }

  async getInterview(interviewId: string): Promise<Interview> {
    return this.client.getInterview(interviewId);
  }

  async getUpcomingInterviews(limit: number = 10): Promise<Interview[]> {
    const now = new Date().toISOString();
    const allInterviews = await this.client.listInterviews({
      startDate: now,
    });

    return allInterviews
      .filter((i) => i.scheduledStartTime && new Date(i.scheduledStartTime) > new Date())
      .sort((a, b) => {
        if (!a.scheduledStartTime || !b.scheduledStartTime) return 0;
        return new Date(a.scheduledStartTime).getTime() - new Date(b.scheduledStartTime).getTime();
      })
      .slice(0, limit);
  }

  async rescheduleInterview(
    interviewScheduleId: string,
    newStartTime: string,
    newEndTime: string,
    interviewerIds: string[],
    meetingLink?: string,
    location?: string
  ): Promise<InterviewSchedule> {
    // Look up interviewer emails from user IDs
    const users = await this.client.listUsers();
    const userMap = new Map(users.map((u) => [u.id, u]));

    const interviewers = interviewerIds.map((id) => {
      const user = userMap.get(id);
      if (!user) {
        throw new AppError(ErrorCode.USER_NOT_FOUND, `Could not find user with ID ${id}`);
      }
      return {
        email: user.email,
        feedbackRequired: true,
      };
    });

    const event: {
      startTime: string;
      endTime: string;
      interviewers: Array<{ email: string; feedbackRequired: boolean }>;
      location?: string;
      meetingLink?: string;
    } = {
      startTime: newStartTime,
      endTime: newEndTime,
      interviewers,
    };

    if (meetingLink) event.meetingLink = meetingLink;
    if (location) event.location = location;

    return this.client.updateInterviewSchedule(interviewScheduleId, [event]);
  }

  async cancelInterview(
    interviewScheduleId: string,
    cancellationReason?: string
  ): Promise<{ success: boolean }> {
    return this.client.cancelInterviewSchedule(interviewScheduleId, cancellationReason);
  }

  async listInterviewEvents(interviewScheduleId?: string): Promise<InterviewEvent[]> {
    return this.client.listInterviewEvents(interviewScheduleId);
  }
}
