/**
 * Offer Service
 *
 * Handles offer creation, updates, approvals, and tracking.
 */

import type { AshbyClient } from "../client.js";
import type { SearchService } from "./search-service.js";
import type { Offer, OfferStatus } from "../../types/index.js";
import { ErrorCode, AppError } from "../../utils/errors.js";

export class OfferService {
  constructor(
    private readonly client: AshbyClient,
    private readonly searchService: SearchService
  ) {}

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

  async getOfferForCandidate(
    candidateId: string,
    applicationId?: string
  ): Promise<Offer | null> {
    const activeApp = await this.searchService.getActiveApplicationForCandidate(candidateId, applicationId);

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
    applicationId?: string;
  }): Promise<Offer> {
    const activeApp = await this.searchService.getActiveApplicationForCandidate(
      params.candidateId,
      params.applicationId
    );

    if (!activeApp) {
      throw new AppError(ErrorCode.NO_ACTIVE_APPLICATION, "No active application found for this candidate");
    }

    return this.client.createOffer({
      applicationId: activeApp.id,
      offerProcessId: params.offerProcessId,
      startDate: params.startDate,
      salary: params.salary,
      ...(params.salaryFrequency ? { salaryFrequency: params.salaryFrequency } : {}),
      ...(params.currency ? { currency: params.currency } : {}),
      ...(params.equity !== undefined ? { equity: params.equity } : {}),
      ...(params.equityType ? { equityType: params.equityType } : {}),
      ...(params.signingBonus !== undefined ? { signingBonus: params.signingBonus } : {}),
      ...(params.relocationBonus !== undefined ? { relocationBonus: params.relocationBonus } : {}),
      ...(params.variableCompensation !== undefined
        ? { variableCompensation: params.variableCompensation }
        : {}),
      ...(params.notes ? { notes: params.notes } : {}),
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
}
