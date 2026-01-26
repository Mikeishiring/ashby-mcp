/**
 * Write Service
 *
 * Handles write operations: notes, stage moves, applications, rejections.
 */

import type { AshbyClient } from "../client.js";
import type { SearchService } from "./search-service.js";
import type { Application, Note } from "../../types/index.js";
import { ErrorCode, AppError } from "../../utils/errors.js";

export class WriteService {
  constructor(
    private readonly client: AshbyClient,
    private readonly searchService: SearchService
  ) {}

  async addNote(candidateId: string, content: string): Promise<Note> {
    return this.client.addNote(candidateId, content);
  }

  async moveToStage(applicationId: string, stageId: string): Promise<Application> {
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

  async transferApplication(applicationId: string, jobId: string): Promise<Application> {
    return this.client.transferApplication(applicationId, jobId);
  }

  async rejectCandidate(
    candidateId: string,
    archiveReasonId: string,
    applicationId?: string
  ): Promise<Application> {
    const activeApp = await this.searchService.getActiveApplicationForCandidate(candidateId, applicationId);

    if (!activeApp) {
      throw new AppError(ErrorCode.NO_ACTIVE_APPLICATION, "No active application found for this candidate");
    }

    return this.client.archiveApplication(activeApp.id, archiveReasonId);
  }
}
