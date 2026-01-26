/**
 * Offer Service Tests
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { OfferService } from "./offer-service.js";
import type { AshbyClient } from "../client.js";
import type { SearchService } from "./search-service.js";
import type { Application, Offer } from "../../types/index.js";

const createMockClient = (): Partial<AshbyClient> => ({
  listOffers: vi.fn(),
  createOffer: vi.fn(),
  updateOffer: vi.fn(),
  approveOffer: vi.fn(),
  startOffer: vi.fn(),
});

const createMockSearchService = (): Partial<SearchService> => ({
  getActiveApplicationForCandidate: vi.fn(),
});

const createMockApplication = (overrides?: Partial<Application>): Application => ({
  id: "app-1",
  candidateId: "c-1",
  status: "Active",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  currentInterviewStageId: "stage-1",
  jobId: "job-1",
  ...overrides,
});

const createMockOffer = (overrides?: Partial<Offer>): Offer => ({
  id: "offer-1",
  applicationId: "app-1",
  status: "Pending",
  offerProcessId: "proc-1",
  salary: 100000,
  salaryFrequency: "Annual",
  currency: "USD",
  startDate: "2024-02-01",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

describe("OfferService", () => {
  let service: OfferService;
  let mockClient: Partial<AshbyClient>;
  let mockSearchService: Partial<SearchService>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = createMockClient();
    mockSearchService = createMockSearchService();
    service = new OfferService(
      mockClient as AshbyClient,
      mockSearchService as SearchService
    );
  });

  describe("listOffers", () => {
    it("should list all offers without filters", async () => {
      const offers = [createMockOffer()];
      vi.mocked(mockClient.listOffers!).mockResolvedValue(offers);

      const result = await service.listOffers();

      expect(result).toHaveLength(1);
      expect(mockClient.listOffers).toHaveBeenCalledWith(undefined);
    });

    it("should filter by applicationId", async () => {
      const offers = [createMockOffer()];
      vi.mocked(mockClient.listOffers!).mockResolvedValue(offers);

      await service.listOffers({ applicationId: "app-1" });

      expect(mockClient.listOffers).toHaveBeenCalledWith({ applicationId: "app-1" });
    });

    it("should filter by status", async () => {
      const offers = [createMockOffer({ status: "Approved" })];
      vi.mocked(mockClient.listOffers!).mockResolvedValue(offers);

      await service.listOffers({ status: "Approved" });

      expect(mockClient.listOffers).toHaveBeenCalledWith({ status: "Approved" });
    });
  });

  describe("getPendingOffers", () => {
    it("should return offers in draft, pending, or approved status", async () => {
      const offers = [
        createMockOffer({ id: "o1", status: "Draft" }),
        createMockOffer({ id: "o2", status: "Pending" }),
        createMockOffer({ id: "o3", status: "Approved" }),
        createMockOffer({ id: "o4", status: "Accepted" }),
        createMockOffer({ id: "o5", status: "Declined" }),
      ];
      vi.mocked(mockClient.listOffers!).mockResolvedValue(offers);

      const result = await service.getPendingOffers();

      expect(result).toHaveLength(3);
      expect(result.map(o => o.id)).toContain("o1");
      expect(result.map(o => o.id)).toContain("o2");
      expect(result.map(o => o.id)).toContain("o3");
    });
  });

  describe("getOfferForCandidate", () => {
    it("should return first offer for candidate application", async () => {
      const application = createMockApplication();
      const offers = [createMockOffer({ status: "Pending" })];

      vi.mocked(mockSearchService.getActiveApplicationForCandidate!).mockResolvedValue(application);
      vi.mocked(mockClient.listOffers!).mockResolvedValue(offers);

      const result = await service.getOfferForCandidate("c-1");

      expect(result).toBeDefined();
      expect(result!.status).toBe("Pending");
    });

    it("should return null if no application found", async () => {
      vi.mocked(mockSearchService.getActiveApplicationForCandidate!).mockResolvedValue(null);

      const result = await service.getOfferForCandidate("c-1");

      expect(result).toBeNull();
    });

    it("should return null if no offers exist", async () => {
      const application = createMockApplication();

      vi.mocked(mockSearchService.getActiveApplicationForCandidate!).mockResolvedValue(application);
      vi.mocked(mockClient.listOffers!).mockResolvedValue([]);

      const result = await service.getOfferForCandidate("c-1");

      expect(result).toBeNull();
    });

    it("should use specified applicationId when provided", async () => {
      const application = createMockApplication({ id: "specific-app" });
      const offers = [createMockOffer({ applicationId: "specific-app" })];

      vi.mocked(mockSearchService.getActiveApplicationForCandidate!).mockResolvedValue(application);
      vi.mocked(mockClient.listOffers!).mockResolvedValue(offers);

      await service.getOfferForCandidate("c-1", "specific-app");

      expect(mockSearchService.getActiveApplicationForCandidate).toHaveBeenCalledWith("c-1", "specific-app");
    });
  });

  describe("createOffer", () => {
    it("should create offer with required fields", async () => {
      const application = createMockApplication();
      const newOffer = createMockOffer();

      vi.mocked(mockSearchService.getActiveApplicationForCandidate!).mockResolvedValue(application);
      vi.mocked(mockClient.createOffer!).mockResolvedValue(newOffer);

      const result = await service.createOffer({
        candidateId: "c-1",
        offerProcessId: "proc-1",
        startDate: "2024-02-01",
        salary: 100000,
      });

      expect(result.id).toBe("offer-1");
      expect(mockClient.createOffer).toHaveBeenCalledWith({
        applicationId: "app-1",
        offerProcessId: "proc-1",
        startDate: "2024-02-01",
        salary: 100000,
      });
    });

    it("should include optional fields when provided", async () => {
      const application = createMockApplication();
      const newOffer = createMockOffer();

      vi.mocked(mockSearchService.getActiveApplicationForCandidate!).mockResolvedValue(application);
      vi.mocked(mockClient.createOffer!).mockResolvedValue(newOffer);

      await service.createOffer({
        candidateId: "c-1",
        offerProcessId: "proc-1",
        startDate: "2024-02-01",
        salary: 100000,
        salaryFrequency: "Annual",
        currency: "USD",
        equity: 0.1,
        equityType: "Options",
        signingBonus: 10000,
        relocationBonus: 5000,
        variableCompensation: 20000,
        notes: "Great candidate",
      });

      expect(mockClient.createOffer).toHaveBeenCalledWith(
        expect.objectContaining({
          equity: 0.1,
          equityType: "Options",
          signingBonus: 10000,
          relocationBonus: 5000,
          variableCompensation: 20000,
          notes: "Great candidate",
        })
      );
    });

    it("should use specified applicationId when provided", async () => {
      const application = createMockApplication({ id: "specific-app" });

      vi.mocked(mockSearchService.getActiveApplicationForCandidate!).mockResolvedValue(application);
      vi.mocked(mockClient.createOffer!).mockResolvedValue(createMockOffer());

      await service.createOffer({
        candidateId: "c-1",
        offerProcessId: "proc-1",
        startDate: "2024-02-01",
        salary: 100000,
        applicationId: "specific-app",
      });

      expect(mockSearchService.getActiveApplicationForCandidate).toHaveBeenCalledWith("c-1", "specific-app");
    });

    it("should throw error if no application found", async () => {
      vi.mocked(mockSearchService.getActiveApplicationForCandidate!).mockResolvedValue(null);

      await expect(
        service.createOffer({
          candidateId: "c-1",
          offerProcessId: "proc-1",
          startDate: "2024-02-01",
          salary: 100000,
        })
      ).rejects.toThrow("No active application");
    });
  });

  describe("updateOffer", () => {
    it("should update offer fields", async () => {
      const updatedOffer = createMockOffer({ salary: 110000 });
      vi.mocked(mockClient.updateOffer!).mockResolvedValue(updatedOffer);

      const result = await service.updateOffer("offer-1", { salary: 110000 });

      expect(result.salary).toBe(110000);
      expect(mockClient.updateOffer).toHaveBeenCalledWith("offer-1", { salary: 110000 });
    });

    it("should allow updating multiple fields", async () => {
      const updatedOffer = createMockOffer();
      vi.mocked(mockClient.updateOffer!).mockResolvedValue(updatedOffer);

      await service.updateOffer("offer-1", {
        salary: 110000,
        startDate: "2024-03-01",
        equity: 0.15,
        notes: "Updated offer",
      });

      expect(mockClient.updateOffer).toHaveBeenCalledWith("offer-1", {
        salary: 110000,
        startDate: "2024-03-01",
        equity: 0.15,
        notes: "Updated offer",
      });
    });
  });

  describe("approveOffer", () => {
    it("should approve offer with approver ID", async () => {
      const approvedOffer = createMockOffer({ status: "Approved" });
      vi.mocked(mockClient.approveOffer!).mockResolvedValue(approvedOffer);

      const result = await service.approveOffer("offer-1", "approver-1");

      expect(result.status).toBe("Approved");
      expect(mockClient.approveOffer).toHaveBeenCalledWith("offer-1", "approver-1");
    });
  });

  describe("sendOffer", () => {
    it("should start the offer process", async () => {
      const sentOffer = createMockOffer({ sentAt: new Date().toISOString() });
      vi.mocked(mockClient.startOffer!).mockResolvedValue(sentOffer);

      const result = await service.sendOffer("offer-1");

      expect(result.sentAt).toBeDefined();
      expect(mockClient.startOffer).toHaveBeenCalledWith("offer-1");
    });
  });
});
