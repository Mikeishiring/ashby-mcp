/**
 * Feedback Service
 *
 * Handles interview feedback, scorecards, and ratings.
 */

import type { AshbyClient, AshbyApiError } from "../client.js";
import type { SearchService } from "./search-service.js";
import type {
  Candidate,
  FeedbackSubmission,
  FieldSubmission,
  Job,
  Scorecard,
} from "../../types/index.js";
import { ErrorCode, AppError } from "../../utils/errors.js";

export class FeedbackService {
  private readonly feedbackSubmissionCache: Map<string, FeedbackSubmission>;

  constructor(
    private readonly client: AshbyClient,
    private readonly searchService: SearchService
  ) {
    this.feedbackSubmissionCache = new Map();
  }

  async listFeedbackSubmissions(filters?: {
    applicationId?: string;
    interviewId?: string;
    authorId?: string;
  }): Promise<FeedbackSubmission[]> {
    const submissions = await this.client.listFeedbackSubmissions(filters);
    for (const submission of submissions) {
      if (submission?.id) {
        this.feedbackSubmissionCache.set(submission.id, submission);
      }
    }
    return submissions;
  }

  async getFeedbackDetails(feedbackSubmissionId: string): Promise<FeedbackSubmission> {
    try {
      const submission = await this.client.getFeedbackSubmission(feedbackSubmissionId);
      if (!submission.fieldSubmissions || submission.fieldSubmissions.length === 0) {
        submission.fieldSubmissions = this.buildFieldSubmissions(submission);
      }
      if (submission.id) {
        this.feedbackSubmissionCache.set(submission.id, submission);
      }
      return submission;
    } catch (error) {
      if (this.isAshbyApiError(error) && error.statusCode === 404) {
        const cached = this.feedbackSubmissionCache.get(feedbackSubmissionId);
        if (cached) {
          if (!cached.fieldSubmissions || cached.fieldSubmissions.length === 0) {
            cached.fieldSubmissions = this.buildFieldSubmissions(cached);
          }
          return cached;
        }
      }
      throw error;
    }
  }

  async getCandidateScorecard(
    candidateId: string,
    applicationId?: string
  ): Promise<Scorecard> {
    const [candidateResult, jobsResult] = await Promise.allSettled([
      this.client.getCandidateWithApplications(candidateId),
      this.client.listJobs(),
    ]);

    if (candidateResult.status === "rejected") {
      throw candidateResult.reason;
    }

    const { candidate, applications } = candidateResult.value;
    const jobs = jobsResult.status === "fulfilled" ? jobsResult.value : [];
    const jobMap = new Map(jobs.map((j) => [j.id, j]));

    const selectedApp = this.searchService.selectApplicationForRead(applications, applicationId);
    if (!selectedApp) {
      throw new AppError(ErrorCode.NO_ACTIVE_APPLICATION, "No application found for this candidate");
    }

    let submissions: FeedbackSubmission[] = [];
    try {
      submissions = await this.client.getApplicationFeedback(selectedApp.id);
    } catch {
      submissions = [];
    }

    return this.buildScorecard(candidate, selectedApp, submissions, jobMap);
  }

  private buildScorecard(
    candidate: Candidate,
    selectedApp: { jobId: string },
    submissions: FeedbackSubmission[],
    jobMap: Map<string, Job>
  ): Scorecard {
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
      const submitterName = submission.submittedByUser
        ? `${submission.submittedByUser.firstName} ${submission.submittedByUser.lastName}`.trim()
        : submission.submittedBy?.name ?? "Unknown";

      const fieldLookup = this.buildFeedbackFieldLookup(submission);
      const submittedValues = submission.submittedValues ?? {};

      // Extract overall recommendation value and map to label
      const overallRecValue =
        submittedValues["overall_recommendation"] ??
        submittedValues["overallRecommendation"] ??
        submittedValues["recommendation"];
      let overallRecommendation: string | null = null;
      let overallRating: number | null = null;

      if (overallRecValue !== undefined && overallRecValue !== null) {
        const recField = fieldLookup.get("overall_recommendation");
        if (recField?.selectableValues) {
          const match = recField.selectableValues.find((sv) => sv.value === String(overallRecValue));
          overallRecommendation = match?.label ?? String(overallRecValue);
        } else {
          overallRecommendation = String(overallRecValue);
        }
        const parsed = parseInt(String(overallRecValue), 10);
        if (!isNaN(parsed)) {
          overallRating = parsed;
        }
      }

      if (!overallRecommendation && submission.overallRecommendation) {
        overallRecommendation = submission.overallRecommendation;
      }

      const ratingCandidate = submission.overallRating ?? submission.rating;
      if (typeof ratingCandidate === "number" && overallRating === null) {
        overallRating = ratingCandidate;
      }

      if (overallRating === null) {
        const ratingValue =
          submittedValues["overall_rating"] ??
          submittedValues["overallRating"] ??
          submittedValues["rating"];
        const coercedRating = this.coerceFeedbackValue(ratingValue);
        if (coercedRating.numericValue !== null) {
          overallRating = coercedRating.numericValue;
        }
      }

      if (overallRating !== null) {
        overallRatings.push(overallRating);
      }
      if (overallRecommendation) {
        recommendations.push(overallRecommendation);
      }

      // Build this interviewer's scorecard
      const interviewerCard: Scorecard["interviewerScorecards"][number] = {
        interviewerId: submission.submittedByUser?.id ?? "unknown",
        interviewerName: submitterName,
        submittedAt: submission.submittedAt ?? "",
        overallRating,
        overallRecommendation,
        attributeRatings: [],
      };

      const fields = this.buildFieldSubmissions(submission);
      for (const field of fields) {
        const title = field.fieldTitle;
        const fieldType = field.fieldType || "unknown";
        const titleLower = title.toLowerCase();
        if (titleLower.includes("overall recommendation") || titleLower.includes("overall rating")) {
          continue;
        }

        const { numericValue, textValue } = this.coerceFeedbackValue(field.value);

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
            submittedAt: submission.submittedAt ?? "",
          });
        }
        if (textValue && fieldType === "RichText") {
          attr.textResponses.push(textValue);
        }

        // Extract pros/cons based on field title
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
    const finalOverallRating =
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
    const job = jobMap.get(selectedApp.jobId) ?? null;

    return {
      candidate,
      job,
      overallRating: finalOverallRating,
      feedbackCount: submissions.length,
      pros: [...new Set(pros)],
      cons: [...new Set(cons)],
      recommendations: [...new Set(recommendations)],
      submissions,
      attributeRatings,
      interviewerScorecards,
    };
  }

  private buildFeedbackFieldLookup(
    submission: FeedbackSubmission
  ): Map<
    string,
    { id?: string; title: string; type: string; selectableValues?: Array<{ label: string; value: string }> }
  > {
    const lookup = new Map<
      string,
      { id?: string; title: string; type: string; selectableValues?: Array<{ label: string; value: string }> }
    >();
    const formDefinition = submission.formDefinition;
    if (!formDefinition) {
      return lookup;
    }

    for (const section of formDefinition.sections ?? []) {
      for (const fieldDef of section.fields) {
        const f = fieldDef.field;
        const entry: {
          id?: string;
          title: string;
          type: string;
          selectableValues?: Array<{ label: string; value: string }>;
        } = {
          ...(f.id ? { id: f.id } : {}),
          title: f.title,
          type: f.type,
          ...(f.selectableValues ? { selectableValues: f.selectableValues } : {}),
        };
        if (f.path) {
          lookup.set(f.path, entry);
        }
        if (f.id) {
          lookup.set(f.id, entry);
        }
      }
    }

    return lookup;
  }

  buildFieldSubmissions(submission: FeedbackSubmission): FieldSubmission[] {
    if (submission.fieldSubmissions && submission.fieldSubmissions.length > 0) {
      return submission.fieldSubmissions;
    }

    const submittedValues = submission.submittedValues;
    if (!submittedValues || typeof submittedValues !== "object") {
      return [];
    }

    const fieldLookup = this.buildFeedbackFieldLookup(submission);
    const fields: FieldSubmission[] = [];

    for (const [path, rawValue] of Object.entries(submittedValues)) {
      if (rawValue === null || rawValue === undefined) continue;
      const info = fieldLookup.get(path);
      let value: unknown = rawValue;
      if (
        info?.selectableValues &&
        info.type !== "Score" &&
        (typeof rawValue === "string" || typeof rawValue === "number")
      ) {
        const match = info.selectableValues.find((sv) => sv.value === String(rawValue));
        if (match) {
          value = match.label;
        }
      }
      const { numericValue, textValue } = this.coerceFeedbackValue(value);
      const resolvedValue = numericValue !== null ? numericValue : textValue ?? value;

      fields.push({
        fieldId: info?.id ?? path,
        fieldTitle: info?.title ?? path,
        fieldType: info?.type ?? "unknown",
        value: resolvedValue,
      });
    }

    return fields;
  }

  private coerceFeedbackValue(rawValue: unknown): {
    numericValue: number | null;
    textValue: string | null;
  } {
    if (rawValue !== null && typeof rawValue === "object" && "score" in rawValue) {
      const scoreValue = (rawValue as { score?: number }).score;
      if (typeof scoreValue === "number") {
        return { numericValue: scoreValue, textValue: null };
      }
    }

    if (typeof rawValue === "number") {
      return { numericValue: rawValue, textValue: null };
    }

    if (typeof rawValue === "boolean") {
      return { numericValue: null, textValue: rawValue ? "Yes" : "No" };
    }

    if (typeof rawValue === "string") {
      return { numericValue: null, textValue: rawValue };
    }

    return { numericValue: null, textValue: null };
  }

  private isAshbyApiError(error: unknown): error is AshbyApiError {
    return error instanceof Error && error.name === "AshbyApiError";
  }
}
