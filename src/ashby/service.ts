/**
 * Ashby Service Layer
 *
 * Provides high-level operations built on top of the Ashby client.
 * Handles business logic like stale candidate detection and pipeline summaries.
 */

import { AshbyClient } from "./client.js";
import type { Config } from "../config/index.js";
import type {
  Application,
  Candidate,
  Job,
  InterviewStage,
  Note,
  ApplicationWithContext,
  PipelineSummary,
  DailySummaryData,
  Scorecard,
  SourceAnalytics,
  PrepPacket,
  CandidateComparison,
  ArchiveReason,
  CandidateWithContext,
  Offer,
  OfferStatus,
  Interview,
  InterviewSchedule,
  CreateCandidateParams,
  CandidateStatusAnalysis,
  BatchBlockerAnalysis,
  CandidateBlocker,
  BlockerType,
  BlockerSeverity,
  CandidatePriority,
  RecentActivity,
  FeedbackSubmission,
} from "../types/index.js";

export class AshbyService {
  private readonly client: AshbyClient;
  private readonly staleDays: number;

  constructor(config: Config) {
    this.client = new AshbyClient(config);
    this.staleDays = config.staleDays;
  }

  // ===========================================================================
  // Search & Discovery
  // ===========================================================================

  async searchCandidates(query: string): Promise<Candidate[]> {
    return this.client.searchCandidates(query);
  }

  async getCandidateWithApplications(candidateId: string) {
    return this.client.getCandidateWithApplications(candidateId);
  }

  async findCandidateByNameOrEmail(
    query: string
  ): Promise<Candidate | null> {
    const results = await this.client.searchCandidates(query);
    return results[0] ?? null;
  }

  // ===========================================================================
  // Candidate Details
  // ===========================================================================

  async getCandidateFullContext(candidateId: string): Promise<{
    candidate: Candidate;
    applications: ApplicationWithContext[];
    notes: Note[];
  }> {
    // Use Promise.allSettled for resilience - partial data is better than no data
    const [candidateResult, notesResult, stagesResult, jobsResult] = await Promise.allSettled([
      this.client.getCandidateWithApplications(candidateId),
      this.client.getCandidateNotes(candidateId),
      this.client.listInterviewStages(),
      this.client.listJobs(),
    ]);

    // Candidate data is required - throw if it fails
    if (candidateResult.status === "rejected") {
      throw candidateResult.reason;
    }
    const { candidate, applications } = candidateResult.value;

    // Notes, stages, and jobs are optional - use empty arrays on failure
    const notes = notesResult.status === "fulfilled" ? notesResult.value : [];
    const stages = stagesResult.status === "fulfilled" ? stagesResult.value : [];
    const jobs = jobsResult.status === "fulfilled" ? jobsResult.value : [];

    const stageMap = new Map(stages.map((s) => [s.id, s]));
    const jobMap = new Map(jobs.map((j) => [j.id, j]));

    const applicationsWithContext = applications.map((app) =>
      this.enrichApplication(app, stageMap, jobMap)
    );

    return {
      candidate,
      applications: applicationsWithContext,
      notes,
    };
  }

  // ===========================================================================
  // Pipeline Operations
  // ===========================================================================

  async getPipelineSummary(): Promise<PipelineSummary> {
    const [applications, stages, jobs] = await Promise.all([
      this.client.listApplications({ status: "Active" }),
      this.client.listInterviewStages(),
      this.client.getOpenJobs(),
    ]);

    const stageMap = new Map(stages.map((s) => [s.id, s]));
    const jobMap = new Map(jobs.map((j) => [j.id, j]));

    const enrichedApps = applications.map((app) =>
      this.enrichApplication(app, stageMap, jobMap)
    );

    // Group by stage
    const byStage = new Map<string, ApplicationWithContext[]>();
    for (const app of enrichedApps) {
      if (!app.currentInterviewStage) continue;
      const stageId = app.currentInterviewStage.id;
      if (!byStage.has(stageId)) {
        byStage.set(stageId, []);
      }
      byStage.get(stageId)!.push(app);
    }

    // Group by job
    const byJob = new Map<string, ApplicationWithContext[]>();
    for (const app of enrichedApps) {
      const jobId = app.jobId;
      if (!byJob.has(jobId)) {
        byJob.set(jobId, []);
      }
      byJob.get(jobId)!.push(app);
    }

    const staleCount = enrichedApps.filter((a) => a.isStale).length;
    const needsDecisionCount = enrichedApps.filter((a) =>
      this.needsDecision(a)
    ).length;

    // Create fallback stage for unknown stages
    const fallbackStage: InterviewStage = {
      id: "unknown",
      title: "Unknown Stage",
      orderInInterviewPlan: 999,
      interviewStageType: "Interview",
    };

    // Create fallback job for unknown jobs
    const fallbackJob: Job = {
      id: "unknown",
      title: "Unknown Position",
      status: "Closed",
      employmentType: "Unknown",
      hiringTeam: [],
      jobPostings: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    return {
      totalCandidates: applications.length,
      byStage: Array.from(byStage.entries())
        .map(([stageId, candidates]) => ({
          stage: stageMap.get(stageId) ?? { ...fallbackStage, id: stageId },
          count: candidates.length,
          candidates,
        }))
        .sort((a, b) => a.stage.orderInInterviewPlan - b.stage.orderInInterviewPlan),
      byJob: Array.from(byJob.entries())
        .map(([jobId, candidates]) => ({
          job: jobMap.get(jobId) ?? { ...fallbackJob, id: jobId },
          count: candidates.length,
          candidates,
        }))
        .sort((a, b) => a.job.title.localeCompare(b.job.title)),
      staleCount,
      needsDecisionCount,
    };
  }

  async getStaleCandidates(limit: number = 10): Promise<ApplicationWithContext[]> {
    const [applications, stages, jobs] = await Promise.all([
      this.client.listApplications({ status: "Active" }),
      this.client.listInterviewStages(),
      this.client.listJobs(),
    ]);

    const stageMap = new Map(stages.map((s) => [s.id, s]));
    const jobMap = new Map(jobs.map((j) => [j.id, j]));

    return applications
      .map((app) => this.enrichApplication(app, stageMap, jobMap))
      .filter((app) => app.isStale)
      .sort((a, b) => b.daysInCurrentStage - a.daysInCurrentStage)
      .slice(0, limit);
  }

  async getCandidatesNeedingDecision(limit: number = 10): Promise<ApplicationWithContext[]> {
    const [applications, stages, jobs] = await Promise.all([
      this.client.listApplications({ status: "Active" }),
      this.client.listInterviewStages(),
      this.client.listJobs(),
    ]);

    const stageMap = new Map(stages.map((s) => [s.id, s]));
    const jobMap = new Map(jobs.map((j) => [j.id, j]));

    return applications
      .map((app) => this.enrichApplication(app, stageMap, jobMap))
      .filter((app) => this.needsDecision(app))
      .sort((a, b) => b.daysInCurrentStage - a.daysInCurrentStage)
      .slice(0, limit);
  }

  async getRecentApplications(days: number = 7): Promise<ApplicationWithContext[]> {
    const [applications, stages, jobs] = await Promise.all([
      this.client.listApplications({ status: "Active" }),
      this.client.listInterviewStages(),
      this.client.listJobs(),
    ]);

    const stageMap = new Map(stages.map((s) => [s.id, s]));
    const jobMap = new Map(jobs.map((j) => [j.id, j]));
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

    return applications
      .filter((app) => new Date(app.createdAt).getTime() > cutoff)
      .map((app) => this.enrichApplication(app, stageMap, jobMap))
      .sort((a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
  }

  // ===========================================================================
  // Job Operations
  // ===========================================================================

  async getOpenJobs(): Promise<Job[]> {
    return this.client.getOpenJobs();
  }

  async getJobWithCandidates(jobId: string): Promise<{
    job: Job;
    candidates: ApplicationWithContext[];
  }> {
    const [job, applications, stages, jobs] = await Promise.all([
      this.client.getJob(jobId),
      this.client.getApplicationsForJob(jobId),
      this.client.listInterviewStages(),
      this.client.listJobs(),
    ]);

    const stageMap = new Map(stages.map((s) => [s.id, s]));
    const jobMap = new Map(jobs.map((j) => [j.id, j]));

    const candidates = applications.map((app) =>
      this.enrichApplication(app, stageMap, jobMap)
    );

    return { job, candidates };
  }

  // ===========================================================================
  // Write Operations
  // ===========================================================================

  async addNote(
    candidateId: string,
    content: string
  ): Promise<Note> {
    return this.client.addNote(candidateId, content);
  }

  async moveToStage(
    applicationId: string,
    stageId: string
  ): Promise<Application> {
    return this.client.moveApplicationStage(applicationId, stageId);
  }

  async createApplication(params: {
    candidateId: string;
    jobId: string;
    sourceId?: string;
    creditedToUserId?: string;
  }): Promise<Application> {
    return this.client.createApplication(params);
  }

  async transferApplication(
    applicationId: string,
    jobId: string
  ): Promise<Application> {
    return this.client.transferApplication(applicationId, jobId);
  }

  async addCandidateTag(candidateId: string, tagId: string): Promise<Candidate> {
    return this.client.addCandidateTag(candidateId, tagId);
  }

  async listCandidateTags() {
    return this.client.listCandidateTags();
  }

  async findStageByName(stageName: string): Promise<InterviewStage | null> {
    const stages = await this.client.listInterviewStages();
    const normalizedName = stageName.toLowerCase().trim();

    return stages.find((s) =>
      s.title.toLowerCase().includes(normalizedName)
    ) ?? null;
  }

  // ===========================================================================
  // Interview Scheduling Operations
  // ===========================================================================

  async listInterviewPlans() {
    return this.client.listInterviewPlans();
  }

  async listUsers() {
    return this.client.listUsers();
  }

  async getInterviewSchedulesForCandidate(candidateId: string) {
    const { applications } = await this.client.getCandidateWithApplications(
      candidateId
    );

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
    location?: string
  ) {
    // Get active application
    const { applications } = await this.client.getCandidateWithApplications(
      candidateId
    );
    const activeApp = applications.find((a) => a.status === "Active");

    if (!activeApp) {
      throw new Error("No active application found for this candidate");
    }

    // Look up interviewer emails from user IDs
    const users = await this.client.listUsers();
    const userMap = new Map(users.map((u) => [u.id, u]));

    const interviewers = interviewerIds.map((id) => {
      const user = userMap.get(id);
      if (!user) {
        throw new Error(`Could not find user with ID ${id}`);
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

  // ===========================================================================
  // Daily Summary
  // ===========================================================================

  async getDailySummaryData(): Promise<DailySummaryData> {
    // Use allSettled to ensure partial data is returned even if some calls fail
    const [staleResult, decisionResult, summaryResult, recentResult] = await Promise.allSettled([
      this.getStaleCandidates(5),
      this.getCandidatesNeedingDecision(5),
      this.getPipelineSummary(),
      this.getRecentApplications(1),
    ]);

    // Extract successful results with empty fallbacks
    const staleCandidates = staleResult.status === "fulfilled" ? staleResult.value : [];
    const needsDecision = decisionResult.status === "fulfilled" ? decisionResult.value : [];
    const summary = summaryResult.status === "fulfilled" ? summaryResult.value : null;
    const recentApps = recentResult.status === "fulfilled" ? recentResult.value : [];

    return {
      staleCandidate: staleCandidates.map((app) => ({
        name: app.candidate?.name ?? "Unknown",
        email: app.candidate?.primaryEmailAddress?.value ?? "No email",
        stage: app.currentInterviewStage?.title ?? "Unknown",
        job: app.job?.title ?? "Unknown",
        daysInStage: app.daysInCurrentStage,
      })),
      needsDecision: needsDecision.map((app) => ({
        name: app.candidate?.name ?? "Unknown",
        email: app.candidate?.primaryEmailAddress?.value ?? "No email",
        stage: app.currentInterviewStage?.title ?? "Unknown",
        job: app.job?.title ?? "Unknown",
        daysWaiting: app.daysInCurrentStage,
      })),
      stats: {
        totalActive: summary?.totalCandidates ?? 0,
        openRoles: summary?.byJob.length ?? 0,
        newApplications: recentApps.length,
      },
    };
  }

  // ===========================================================================
  // Hired Candidate Protection
  // ===========================================================================

  async isHiredCandidate(candidateId: string): Promise<boolean> {
    const { applications } = await this.client.getCandidateWithApplications(
      candidateId
    );

    return applications.some(
      (app) =>
        app.status === "Hired" ||
        app.currentInterviewStage?.title.toLowerCase().includes("hired")
    );
  }

  // ===========================================================================
  // Candidate Scorecards (Feature 1)
  // ===========================================================================

  async getCandidateScorecard(candidateId: string): Promise<Scorecard> {
    // Use Promise.allSettled for resilience - jobs list is optional context
    const [candidateResult, jobsResult] = await Promise.allSettled([
      this.client.getCandidateWithApplications(candidateId),
      this.client.listJobs(),
    ]);

    // Candidate data is required
    if (candidateResult.status === "rejected") {
      throw candidateResult.reason;
    }
    const { candidate, applications } = candidateResult.value;

    // Jobs are optional for context
    const jobs = jobsResult.status === "fulfilled" ? jobsResult.value : [];
    const jobMap = new Map(jobs.map((j) => [j.id, j]));

    // Get feedback for all applications - use allSettled to handle partial failures
    const feedbackPromises = applications.map((app) =>
      this.client.getApplicationFeedback(app.id).catch(() => [])
    );
    const allFeedback = await Promise.all(feedbackPromises);
    const submissions = allFeedback.flat();

    // Extract pros, cons, and recommendations from field submissions
    const pros: string[] = [];
    const cons: string[] = [];
    const recommendations: string[] = [];

    // Aggregate attribute ratings across all submissions
    const attributeMap = new Map<string, {
      ratings: Array<{ rating: number; submittedBy?: string; submittedAt: string }>;
      textResponses: string[];
    }>();

    // Build individual interviewer scorecards
    const interviewerScorecards: Scorecard["interviewerScorecards"] = [];
    const overallRatings: number[] = [];

    for (const submission of submissions) {
      // Get submitter name from the embedded user object
      const submitterName = submission.submittedByUser
        ? `${submission.submittedByUser.firstName} ${submission.submittedByUser.lastName}`.trim()
        : "Unknown";

      // Build field lookup from form definition
      const fieldLookup = new Map<string, { title: string; type: string; selectableValues?: Array<{ label: string; value: string }> }>();
      for (const section of submission.formDefinition.sections) {
        for (const fieldDef of section.fields) {
          const f = fieldDef.field;
          const entry: { title: string; type: string; selectableValues?: Array<{ label: string; value: string }> } = {
            title: f.title,
            type: f.type,
          };
          if (f.selectableValues) {
            entry.selectableValues = f.selectableValues;
          }
          fieldLookup.set(f.path, entry);
        }
      }

      // Extract overall recommendation value and map to label
      const overallRecValue = submission.submittedValues["overall_recommendation"];
      let overallRecommendation: string | null = null;
      let overallRating: number | null = null;

      if (overallRecValue !== undefined && overallRecValue !== null) {
        const recField = fieldLookup.get("overall_recommendation");
        if (recField?.selectableValues) {
          const match = recField.selectableValues.find((sv) => sv.value === String(overallRecValue));
          overallRecommendation = match?.label ?? String(overallRecValue);
          // Extract numeric rating from value (e.g., "4" -> 4)
          overallRating = parseInt(String(overallRecValue), 10);
          if (!isNaN(overallRating)) {
            overallRatings.push(overallRating);
          }
        } else {
          overallRecommendation = String(overallRecValue);
        }
        recommendations.push(overallRecommendation);
      }

      // Build this interviewer's scorecard
      const interviewerCard: Scorecard["interviewerScorecards"][number] = {
        interviewerId: submission.submittedByUser?.id ?? "unknown",
        interviewerName: submitterName,
        submittedAt: submission.submittedAt,
        overallRating,
        overallRecommendation,
        attributeRatings: [],
      };

      // Process submitted values using field definitions
      for (const [path, rawValue] of Object.entries(submission.submittedValues)) {
        if (path === "overall_recommendation") continue; // Already handled

        const fieldInfo = fieldLookup.get(path);
        const title = fieldInfo?.title ?? path;
        const fieldType = fieldInfo?.type ?? "unknown";

        // Extract the actual value (scores are nested as {score: number})
        let numericValue: number | null = null;
        let textValue: string | null = null;

        if (rawValue !== null && typeof rawValue === "object" && "score" in rawValue) {
          numericValue = (rawValue as { score: number }).score;
        } else if (typeof rawValue === "number") {
          numericValue = rawValue;
        } else if (typeof rawValue === "boolean") {
          textValue = rawValue ? "Yes" : "No";
        } else if (typeof rawValue === "string") {
          textValue = rawValue;
        }

        // Add to interviewer's card
        interviewerCard.attributeRatings.push({
          name: title,
          rating: numericValue,
          textValue: textValue || (numericValue !== null ? String(numericValue) : null),
        });

        // Aggregate ratings by attribute name
        if (!attributeMap.has(title)) {
          attributeMap.set(title, { ratings: [], textResponses: [] });
        }
        const attr = attributeMap.get(title)!;

        if (numericValue !== null) {
          attr.ratings.push({
            rating: numericValue,
            submittedBy: submitterName,
            submittedAt: submission.submittedAt,
          });
        }
        if (textValue && fieldType === "RichText") {
          attr.textResponses.push(textValue);
        }

        // Extract pros/cons based on field title
        const titleLower = title.toLowerCase();
        if (textValue) {
          if (titleLower.includes("strength") || titleLower.includes("pro") || titleLower.includes("positive")) {
            pros.push(textValue);
          } else if (titleLower.includes("weakness") || titleLower.includes("con") || titleLower.includes("concern") || titleLower.includes("improvement")) {
            cons.push(textValue);
          }
        }
      }

      interviewerScorecards.push(interviewerCard);
    }

    // Calculate overall average rating
    const overallRating =
      overallRatings.length > 0
        ? Math.round((overallRatings.reduce((a, b) => a + b, 0) / overallRatings.length) * 10) / 10
        : null;

    // Build aggregated attribute ratings
    const attributeRatings: Scorecard["attributeRatings"] = [];
    for (const [name, data] of attributeMap) {
      const numericRatings = data.ratings.map((r) => r.rating);
      const avgRating =
        numericRatings.length > 0
          ? Math.round((numericRatings.reduce((a, b) => a + b, 0) / numericRatings.length) * 10) / 10
          : null;

      attributeRatings.push({
        name,
        averageRating: avgRating,
        ratings: data.ratings,
        textResponses: data.textResponses,
      });
    }

    // Get the primary job for this candidate
    const activeApp = applications.find((a) => a.status === "Active");
    const job = activeApp ? jobMap.get(activeApp.jobId) ?? null : null;

    return {
      candidate,
      job,
      overallRating,
      feedbackCount: submissions.length,
      pros: [...new Set(pros)], // Dedupe
      cons: [...new Set(cons)],
      recommendations: [...new Set(recommendations)],
      submissions,
      attributeRatings,
      interviewerScorecards,
    };
  }

  // ===========================================================================
  // Source Analytics (Feature 7)
  // ===========================================================================

  async getSourceAnalytics(days: number = 90): Promise<SourceAnalytics[]> {
    // Fetch all applications (not just active) to get full picture
    const [activeApps, hiredApps, archivedApps] = await Promise.all([
      this.client.listApplications({ status: "Active" }),
      this.client.listApplications({ status: "Hired" }),
      this.client.listApplications({ status: "Archived" }),
    ]);

    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const allApps = [...activeApps, ...hiredApps, ...archivedApps].filter(
      (app) => new Date(app.createdAt).getTime() > cutoff
    );

    // Group by source
    const bySource = new Map<string, Application[]>();
    for (const app of allApps) {
      const sourceKey = app.source?.id ?? "unknown";
      if (!bySource.has(sourceKey)) {
        bySource.set(sourceKey, []);
      }
      bySource.get(sourceKey)!.push(app);
    }

    // Calculate analytics per source
    const analytics: SourceAnalytics[] = [];
    for (const [_sourceKey, apps] of bySource.entries()) {
      const activeCount = apps.filter((a) => a.status === "Active").length;
      const hiredCount = apps.filter((a) => a.status === "Hired").length;
      const archivedCount = apps.filter((a) => a.status === "Archived").length;
      const totalApplications = apps.length;

      // Calculate average days to hire
      const hiredWithDates = apps.filter((a) => a.status === "Hired");
      let avgDaysToHire: number | null = null;
      if (hiredWithDates.length > 0) {
        const daysToHire = hiredWithDates.map((a) => {
          const created = new Date(a.createdAt).getTime();
          const updated = new Date(a.updatedAt).getTime();
          return Math.floor((updated - created) / (24 * 60 * 60 * 1000));
        });
        avgDaysToHire = Math.round(
          daysToHire.reduce((a, b) => a + b, 0) / daysToHire.length
        );
      }

      analytics.push({
        source: apps[0]?.source ?? null,
        sourceName: apps[0]?.source?.title ?? "Unknown Source",
        totalApplications,
        activeCount,
        hiredCount,
        archivedCount,
        conversionRate: totalApplications > 0 ? Math.round((hiredCount / totalApplications) * 100) : 0,
        avgDaysToHire,
      });
    }

    // Sort by total applications descending
    return analytics.sort((a, b) => b.totalApplications - a.totalApplications);
  }

  // ===========================================================================
  // Rejection / Archive (Feature 5)
  // ===========================================================================

  async getArchiveReasons(): Promise<ArchiveReason[]> {
    return this.client.listArchiveReasons();
  }

  async rejectCandidate(
    candidateId: string,
    archiveReasonId: string
  ): Promise<Application> {
    const { applications } = await this.client.getCandidateWithApplications(
      candidateId
    );
    const activeApp = applications.find((a) => a.status === "Active");

    if (!activeApp) {
      throw new Error("No active application found for this candidate");
    }

    return this.client.archiveApplication(activeApp.id, archiveReasonId);
  }

  // ===========================================================================
  // Candidate Comparison (Feature 3)
  // ===========================================================================

  async compareCandidates(
    candidateIds?: string[],
    jobId?: string,
    limit: number = 3
  ): Promise<CandidateComparison> {
    let candidates: CandidateWithContext[] = [];
    let job: Job | null = null;

    if (candidateIds && candidateIds.length > 0) {
      // Get specific candidates
      const contexts = await Promise.all(
        candidateIds.slice(0, Math.min(limit, 5)).map(async (id) => {
          const ctx = await this.getCandidateFullContext(id);
          return {
            ...ctx.candidate,
            applications: ctx.applications,
            notes: ctx.notes,
          } as CandidateWithContext;
        })
      );
      candidates = contexts;

      // Get the job from the first candidate's active application
      const firstApp = contexts[0]?.applications.find((a) => a.status === "Active");
      if (firstApp) {
        job = firstApp.job;
      }
    } else if (jobId) {
      // Get top candidates for a job
      const { job: jobData, candidates: jobCandidates } = await this.getJobWithCandidates(jobId);
      job = jobData;

      // Get full context for top candidates
      const topApps = jobCandidates.slice(0, limit);
      candidates = await Promise.all(
        topApps.map(async (app) => {
          const ctx = await this.getCandidateFullContext(app.candidateId);
          return {
            ...ctx.candidate,
            applications: ctx.applications,
            notes: ctx.notes,
          } as CandidateWithContext;
        })
      );
    }

    return {
      candidates,
      job,
      comparisonFields: ["name", "currentStage", "daysInStage", "source", "email"],
    };
  }

  // ===========================================================================
  // Interview Prep Packet (Feature 6)
  // ===========================================================================

  async getInterviewPrepPacket(candidateId: string): Promise<PrepPacket> {
    // Use allSettled for maximum resilience - context is required, others are optional
    const [contextResult, scorecardResult, schedulesResult] = await Promise.allSettled([
      this.getCandidateFullContext(candidateId),
      this.getCandidateScorecard(candidateId),
      this.getInterviewSchedulesForCandidate(candidateId),
    ]);

    // Context is required - throw if it fails
    if (contextResult.status === "rejected") {
      throw contextResult.reason;
    }

    const context = contextResult.value;
    const scorecard = scorecardResult.status === "fulfilled" ? scorecardResult.value : null;
    const schedules = schedulesResult.status === "fulfilled" ? schedulesResult.value : [];

    const { candidate, applications, notes } = context;

    // Get the active application's job
    const activeApp = applications.find((a) => a.status === "Active");
    const job = activeApp?.job ?? null;

    // Find upcoming interview
    const now = new Date();
    const upcomingEvents = schedules
      .flatMap((s) => s.interviewEvents)
      .filter((e) => new Date(e.startTime) > now)
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
    const upcomingInterview = upcomingEvents[0] ?? null;

    // Generate highlights from candidate data
    const highlights: string[] = [];
    if (candidate.source?.title) {
      highlights.push(`Source: ${candidate.source.title}`);
    }
    if (activeApp?.currentInterviewStage) {
      highlights.push(`Current Stage: ${activeApp.currentInterviewStage.title}`);
      highlights.push(`Days in Stage: ${activeApp.daysInCurrentStage}`);
    }
    if (candidate.socialLinks.length > 0) {
      const linkedin = candidate.socialLinks.find((l) => l.type === "LinkedIn" || l.url.includes("linkedin"));
      if (linkedin) {
        highlights.push(`LinkedIn: ${linkedin.url}`);
      }
    }
    if (scorecard && scorecard.overallRating !== null) {
      highlights.push(`Interview Rating: ${scorecard.overallRating}/5 (${scorecard.feedbackCount} reviews)`);
    }

    return {
      candidate,
      job,
      highlights,
      priorFeedback: scorecard,
      upcomingInterview,
      notes,
      profileUrl: candidate.profileUrl,
    };
  }

  // ===========================================================================
  // Candidate Creation (Phase 1 - Feature 11)
  // ===========================================================================

  async createCandidate(params: CreateCandidateParams): Promise<Candidate> {
    return this.client.createCandidate(params);
  }

  async updateCandidate(
    candidateId: string,
    updates: Partial<CreateCandidateParams>
  ): Promise<Candidate> {
    return this.client.updateCandidate(candidateId, updates);
  }

  // ===========================================================================
  // Interviews (Phase 1 - Features 8-10)
  // ===========================================================================

  async listAllInterviews(filters?: {
    applicationId?: string;
    userId?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<Interview[]> {
    return this.client.listInterviews(filters);
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
        throw new Error(`Could not find user with ID ${id}`);
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

  // ===========================================================================
  // Feedback (Phase 2)
  // ===========================================================================

  async listFeedbackSubmissions(filters: {
    applicationId: string;
  }): Promise<FeedbackSubmission[]> {
    // Note: Ashby's applicationFeedback.list requires applicationId
    return this.client.listFeedbackSubmissions(filters);
  }

  // ===========================================================================
  // Offers (Phase 1 - Features 1-7)
  // ===========================================================================

  async listOffers(filters?: {
    applicationId?: string;
    status?: OfferStatus;
  }): Promise<Offer[]> {
    return this.client.listOffers(filters);
  }

  async getPendingOffers(): Promise<Offer[]> {
    const allOffers = await this.client.listOffers();
    return allOffers.filter((o) =>
      ["Draft", "Pending", "Approved"].includes(o.status)
    );
  }

  async getOfferForCandidate(candidateId: string): Promise<Offer | null> {
    const { applications } = await this.client.getCandidateWithApplications(
      candidateId
    );
    const activeApp = applications.find((a) => a.status === "Active");

    if (!activeApp) return null;

    const offers = await this.client.listOffers({ applicationId: activeApp.id });
    return offers[0] ?? null;
  }

  async createOffer(params: {
    candidateId: string;
    offerProcessId: string;
    startDate: string;
    salary: number;
    salaryFrequency?: "Annual" | "Hourly";
    currency?: string;
    equity?: number;
    equityType?: string;
    signingBonus?: number;
    relocationBonus?: number;
    variableCompensation?: number;
    notes?: string;
  }): Promise<Offer> {
    const { applications } = await this.client.getCandidateWithApplications(
      params.candidateId
    );
    const activeApp = applications.find((a) => a.status === "Active");

    if (!activeApp) {
      throw new Error("No active application found for this candidate");
    }

    const { candidateId, ...offerParams } = params;
    return this.client.createOffer({
      ...offerParams,
      applicationId: activeApp.id,
    });
  }

  async updateOffer(
    offerId: string,
    updates: {
      salary?: number;
      startDate?: string;
      equity?: number;
      signingBonus?: number;
      relocationBonus?: number;
      variableCompensation?: number;
      notes?: string;
    }
  ): Promise<Offer> {
    return this.client.updateOffer(offerId, updates);
  }

  async approveOffer(offerId: string, approverId: string): Promise<Offer> {
    return this.client.approveOffer(offerId, approverId);
  }

  async sendOffer(offerId: string): Promise<Offer> {
    return this.client.startOffer(offerId);
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  private enrichApplication(
    app: Application,
    stageMap: Map<string, InterviewStage>,
    jobMap: Map<string, Job>
  ): ApplicationWithContext {
    const stage = app.currentInterviewStageId
      ? stageMap.get(app.currentInterviewStageId) ?? null
      : null;
    const job = jobMap.get(app.jobId);
    const daysInCurrentStage = this.calculateDaysInStage(app);

    // Create fallback job if not found in map (could happen if job was archived/deleted)
    const fallbackJob: Job = {
      id: app.jobId,
      title: "Unknown Position",
      status: "Closed",
      employmentType: "Unknown",
      hiringTeam: [],
      jobPostings: [],
      createdAt: app.createdAt,
      updatedAt: app.updatedAt,
    };

    // Create fallback candidate if not embedded in application
    const fallbackCandidate: Candidate = {
      id: app.candidateId,
      name: "Unknown Candidate",
      primaryEmailAddress: null,
      phoneNumbers: [],
      socialLinks: [],
      tags: [],
      createdAt: app.createdAt,
      updatedAt: app.updatedAt,
      applicationIds: [app.id],
      profileUrl: "",
    };

    return {
      ...app,
      job: job ?? fallbackJob,
      candidate: app.candidate ?? fallbackCandidate,
      currentInterviewStage: stage,
      daysInCurrentStage,
      isStale: this.isStale(app, stage, daysInCurrentStage),
    };
  }

  private calculateDaysInStage(app: Application): number {
    const updatedAt = new Date(app.updatedAt).getTime();
    const now = Date.now();
    return Math.floor((now - updatedAt) / (24 * 60 * 60 * 1000));
  }

  private isStale(
    _app: Application,
    stage: InterviewStage | null,
    daysInStage: number
  ): boolean {
    // Application Review stage is expected to have backlog - don't flag as stale
    if (stage?.title.toLowerCase().includes("application review")) {
      return false;
    }
    return daysInStage > this.staleDays;
  }

  private needsDecision(app: ApplicationWithContext): boolean {
    const stage = app.currentInterviewStage;
    if (!stage) return false;

    // Final round stages typically need decisions
    const decisionStages = ["final", "offer", "decision", "reference"];
    return decisionStages.some((s) =>
      stage.title.toLowerCase().includes(s)
    );
  }

  // ===========================================================================
  // Phase A: Proactive Status Analysis
  // ===========================================================================

  /**
   * Analyze a single candidate's status with intelligent blocker detection
   */
  async analyzeCandidateStatus(candidateId: string): Promise<CandidateStatusAnalysis> {
    // Get candidate with all applications
    const { candidate, applications } = await this.client.getCandidateWithApplications(candidateId);

    // Find active application
    const activeApp = applications.find(app => app.status === "Active");
    if (!activeApp) {
      throw new Error("No active application found for candidate");
    }

    // Get full application details
    const application = await this.client.getApplication(activeApp.id);

    // Get current stage (already populated in getApplication)
    const currentStage = application.currentInterviewStage;
    if (!currentStage) {
      throw new Error("Current interview stage not found");
    }

    // Calculate days in stage (use updatedAt as approximation)
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
    const completedInterviewsWithoutFeedback = completedInterviews.filter(
      (interview) =>
        !feedbackSubmissions.some((feedback) => feedback.interviewId === interview.id)
    );

    // Get pending offer
    let pendingOffer: Offer | undefined;
    try {
      const offers = await this.client.listOffers({ applicationId: application.id });
      pendingOffer = offers.find(o => ["Draft", "Pending", "Approved"].includes(o.status));
    } catch (error) {
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

  /**
   * Batch analyze multiple candidates for blockers
   */
  async analyzeCandidateBlockers(candidateIds?: string[]): Promise<BatchBlockerAnalysis> {
    let candidates: Array<{ candidate: Candidate; applications: Application[] }> = [];

    if (candidateIds && candidateIds.length > 0) {
      // Analyze specific candidates
      candidates = await Promise.all(
        candidateIds.map(id => this.client.getCandidateWithApplications(id))
      );
    } else {
      // Analyze all stale candidates
      const stale = await this.getStaleCandidates();
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
          const primaryBlocker = analysis.blockers[0]!; // Most severe blocker (guaranteed to exist)
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
        console.error(`Failed to analyze candidate ${candidate.id}:`, error);
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

  // ===========================================================================
  // Private Analysis Helpers
  // ===========================================================================

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

    // Blocker 5: Stuck in stage for too long (potential ready to move)
    // TODO: Improve this when feedback API is available
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
    const { allInterviews, pendingOffer } = context;

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
        summary: isPast
          ? `Completed interview`
          : `Upcoming interview`,
      });
    }

    // TODO: Add feedback when API is available

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

    return activities.slice(0, 5); // Return top 5 most recent
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

  // ===========================================================================
  // Sources & Hiring Team (Phase 3C)
  // ===========================================================================

  async listSources() {
    return this.client.listSources();
  }

  async listHiringTeamRoles() {
    return this.client.listHiringTeamRoles();
  }

  async getApplicationHiringTeam(applicationId: string) {
    return this.client.listApplicationHiringTeam(applicationId);
  }

  // ===========================================================================
  // User Management (Phase 3C)
  // ===========================================================================

  async getUserDetails(userId: string) {
    return this.client.getUser(userId);
  }

  async searchUsers(params: { name?: string; email?: string }) {
    return this.client.searchUsers(params);
  }

  // ===========================================================================
  // Feedback & Custom Fields (Phase 3D/3E)
  // ===========================================================================

  async getFeedbackDetails(feedbackSubmissionId: string) {
    return this.client.getFeedbackSubmission(feedbackSubmissionId);
  }

  async listCustomFields() {
    return this.client.listCustomFields();
  }

  // ===========================================================================
  // Enhanced Context (Phase 3G)
  // ===========================================================================

  async listLocations() {
    return this.client.listLocations();
  }

  async listDepartments() {
    return this.client.listDepartments();
  }

  async getApplicationHistory(applicationId: string) {
    return this.client.getApplicationHistory(applicationId);
  }

  async getInterviewStageDetails(interviewStageId: string) {
    // Use the existing method that fetches from cached list
    return this.client.getInterviewStage(interviewStageId);
  }

  async listInterviewEvents(interviewScheduleId?: string) {
    return this.client.listInterviewEvents(interviewScheduleId);
  }
}
