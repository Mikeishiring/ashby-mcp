/**
 * Search & Discovery Service
 *
 * Handles candidate search and lookup operations.
 */

import type { AshbyClient } from "../client.js";
import type { Application, Candidate } from "../../types/index.js";
import { ErrorCode, AppError } from "../../utils/errors.js";

export class SearchService {
  constructor(private readonly client: AshbyClient) {}

  async searchCandidates(query: string): Promise<Candidate[]> {
    return this.client.searchCandidates(query);
  }

  async getCandidateWithApplications(candidateId: string): Promise<{
    candidate: Candidate;
    applications: Application[];
  }> {
    return this.client.getCandidateWithApplications(candidateId);
  }

  async getApplication(applicationId: string): Promise<Application> {
    return this.client.getApplication(applicationId);
  }

  async findCandidateByNameOrEmail(query: string): Promise<Candidate | null> {
    const results = await this.client.searchCandidates(query);
    if (results.length === 0) {
      return null;
    }

    const normalizedQuery = query.trim().toLowerCase();
    const isEmailQuery = normalizedQuery.includes("@");

    if (isEmailQuery) {
      const exactMatches = results.filter(
        (candidate) => candidate.primaryEmailAddress?.value?.toLowerCase() === normalizedQuery
      );
      if (exactMatches.length === 1) {
        return exactMatches[0]!;
      }
      if (exactMatches.length > 1) {
        throw new AppError(
          ErrorCode.MULTIPLE_CANDIDATES_FOUND,
          `Multiple candidates found for ${query}. Please provide candidate_id instead.`
        );
      }
    }

    if (results.length === 1) {
      return results[0]!;
    }

    throw new AppError(
      ErrorCode.MULTIPLE_CANDIDATES_FOUND,
      `Multiple candidates matched "${query}". Please provide candidate_id or a more specific email.`
    );
  }

  async getActiveApplicationForCandidate(
    candidateId: string,
    applicationId?: string
  ): Promise<Application | null> {
    const { applications } = await this.client.getCandidateWithApplications(candidateId);
    return this.selectActiveApplication(applications, applicationId);
  }

  /**
   * Select active application with validation
   */
  selectActiveApplication<T extends { id: string; status: Application["status"] }>(
    applications: T[],
    applicationId?: string
  ): T | null {
    if (applicationId) {
      const match = applications.find((app) => app.id === applicationId);
      if (!match) {
        throw new AppError(
          ErrorCode.APPLICATION_NOT_FOUND,
          "Provided application_id does not belong to this candidate."
        );
      }
      if (match.status !== "Active") {
        throw new AppError(
          ErrorCode.NO_ACTIVE_APPLICATION,
          "Selected application is not active. Please provide an active application_id."
        );
      }
      return match;
    }

    const activeApps = applications.filter((app) => app.status === "Active");
    if (activeApps.length === 0) {
      return null;
    }
    if (activeApps.length > 1) {
      const ids = activeApps.slice(0, 3).map((app) => app.id);
      const extraCount = activeApps.length - ids.length;
      const hint = ids.length > 0
        ? ` (e.g., ${ids.join(", ")}${extraCount > 0 ? ` and ${extraCount} more` : ""})`
        : "";
      throw new AppError(
        ErrorCode.MULTIPLE_ACTIVE_APPLICATIONS,
        `Multiple active applications found for this candidate. Please provide application_id${hint}.`
      );
    }

    return activeApps[0] ?? null;
  }

  /**
   * Select application for read operations (less strict than write)
   */
  selectApplicationForRead<T extends { id: string; status: Application["status"]; updatedAt: string }>(
    applications: T[],
    applicationId?: string
  ): T | null {
    if (applicationId) {
      const match = applications.find((app) => app.id === applicationId);
      if (!match) {
        throw new AppError(
          ErrorCode.APPLICATION_NOT_FOUND,
          "Provided application_id does not belong to this candidate."
        );
      }
      return match;
    }

    const activeApps = applications.filter((app) => app.status === "Active");
    if (activeApps.length === 1) {
      return activeApps[0]!;
    }
    if (activeApps.length > 1) {
      const ids = activeApps.slice(0, 3).map((app) => app.id);
      const extraCount = activeApps.length - ids.length;
      const hint = ids.length > 0
        ? ` (e.g., ${ids.join(", ")}${extraCount > 0 ? ` and ${extraCount} more` : ""})`
        : "";
      throw new AppError(
        ErrorCode.MULTIPLE_ACTIVE_APPLICATIONS,
        `Multiple active applications found for this candidate. Please provide application_id${hint}.`
      );
    }

    if (applications.length === 0) {
      return null;
    }

    const nonArchived = applications.filter((app) => app.status !== "Archived");
    const pool = nonArchived.length > 0 ? nonArchived : applications;
    return [...pool].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    )[0] ?? null;
  }
}
