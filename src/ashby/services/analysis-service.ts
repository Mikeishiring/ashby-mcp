/**
 * Analysis Service
 *
 * Handles proactive status analysis and blocker detection.
 */

import type { AshbyClient } from "../client.js";
import type { SearchService } from "./search-service.js";
import type { PipelineService } from "./pipeline-service.js";
import type {
  Application,
  BatchBlockerAnalysis,
  BlockerSeverity,
  BlockerType,
  Candidate,
  CandidateBlocker,
  CandidatePriority,
  CandidateStatusAnalysis,
  FeedbackSubmission,
  Interview,
  InterviewStage,
  Offer,
  RecentActivity,
} from "../../types/index.js";
import { logger } from "../../utils/logger.js";

export class AnalysisService {
  constructor(
    private readonly client: AshbyClient,
    private readonly searchService: SearchService,
    private readonly pipelineService: PipelineService,
    private readonly staleDays: number
  ) {}

  async analyzeCandidateStatus(
    candidateId: string,
    applicationId?: string
  ): Promise<CandidateStatusAnalysis> {
    // Get candidate with all applications
    const { candidate, applications } = await this.client.getCandidateWithApplications(candidateId);

    // Find active application
    const selectedApp = this.searchService.selectApplicationForRead(applications, applicationId);
    if (!selectedApp) {
      throw new Error("No application found for candidate");
    }

    // Get full application details
    const application = await this.client.getApplication(selectedApp.id);

    // Get current stage
    let currentStage: InterviewStage | null | undefined = application.currentInterviewStage;
    if (!currentStage && application.currentInterviewStageId) {
      currentStage = await this.client.getInterviewStage(application.currentInterviewStageId);
    }
    if (!currentStage) {
      const fallbackTitle = application.status === "Active" ? "Unknown" : application.status;
      currentStage = {
        id: application.currentInterviewStageId ?? `status:${fallbackTitle.toLowerCase()}`,
        title: fallbackTitle,
        orderInInterviewPlan: 0,
        interviewStageType: "Application",
      };
    }

    // Calculate days in stage
    const daysInStage = Math.floor((Date.now() - new Date(application.updatedAt).getTime()) / (1000 * 60 * 60 * 24));

    // Get all interviews for this application
    const allInterviews = await this.client.listInterviews({ applicationId: application.id });

    // Separate upcoming vs completed interviews
    const now = new Date();
    const upcomingInterviews = allInterviews.filter(i =>
      i.scheduledStartTime && new Date(i.scheduledStartTime) > now
    );
    const completedInterviews = allInterviews.filter(i =>
      i.scheduledStartTime && new Date(i.scheduledStartTime) < now
    );

    // Get feedback submissions for this application
    const feedbackSubmissions = await this.client.listFeedbackSubmissions({
      applicationId: application.id,
    });

    // Find interviews that don't have feedback yet
    const hasInterviewIds = feedbackSubmissions.some((feedback) => feedback.interviewId);
    const completedInterviewsWithoutFeedback =
      feedbackSubmissions.length === 0
        ? completedInterviews
        : hasInterviewIds
          ? completedInterviews.filter(
            (interview) =>
              !feedbackSubmissions.some((feedback) => feedback.interviewId === interview.id)
          )
          : [];

    // Get pending offer
    let pendingOffer: Offer | undefined;
    try {
      const offers = await this.client.listOffers({ applicationId: application.id });
      pendingOffer = offers.find(o => ["Draft", "Pending", "Approved"].includes(o.status));
    } catch {
      // Offers might not be available
    }

    // Detect blockers
    const blockers = this.detectBlockers({
      currentStage,
      daysInStage,
      upcomingInterviews,
      completedInterviewsWithoutFeedback,
      feedbackSubmissions,
      ...(pendingOffer && { pendingOffer }),
      application,
    });

    // Generate recent activity
    const recentActivity = this.generateRecentActivity({
      allInterviews,
      feedbackSubmissions,
      ...(pendingOffer && { pendingOffer }),
    });

    // Generate next steps
    const nextSteps = this.generateNextSteps(blockers, currentStage);

    // Calculate priority
    const priority = this.calculatePriority(blockers, daysInStage);

    return {
      candidate,
      application,
      currentStage,
      daysInStage,
      blockers,
      recentActivity,
      nextSteps,
      priority,
      upcomingInterviews,
      completedInterviewsWithoutFeedback,
      ...(pendingOffer && { pendingOffer }),
    };
  }

  async analyzeCandidateBlockers(candidateIds?: string[]): Promise<BatchBlockerAnalysis> {
    let candidates: Array<{ candidate: Candidate; applications: Application[] }> = [];

    if (candidateIds && candidateIds.length > 0) {
      // Analyze specific candidates
      candidates = await Promise.all(
        candidateIds.map(id => this.client.getCandidateWithApplications(id))
      );
    } else {
      // Analyze all stale candidates
      const stale = await this.pipelineService.getStaleCandidates();
      const uniqueCandidateIds = [...new Set(stale.map(app => app.candidateId))];
      candidates = await Promise.all(
        uniqueCandidateIds.map(id => this.client.getCandidateWithApplications(id))
      );
    }

    const byBlockerType: Record<BlockerType, Array<{
      candidate: Candidate;
      blocker: CandidateBlocker;
      daysInStage: number;
    }>> = {
      no_interview_scheduled: [],
      awaiting_feedback: [],
      ready_to_move: [],
      offer_pending: [],
      offer_not_sent: [],
      interview_completed_no_feedback: [],
      no_blocker: [],
    };

    const urgentCandidates: Array<{
      candidate: Candidate;
      blocker: CandidateBlocker;
      priority: CandidatePriority;
    }> = [];

    let criticalCount = 0;
    let warningCount = 0;
    let infoCount = 0;

    // Analyze each candidate
    for (const { candidate, applications } of candidates) {
      const activeApp = applications.find(a => a.status === "Active");
      if (!activeApp) continue;

      try {
        const analysis = await this.analyzeCandidateStatus(candidate.id);

        // Categorize by blocker type
        if (analysis.blockers.length > 0) {
          const primaryBlocker = analysis.blockers[0]!;
          byBlockerType[primaryBlocker.type].push({
            candidate,
            blocker: primaryBlocker,
            daysInStage: analysis.daysInStage,
          });

          // Count by severity
          if (primaryBlocker.severity === "critical") criticalCount++;
          else if (primaryBlocker.severity === "warning") warningCount++;
          else infoCount++;

          // Track urgent candidates
          if (analysis.priority === "urgent" || analysis.priority === "high") {
            urgentCandidates.push({
              candidate,
              blocker: primaryBlocker,
              priority: analysis.priority,
            });
          }
        } else {
          // No blockers
          byBlockerType.no_blocker.push({
            candidate,
            blocker: {
              type: "no_blocker",
              severity: "info",
              message: "On track",
              suggestedAction: "Continue monitoring",
            },
            daysInStage: analysis.daysInStage,
          });
          infoCount++;
        }
      } catch (error) {
        // Skip candidates we can't analyze
        logger.error(`Failed to analyze candidate ${candidate.id}`, { error });
      }
    }

    // Sort urgent candidates by priority
    urgentCandidates.sort((a, b) => {
      const priorityOrder: Record<CandidatePriority, number> = {
        urgent: 0,
        high: 1,
        medium: 2,
        low: 3,
      };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });

    return {
      analyzed: candidates.length,
      byBlockerType,
      summary: {
        critical: criticalCount,
        warning: warningCount,
        info: infoCount,
      },
      urgentCandidates,
    };
  }

  private detectBlockers(context: {
    currentStage: InterviewStage;
    daysInStage: number;
    upcomingInterviews: Interview[];
    completedInterviewsWithoutFeedback: Interview[];
    feedbackSubmissions: FeedbackSubmission[];
    pendingOffer?: Offer;
    application: Application;
  }): CandidateBlocker[] {
    const blockers: CandidateBlocker[] = [];
    const { currentStage, daysInStage, upcomingInterviews, completedInterviewsWithoutFeedback, pendingOffer } = context;

    // Check if stage name suggests interviews are needed
    const stageNeedsInterview = currentStage.title.toLowerCase().includes("interview") ||
      currentStage.title.toLowerCase().includes("screen");

    // Blocker 1: In interview stage but no interviews scheduled
    if (stageNeedsInterview && upcomingInterviews.length === 0 && completedInterviewsWithoutFeedback.length === 0) {
      blockers.push({
        type: "no_interview_scheduled",
        severity: daysInStage > 7 ? "critical" : "warning",
        message: `In ${currentStage.title} for ${daysInStage} days but no interview scheduled`,
        suggestedAction: `Schedule ${currentStage.title.toLowerCase()} with appropriate interviewers`,
        daysStuck: daysInStage,
      });
    }

    // Blocker 2: Completed interviews without feedback
    if (completedInterviewsWithoutFeedback.length > 0) {
      const sortedInterviews = [...completedInterviewsWithoutFeedback]
        .sort((a, b) => new Date(a.scheduledStartTime!).getTime() - new Date(b.scheduledStartTime!).getTime());
      const oldestInterview = sortedInterviews[0];
      if (oldestInterview && oldestInterview.scheduledStartTime) {
        const daysSinceInterview = Math.floor((Date.now() - new Date(oldestInterview.scheduledStartTime).getTime()) / (1000 * 60 * 60 * 24));

        blockers.push({
          type: "interview_completed_no_feedback",
          severity: daysSinceInterview > 5 ? "critical" : "warning",
          message: `${completedInterviewsWithoutFeedback.length} interview(s) completed but no feedback yet (oldest: ${daysSinceInterview} days ago)`,
          suggestedAction: "Follow up with interviewers for feedback",
          daysStuck: daysSinceInterview,
        });
      }
    }

    // Blocker 3: In offer stage but no offer exists
    const stageIsOffer = currentStage.title.toLowerCase().includes("offer");
    if (stageIsOffer && !pendingOffer) {
      blockers.push({
        type: "offer_pending",
        severity: daysInStage > 3 ? "critical" : "warning",
        message: `In ${currentStage.title} for ${daysInStage} days but no offer created`,
        suggestedAction: "Create and send offer to candidate",
        daysStuck: daysInStage,
      });
    }

    // Blocker 4: Offer created but not sent
    if (pendingOffer && pendingOffer.status === "Approved" && !pendingOffer.sentAt) {
      const daysSinceApproval = Math.floor((Date.now() - new Date(pendingOffer.updatedAt).getTime()) / (1000 * 60 * 60 * 24));
      blockers.push({
        type: "offer_not_sent",
        severity: daysSinceApproval > 2 ? "critical" : "warning",
        message: `Offer approved ${daysSinceApproval} days ago but not sent to candidate`,
        suggestedAction: "Send approved offer to candidate immediately",
        daysStuck: daysSinceApproval,
      });
    }

    // Blocker 5: Stuck in stage for too long
    if (daysInStage > 14 && !stageIsOffer && completedInterviewsWithoutFeedback.length === 0) {
      blockers.push({
        type: "ready_to_move",
        severity: daysInStage > 21 ? "warning" : "info",
        message: `In ${currentStage.title} for ${daysInStage} days with no pending items`,
        suggestedAction: `Review status and consider moving to next stage`,
        daysStuck: daysInStage,
      });
    }

    // Sort by severity (critical first)
    blockers.sort((a, b) => {
      const severityOrder: Record<BlockerSeverity, number> = { critical: 0, warning: 1, info: 2 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    });

    return blockers;
  }

  private generateRecentActivity(context: {
    allInterviews: Interview[];
    feedbackSubmissions: FeedbackSubmission[];
    pendingOffer?: Offer;
  }): RecentActivity[] {
    const activities: RecentActivity[] = [];
    const { allInterviews, feedbackSubmissions, pendingOffer } = context;

    // Add recent interviews
    const recentInterviews = allInterviews
      .filter(i => i.scheduledStartTime)
      .sort((a, b) => new Date(b.scheduledStartTime!).getTime() - new Date(a.scheduledStartTime!).getTime())
      .slice(0, 3);

    for (const interview of recentInterviews) {
      const isPast = new Date(interview.scheduledStartTime!) < new Date();
      activities.push({
        type: "interview",
        timestamp: interview.scheduledStartTime!,
        summary: isPast ? `Completed interview` : `Upcoming interview`,
      });
    }

    const recentFeedback = feedbackSubmissions
      .filter((feedback) => feedback.submittedAt)
      .sort((a, b) => new Date(b.submittedAt!).getTime() - new Date(a.submittedAt!).getTime())
      .slice(0, 3);

    for (const feedback of recentFeedback) {
      const submitter = feedback.submittedByUser
        ? `${feedback.submittedByUser.firstName} ${feedback.submittedByUser.lastName}`.trim()
        : feedback.submittedBy?.name;
      activities.push({
        type: "feedback",
        timestamp: feedback.submittedAt!,
        summary: submitter ? `Feedback submitted by ${submitter}` : "Feedback submitted",
      });
    }

    // Add offer activity
    if (pendingOffer) {
      if (pendingOffer.sentAt) {
        activities.push({
          type: "offer",
          timestamp: pendingOffer.sentAt,
          summary: `Offer sent (status: ${pendingOffer.status})`,
        });
      } else {
        activities.push({
          type: "offer",
          timestamp: pendingOffer.createdAt,
          summary: `Offer created (status: ${pendingOffer.status})`,
        });
      }
    }

    // Sort by timestamp (most recent first)
    activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return activities.slice(0, 5);
  }

  private generateNextSteps(blockers: CandidateBlocker[], currentStage: InterviewStage): string[] {
    const steps: string[] = [];

    // Add suggested actions from blockers
    for (const blocker of blockers) {
      if (blocker.severity === "critical" || blocker.severity === "warning") {
        steps.push(blocker.suggestedAction);
      }
    }

    // If no critical blockers, suggest general next steps
    if (steps.length === 0) {
      steps.push(`Continue with ${currentStage.title} process`);
      steps.push("Monitor for updates");
    }

    return steps;
  }

  private calculatePriority(blockers: CandidateBlocker[], daysInStage: number): CandidatePriority {
    // Check for critical blockers
    const hasCritical = blockers.some(b => b.severity === "critical");
    if (hasCritical) return "urgent";

    // Check for warnings with long delays
    const hasWarningWithDelay = blockers.some(b =>
      b.severity === "warning" && (b.daysStuck ?? 0) > 7
    );
    if (hasWarningWithDelay) return "high";

    // Check for any warnings
    const hasWarning = blockers.some(b => b.severity === "warning");
    if (hasWarning) return "medium";

    // Check if candidate is just generally stale
    if (daysInStage > this.staleDays) return "medium";

    return "low";
  }
}
