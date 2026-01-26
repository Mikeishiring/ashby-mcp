/**
 * Tool Executor Tests
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { ToolExecutor } from "./executor.js";
import type { AshbyService } from "../ashby/service.js";
import type { SafetyGuards } from "../safety/guards.js";
import type { Candidate, Application, Job, InterviewStage, Note, Offer, InterviewSchedule } from "../types/index.js";

// Helper type for result data with message
type ResultData = { message: string } | undefined;

const createMockAshbyService = (): Partial<AshbyService> => ({
  getPipelineSummary: vi.fn(),
  getStaleCandidates: vi.fn(),
  getCandidatesNeedingDecision: vi.fn(),
  getRecentApplications: vi.fn(),
  searchCandidates: vi.fn(),
  getJobWithCandidates: vi.fn(),
  getCandidateFullContext: vi.fn(),
  getOpenJobs: vi.fn(),
  listInterviewPlans: vi.fn(),
  getInterviewSchedulesForCandidate: vi.fn(),
  listUsers: vi.fn(),
  getCandidateScorecard: vi.fn(),
  listFeedbackSubmissions: vi.fn(),
  compareCandidates: vi.fn(),
  getSourceAnalytics: vi.fn(),
  getInterviewPrepPacket: vi.fn(),
  getArchiveReasons: vi.fn(),
  listCandidateTags: vi.fn(),
  listSources: vi.fn(),
  getApplicationHiringTeam: vi.fn(),
  searchUsers: vi.fn(),
  getFeedbackDetails: vi.fn(),
  listCustomFields: vi.fn(),
  listLocations: vi.fn(),
  listDepartments: vi.fn(),
  getApplicationHistory: vi.fn(),
  listInterviewEvents: vi.fn(),
  listOffers: vi.fn(),
  getPendingOffers: vi.fn(),
  getOfferForCandidate: vi.fn(),
  listAllInterviews: vi.fn(),
  getUpcomingInterviews: vi.fn(),
  analyzeCandidateStatus: vi.fn(),
  analyzeCandidateBlockers: vi.fn(),
  findCandidateByNameOrEmail: vi.fn(),
  getActiveApplicationForCandidate: vi.fn(),
  addNote: vi.fn(),
  findStageByName: vi.fn(),
  moveToStage: vi.fn(),
  scheduleInterview: vi.fn(),
  rejectCandidate: vi.fn(),
  createCandidate: vi.fn(),
  createApplication: vi.fn(),
  transferApplication: vi.fn(),
  addCandidateTag: vi.fn(),
  createOffer: vi.fn(),
  updateOffer: vi.fn(),
  approveOffer: vi.fn(),
  sendOffer: vi.fn(),
  rescheduleInterview: vi.fn(),
  cancelInterview: vi.fn(),
  getApplication: vi.fn(),
  getInterview: vi.fn(),
});

const createMockSafetyGuards = (): Partial<SafetyGuards> => ({
  checkWriteOperation: vi.fn(),
  checkReadOperation: vi.fn(),
});

const createMockCandidate = (overrides?: Partial<Candidate>): Candidate => ({
  id: "c-1",
  name: "John Doe",
  primaryEmailAddress: { value: "john@example.com", type: "work", isPrimary: true },
  phoneNumbers: [],
  socialLinks: [],
  tags: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  applicationIds: ["app-1"],
  profileUrl: "https://app.ashbyhq.com/candidate/c-1",
  ...overrides,
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

const createMockJob = (overrides?: Partial<Job>): Job => ({
  id: "job-1",
  title: "Software Engineer",
  status: "Open",
  employmentType: "FullTime",
  hiringTeam: [],
  jobPostings: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

const createMockNote = (overrides?: Partial<Note>): Note => ({
  id: "note-1",
  content: "Test note",
  createdAt: new Date().toISOString(),
  authorId: "user-1",
  visibility: "Public",
  ...overrides,
});

const createMockOffer = (overrides?: Partial<Offer>): Offer => ({
  id: "offer-1",
  applicationId: "app-1",
  status: "Draft",
  offerProcessId: "process-1",
  startDate: "2024-02-01",
  salary: 100000,
  salaryFrequency: "Annual",
  currency: "USD",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

const createMockInterviewSchedule = (overrides?: Partial<InterviewSchedule>): InterviewSchedule => ({
  id: "schedule-1",
  applicationId: "app-1",
  interviewEvents: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

const createMockStage = (overrides?: Partial<InterviewStage>): InterviewStage => ({
  id: "stage-1",
  title: "Phone Screen",
  orderInInterviewPlan: 1,
  interviewStageType: "Interview",
  ...overrides,
});

describe("ToolExecutor", () => {
  let executor: ToolExecutor;
  let mockAshby: Partial<AshbyService>;
  let mockSafety: Partial<SafetyGuards>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAshby = createMockAshbyService();
    mockSafety = createMockSafetyGuards();
    executor = new ToolExecutor(
      mockAshby as AshbyService,
      mockSafety as SafetyGuards
    );
  });

  describe("Read Operations", () => {
    beforeEach(() => {
      vi.mocked(mockSafety.checkReadOperation!).mockResolvedValue({ allowed: true });
    });

    describe("get_pipeline_overview", () => {
      it("should return pipeline summary", async () => {
        const summary = { totalCandidates: 50, staleCount: 5 };
        vi.mocked(mockAshby.getPipelineSummary!).mockResolvedValue(summary as any);

        const result = await executor.execute("get_pipeline_overview", {});

        expect(result.success).toBe(true);
        expect(result.data).toEqual(summary);
      });
    });

    describe("get_stale_candidates", () => {
      it("should return stale candidates with default limit", async () => {
        const candidates = [{ id: "c-1", name: "John" }];
        vi.mocked(mockAshby.getStaleCandidates!).mockResolvedValue(candidates as any);

        const result = await executor.execute("get_stale_candidates", {});

        expect(result.success).toBe(true);
        expect(mockAshby.getStaleCandidates).toHaveBeenCalledWith(10);
      });

      it("should respect custom limit", async () => {
        vi.mocked(mockAshby.getStaleCandidates!).mockResolvedValue([]);

        await executor.execute("get_stale_candidates", { limit: 5 });

        expect(mockAshby.getStaleCandidates).toHaveBeenCalledWith(5);
      });
    });

    describe("search_candidates", () => {
      it("should require query parameter", async () => {
        const result = await executor.execute("search_candidates", {});

        expect(result.success).toBe(false);
        expect(result.error).toContain("query is required");
      });

      it("should filter out hired candidates", async () => {
        const candidates = [
          createMockCandidate({ id: "c-1" }),
          createMockCandidate({ id: "c-2" }),
        ];
        vi.mocked(mockAshby.searchCandidates!).mockResolvedValue(candidates);
        vi.mocked(mockSafety.checkReadOperation!).mockResolvedValueOnce({ allowed: true });
        vi.mocked(mockSafety.checkReadOperation!).mockResolvedValueOnce({
          allowed: false,
          reason: "Candidate is hired",
        });

        const result = await executor.execute("search_candidates", { query: "john" });

        expect(result.success).toBe(true);
        expect(result.data).toHaveLength(1);
      });
    });

    describe("get_candidate_details", () => {
      it("should return candidate context", async () => {
        const context = {
          candidate: createMockCandidate(),
          applications: [],
          notes: [],
        };
        vi.mocked(mockAshby.findCandidateByNameOrEmail!).mockResolvedValue(createMockCandidate());
        vi.mocked(mockAshby.getCandidateFullContext!).mockResolvedValue(context as any);

        const result = await executor.execute("get_candidate_details", {
          candidate_id: "c-1",
        });

        expect(result.success).toBe(true);
        expect(result.data).toEqual(context);
      });

      it("should error when candidate not found", async () => {
        vi.mocked(mockAshby.findCandidateByNameOrEmail!).mockResolvedValue(null);

        const result = await executor.execute("get_candidate_details", {
          name_or_email: "unknown",
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain("Could not identify candidate");
      });

      it("should block access to hired candidates", async () => {
        vi.mocked(mockAshby.findCandidateByNameOrEmail!).mockResolvedValue(createMockCandidate());
        vi.mocked(mockSafety.checkReadOperation!).mockResolvedValue({
          allowed: false,
          reason: "Candidate is hired",
        });

        const result = await executor.execute("get_candidate_details", {
          candidate_id: "c-1",
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain("hired");
      });
    });

    describe("get_candidates_for_job", () => {
      it("should return job with candidates", async () => {
        const data = {
          job: createMockJob(),
          candidates: [createMockApplication()],
        };
        vi.mocked(mockAshby.getJobWithCandidates!).mockResolvedValue(data as any);

        const result = await executor.execute("get_candidates_for_job", {
          job_id: "job-1",
        });

        expect(result.success).toBe(true);
        expect(result.data).toEqual(data);
      });

      it("should resolve job by title", async () => {
        vi.mocked(mockAshby.getOpenJobs!).mockResolvedValue([createMockJob()]);
        vi.mocked(mockAshby.getJobWithCandidates!).mockResolvedValue({
          job: createMockJob(),
          candidates: [],
        } as any);

        await executor.execute("get_candidates_for_job", {
          job_title: "engineer",
        });

        expect(mockAshby.getJobWithCandidates).toHaveBeenCalledWith("job-1");
      });
    });

    describe("get_open_jobs", () => {
      it("should return open jobs", async () => {
        const jobs = [createMockJob()];
        vi.mocked(mockAshby.getOpenJobs!).mockResolvedValue(jobs);

        const result = await executor.execute("get_open_jobs", {});

        expect(result.success).toBe(true);
        expect(result.data).toEqual(jobs);
      });
    });

    describe("get_source_analytics", () => {
      it("should return source analytics with default days", async () => {
        vi.mocked(mockAshby.getSourceAnalytics!).mockResolvedValue([]);

        await executor.execute("get_source_analytics", {});

        expect(mockAshby.getSourceAnalytics).toHaveBeenCalledWith(90);
      });

      it("should respect custom days parameter", async () => {
        vi.mocked(mockAshby.getSourceAnalytics!).mockResolvedValue([]);

        await executor.execute("get_source_analytics", { days: 30 });

        expect(mockAshby.getSourceAnalytics).toHaveBeenCalledWith(30);
      });
    });

    describe("compare_candidates", () => {
      it("should check read permissions for each candidate", async () => {
        vi.mocked(mockSafety.checkReadOperation!).mockResolvedValue({ allowed: true });
        vi.mocked(mockAshby.compareCandidates!).mockResolvedValue({
          candidates: [],
          job: null,
          comparisonFields: [],
        });

        await executor.execute("compare_candidates", {
          candidate_ids: ["c-1", "c-2"],
        });

        expect(mockSafety.checkReadOperation).toHaveBeenCalledTimes(2);
      });

      it("should block if any candidate is not readable", async () => {
        vi.mocked(mockSafety.checkReadOperation!).mockResolvedValueOnce({ allowed: true });
        vi.mocked(mockSafety.checkReadOperation!).mockResolvedValueOnce({
          allowed: false,
          reason: "Not allowed",
        });

        const result = await executor.execute("compare_candidates", {
          candidate_ids: ["c-1", "c-2"],
        });

        expect(result.success).toBe(false);
      });
    });

    describe("unknown tool", () => {
      it("should return error for unknown tool", async () => {
        const result = await executor.execute("unknown_tool", {});

        expect(result.success).toBe(false);
        expect(result.error).toContain("Unknown tool");
      });
    });
  });

  describe("Write Operations", () => {
    describe("add_note", () => {
      it("should add note to candidate", async () => {
        vi.mocked(mockSafety.checkWriteOperation!).mockResolvedValue({
          allowed: true,
          requiresConfirmation: false,
        });
        vi.mocked(mockAshby.findCandidateByNameOrEmail!).mockResolvedValue(createMockCandidate());
        vi.mocked(mockAshby.addNote!).mockResolvedValue(createMockNote());

        const result = await executor.execute("add_note", {
          candidate_id: "c-1",
          content: "Test note",
        });

        expect(result.success).toBe(true);
        expect((result.data as ResultData)?.message).toContain("Note added");
      });

      it("should require confirmation in CONFIRM_ALL mode", async () => {
        vi.mocked(mockSafety.checkWriteOperation!).mockResolvedValue({
          allowed: true,
          requiresConfirmation: true,
        });
        vi.mocked(mockAshby.findCandidateByNameOrEmail!).mockResolvedValue(createMockCandidate());

        const result = await executor.execute("add_note", {
          candidate_id: "c-1",
          content: "Test note",
        });

        expect(result.success).toBe(true);
        expect(result.requiresConfirmation).toBe(true);
      });

      it("should block write to hired candidate", async () => {
        vi.mocked(mockAshby.findCandidateByNameOrEmail!).mockResolvedValue(createMockCandidate());
        vi.mocked(mockSafety.checkWriteOperation!).mockResolvedValue({
          allowed: false,
          reason: "Candidate is hired",
        });

        const result = await executor.execute("add_note", {
          candidate_id: "c-1",
          content: "Test",
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain("hired");
      });
    });

    describe("move_candidate_stage", () => {
      it("should move candidate to new stage", async () => {
        vi.mocked(mockSafety.checkWriteOperation!).mockResolvedValue({
          allowed: true,
          requiresConfirmation: false,
        });
        vi.mocked(mockAshby.findCandidateByNameOrEmail!).mockResolvedValue(createMockCandidate());
        vi.mocked(mockAshby.findStageByName!).mockResolvedValue(createMockStage({ title: "Onsite" }));
        vi.mocked(mockAshby.getActiveApplicationForCandidate!).mockResolvedValue(createMockApplication());
        vi.mocked(mockAshby.moveToStage!).mockResolvedValue(createMockApplication());

        const result = await executor.execute("move_candidate_stage", {
          candidate_id: "c-1",
          target_stage: "Onsite",
        });

        expect(result.success).toBe(true);
        expect((result.data as ResultData)?.message).toContain("Onsite");
      });

      it("should error if stage not found", async () => {
        vi.mocked(mockSafety.checkWriteOperation!).mockResolvedValue({
          allowed: true,
          requiresConfirmation: false,
        });
        vi.mocked(mockAshby.findCandidateByNameOrEmail!).mockResolvedValue(createMockCandidate());
        vi.mocked(mockAshby.findStageByName!).mockResolvedValue(null);

        const result = await executor.executeConfirmed("move_candidate_stage", {
          target_stage: "Unknown Stage",
        }, "c-1");

        expect(result.success).toBe(false);
        expect(result.error).toContain("Could not find stage");
      });
    });

    describe("schedule_interview", () => {
      it("should schedule interview with required fields", async () => {
        vi.mocked(mockSafety.checkWriteOperation!).mockResolvedValue({
          allowed: true,
          requiresConfirmation: false,
        });
        vi.mocked(mockAshby.findCandidateByNameOrEmail!).mockResolvedValue(createMockCandidate());
        vi.mocked(mockAshby.scheduleInterview!).mockResolvedValue(createMockInterviewSchedule());

        const result = await executor.execute("schedule_interview", {
          candidate_id: "c-1",
          start_time: "2024-01-15T10:00:00Z",
          end_time: "2024-01-15T11:00:00Z",
          interviewer_ids: ["user-1"],
        });

        expect(result.success).toBe(true);
        expect((result.data as ResultData)?.message).toContain("scheduled");
      });

      it("should error if required fields missing", async () => {
        vi.mocked(mockSafety.checkWriteOperation!).mockResolvedValue({
          allowed: true,
          requiresConfirmation: false,
        });
        vi.mocked(mockAshby.findCandidateByNameOrEmail!).mockResolvedValue(createMockCandidate());

        const result = await executor.executeConfirmed("schedule_interview", {
          candidate_id: "c-1",
        }, "c-1");

        expect(result.success).toBe(false);
        expect(result.error).toContain("Missing required fields");
      });
    });

    describe("reject_candidate", () => {
      it("should reject candidate with reason", async () => {
        vi.mocked(mockSafety.checkWriteOperation!).mockResolvedValue({
          allowed: true,
          requiresConfirmation: false,
        });
        vi.mocked(mockAshby.findCandidateByNameOrEmail!).mockResolvedValue(createMockCandidate());
        vi.mocked(mockAshby.rejectCandidate!).mockResolvedValue(
          createMockApplication({ status: "Archived" })
        );

        const result = await executor.execute("reject_candidate", {
          candidate_id: "c-1",
          archive_reason_id: "reason-1",
        });

        expect(result.success).toBe(true);
        expect((result.data as ResultData)?.message).toContain("rejected");
      });

      it("should error if archive reason missing", async () => {
        vi.mocked(mockSafety.checkWriteOperation!).mockResolvedValue({
          allowed: true,
          requiresConfirmation: false,
        });
        vi.mocked(mockAshby.findCandidateByNameOrEmail!).mockResolvedValue(createMockCandidate());

        const result = await executor.executeConfirmed("reject_candidate", {
          candidate_id: "c-1",
        }, "c-1");

        expect(result.success).toBe(false);
        expect(result.error).toContain("archive_reason_id");
      });
    });

    describe("create_candidate", () => {
      it("should create candidate with required fields", async () => {
        vi.mocked(mockSafety.checkWriteOperation!).mockResolvedValue({
          allowed: true,
          requiresConfirmation: false,
        });
        vi.mocked(mockAshby.createCandidate!).mockResolvedValue(
          createMockCandidate({
            primaryEmailAddress: { value: "new@example.com", type: "work", isPrimary: true },
          })
        );

        const result = await executor.execute("create_candidate", {
          name: "New Candidate",
          email: "new@example.com",
        });

        expect(result.success).toBe(true);
        expect((result.data as ResultData)?.message).toContain("created");
      });

      it("should error if name or email missing", async () => {
        vi.mocked(mockSafety.checkWriteOperation!).mockResolvedValue({
          allowed: true,
          requiresConfirmation: false,
        });

        const result = await executor.executeConfirmed("create_candidate", {
          name: "Just Name",
        }, undefined);

        expect(result.success).toBe(false);
        expect(result.error).toContain("name, email");
      });
    });

    describe("Offer Operations", () => {
      describe("create_offer", () => {
        it("should create offer with required fields", async () => {
          vi.mocked(mockSafety.checkWriteOperation!).mockResolvedValue({
            allowed: true,
            requiresConfirmation: false,
          });
          vi.mocked(mockAshby.findCandidateByNameOrEmail!).mockResolvedValue(createMockCandidate());
          vi.mocked(mockAshby.createOffer!).mockResolvedValue(createMockOffer());

          const result = await executor.execute("create_offer", {
            candidate_id: "c-1",
            offer_process_id: "process-1",
            start_date: "2024-02-01",
            salary: 100000,
          });

          expect(result.success).toBe(true);
          expect((result.data as ResultData)?.message).toContain("Offer created");
        });
      });

      describe("update_offer", () => {
        it("should update offer by ID", async () => {
          vi.mocked(mockSafety.checkWriteOperation!).mockResolvedValue({
            allowed: true,
            requiresConfirmation: false,
          });
          vi.mocked(mockAshby.updateOffer!).mockResolvedValue(createMockOffer({ salary: 110000 }));

          const result = await executor.executeConfirmed("update_offer", {
            offer_id: "offer-1",
            salary: 110000,
          }, undefined);

          expect(result.success).toBe(true);
        });

        it("should error if offer_id missing", async () => {
          vi.mocked(mockSafety.checkWriteOperation!).mockResolvedValue({
            allowed: true,
            requiresConfirmation: false,
          });

          const result = await executor.executeConfirmed("update_offer", {
            salary: 110000,
          }, undefined);

          expect(result.success).toBe(false);
          expect(result.error).toContain("offer_id");
        });
      });

      describe("approve_offer", () => {
        it("should approve offer", async () => {
          vi.mocked(mockSafety.checkWriteOperation!).mockResolvedValue({
            allowed: true,
            requiresConfirmation: false,
          });
          vi.mocked(mockAshby.approveOffer!).mockResolvedValue(createMockOffer({ status: "Approved" }));

          const result = await executor.executeConfirmed("approve_offer", {
            offer_id: "offer-1",
            approver_id: "user-1",
          }, undefined);

          expect(result.success).toBe(true);
        });
      });

      describe("send_offer", () => {
        it("should send offer", async () => {
          vi.mocked(mockSafety.checkWriteOperation!).mockResolvedValue({
            allowed: true,
            requiresConfirmation: false,
          });
          vi.mocked(mockAshby.sendOffer!).mockResolvedValue(createMockOffer({ status: "Sent", sentAt: new Date().toISOString() }));

          const result = await executor.executeConfirmed("send_offer", {
            offer_id: "offer-1",
          }, undefined);

          expect(result.success).toBe(true);
          expect((result.data as ResultData)?.message).toContain("sent");
        });
      });
    });

    describe("Interview Operations", () => {
      describe("reschedule_interview", () => {
        it("should reschedule interview", async () => {
          vi.mocked(mockSafety.checkWriteOperation!).mockResolvedValue({
            allowed: true,
            requiresConfirmation: false,
          });
          vi.mocked(mockAshby.rescheduleInterview!).mockResolvedValue(createMockInterviewSchedule());

          const result = await executor.executeConfirmed("reschedule_interview", {
            interview_schedule_id: "schedule-1",
            start_time: "2024-01-16T10:00:00Z",
            end_time: "2024-01-16T11:00:00Z",
            interviewer_ids: ["user-1"],
          }, undefined);

          expect(result.success).toBe(true);
          expect((result.data as ResultData)?.message).toContain("rescheduled");
        });
      });

      describe("cancel_interview", () => {
        it("should cancel interview", async () => {
          vi.mocked(mockSafety.checkWriteOperation!).mockResolvedValue({
            allowed: true,
            requiresConfirmation: false,
          });
          vi.mocked(mockAshby.cancelInterview!).mockResolvedValue({ success: true });

          const result = await executor.executeConfirmed("cancel_interview", {
            interview_schedule_id: "schedule-1",
            cancellation_reason: "Candidate unavailable",
          }, undefined);

          expect(result.success).toBe(true);
          expect((result.data as ResultData)?.message).toContain("canceled");
        });
      });
    });

    describe("Application Operations", () => {
      describe("apply_to_job", () => {
        it("should create application for candidate", async () => {
          vi.mocked(mockSafety.checkWriteOperation!).mockResolvedValue({
            allowed: true,
            requiresConfirmation: false,
          });
          vi.mocked(mockAshby.findCandidateByNameOrEmail!).mockResolvedValue(createMockCandidate());
          vi.mocked(mockAshby.getOpenJobs!).mockResolvedValue([createMockJob()]);
          vi.mocked(mockAshby.createApplication!).mockResolvedValue(createMockApplication());

          const result = await executor.execute("apply_to_job", {
            candidate_id: "c-1",
            job_id: "job-1",
          });

          expect(result.success).toBe(true);
          expect((result.data as ResultData)?.message).toContain("Application created");
        });
      });

      describe("transfer_application", () => {
        it("should transfer application to new job", async () => {
          vi.mocked(mockSafety.checkWriteOperation!).mockResolvedValue({
            allowed: true,
            requiresConfirmation: false,
          });
          vi.mocked(mockAshby.findCandidateByNameOrEmail!).mockResolvedValue(createMockCandidate());
          vi.mocked(mockAshby.getActiveApplicationForCandidate!).mockResolvedValue(createMockApplication());
          vi.mocked(mockAshby.getOpenJobs!).mockResolvedValue([createMockJob({ id: "job-2" })]);
          vi.mocked(mockAshby.transferApplication!).mockResolvedValue(
            createMockApplication({ jobId: "job-2" })
          );

          const result = await executor.execute("transfer_application", {
            candidate_id: "c-1",
            job_id: "job-2",
          });

          expect(result.success).toBe(true);
          expect((result.data as ResultData)?.message).toContain("transferred");
        });
      });

      describe("add_candidate_tag", () => {
        it("should add tag to candidate", async () => {
          vi.mocked(mockSafety.checkWriteOperation!).mockResolvedValue({
            allowed: true,
            requiresConfirmation: false,
          });
          vi.mocked(mockAshby.findCandidateByNameOrEmail!).mockResolvedValue(createMockCandidate());
          vi.mocked(mockAshby.addCandidateTag!).mockResolvedValue(createMockCandidate());

          const result = await executor.execute("add_candidate_tag", {
            candidate_id: "c-1",
            tag_id: "tag-1",
          });

          expect(result.success).toBe(true);
          expect((result.data as ResultData)?.message).toContain("Tag added");
        });
      });
    });
  });

  describe("Error Handling", () => {
    it("should catch and return errors gracefully", async () => {
      vi.mocked(mockAshby.getPipelineSummary!).mockRejectedValue(
        new Error("API connection failed")
      );

      const result = await executor.execute("get_pipeline_overview", {});

      expect(result.success).toBe(false);
      expect(result.error).toContain("API connection failed");
    });

    it("should handle non-Error throws", async () => {
      vi.mocked(mockAshby.getPipelineSummary!).mockRejectedValue("string error");

      const result = await executor.execute("get_pipeline_overview", {});

      expect(result.success).toBe(false);
      expect(result.error).toBe("Unknown error");
    });

    it("should handle unknown tool name", async () => {
      const result = await executor.execute("unknown_tool", {});

      expect(result.success).toBe(false);
      expect(result.error).toContain("Unknown tool");
    });
  });

  describe("executeConfirmed Error Paths", () => {
    it("should error when candidate required but not provided", async () => {
      const result = await executor.executeConfirmed("add_note", { content: "test" }, undefined);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Missing candidate context");
    });

    it("should handle unknown tool in executeConfirmed", async () => {
      const result = await executor.executeConfirmed("unknown_tool", {}, "c-1");

      expect(result.success).toBe(false);
      expect(result.error).toContain("Unknown write operation");
    });

    it("should handle move_candidate_stage when stage not found", async () => {
      vi.mocked(mockAshby.findStageByName!).mockResolvedValue(null);

      const result = await executor.executeConfirmed(
        "move_candidate_stage",
        { target_stage: "NonexistentStage" },
        "c-1"
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("Could not find stage");
    });

    it("should handle move_candidate_stage when no active application", async () => {
      vi.mocked(mockAshby.findStageByName!).mockResolvedValue(createMockStage());
      vi.mocked(mockAshby.getActiveApplicationForCandidate!).mockResolvedValue(null);

      const result = await executor.executeConfirmed(
        "move_candidate_stage",
        { target_stage: "Phone Screen" },
        "c-1"
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("No active application");
    });

    it("should handle schedule_interview missing required fields", async () => {
      const result = await executor.executeConfirmed(
        "schedule_interview",
        { start_time: "2024-01-16T10:00:00Z" }, // Missing end_time and interviewer_ids
        "c-1"
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("Missing required fields");
    });

    it("should handle reject_candidate missing archive_reason_id", async () => {
      const result = await executor.executeConfirmed(
        "reject_candidate",
        {},
        "c-1"
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("archive_reason_id");
    });

    it("should handle create_candidate missing name", async () => {
      const result = await executor.executeConfirmed(
        "create_candidate",
        { email: "test@example.com" },
        undefined
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("name, email");
    });

    it("should handle create_candidate with full params", async () => {
      vi.mocked(mockAshby.createCandidate!).mockResolvedValue({
        id: "c-new",
        name: "New Person",
        primaryEmailAddress: { value: "new@example.com" },
        applicationIds: [],
      } as any);

      const result = await executor.executeConfirmed(
        "create_candidate",
        {
          name: "New Person",
          email: "new@example.com",
          phone_number: "555-1234",
          linkedin_url: "https://linkedin.com/in/new",
          source_id: "src-1",
          tags: ["tag1", "tag2"],
        },
        undefined
      );

      expect(result.success).toBe(true);
      expect(mockAshby.createCandidate).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "New Person",
          email: "new@example.com",
          phoneNumber: "555-1234",
          socialLinks: [{ url: "https://linkedin.com/in/new", type: "LinkedIn" }],
          source: { sourceId: "src-1" },
          tags: ["tag1", "tag2"],
        })
      );
    });

    it("should handle set_reminder confirmed operation", async () => {
      const result = await executor.executeConfirmed(
        "set_reminder",
        { remind_in: "3 days", note: "Follow up" },
        "c-1"
      );

      expect(result.success).toBe(true);
      const data = result.data as { requiresSlackScheduling?: boolean };
      expect(data?.requiresSlackScheduling).toBe(true);
    });
  });

  describe("Candidate Resolution", () => {
    it("should resolve candidate by ID", async () => {
      vi.mocked(mockSafety.checkReadOperation!).mockResolvedValue({ allowed: true });
      vi.mocked(mockAshby.getCandidateFullContext!).mockResolvedValue({
        candidate: createMockCandidate(),
        applications: [],
        notes: [],
      } as any);

      await executor.execute("get_candidate_details", { candidate_id: "c-1" });

      expect(mockAshby.findCandidateByNameOrEmail).not.toHaveBeenCalled();
    });

    it("should resolve candidate by name_or_email", async () => {
      vi.mocked(mockSafety.checkReadOperation!).mockResolvedValue({ allowed: true });
      vi.mocked(mockAshby.findCandidateByNameOrEmail!).mockResolvedValue(createMockCandidate());
      vi.mocked(mockAshby.getCandidateFullContext!).mockResolvedValue({
        candidate: createMockCandidate(),
        applications: [],
        notes: [],
      } as any);

      await executor.execute("get_candidate_details", { name_or_email: "john@example.com" });

      expect(mockAshby.findCandidateByNameOrEmail).toHaveBeenCalledWith("john@example.com");
    });

    it("should resolve candidate by candidate_email", async () => {
      vi.mocked(mockSafety.checkReadOperation!).mockResolvedValue({ allowed: true });
      vi.mocked(mockAshby.findCandidateByNameOrEmail!).mockResolvedValue(createMockCandidate());
      vi.mocked(mockAshby.getCandidateFullContext!).mockResolvedValue({
        candidate: createMockCandidate(),
        applications: [],
        notes: [],
      } as any);

      await executor.execute("get_candidate_details", { candidate_email: "john@example.com" });

      expect(mockAshby.findCandidateByNameOrEmail).toHaveBeenCalledWith("john@example.com");
    });
  });

  describe("Job Resolution", () => {
    it("should resolve job by ID", async () => {
      vi.mocked(mockAshby.getJobWithCandidates!).mockResolvedValue({
        job: createMockJob(),
        candidates: [],
      } as any);

      await executor.execute("get_candidates_for_job", { job_id: "job-1" });

      expect(mockAshby.getOpenJobs).not.toHaveBeenCalled();
    });

    it("should resolve job by title", async () => {
      vi.mocked(mockAshby.getOpenJobs!).mockResolvedValue([
        createMockJob({ id: "job-1", title: "Software Engineer" }),
        createMockJob({ id: "job-2", title: "Product Manager" }),
      ]);
      vi.mocked(mockAshby.getJobWithCandidates!).mockResolvedValue({
        job: createMockJob(),
        candidates: [],
      } as any);

      await executor.execute("get_candidates_for_job", { job_title: "engineer" });

      expect(mockAshby.getJobWithCandidates).toHaveBeenCalledWith("job-1");
    });

    it("should error if job not found", async () => {
      vi.mocked(mockAshby.getOpenJobs!).mockResolvedValue([
        createMockJob({ id: "job-1", title: "Software Engineer" }),
      ]);

      const result = await executor.execute("get_candidates_for_job", {
        job_title: "nonexistent",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Could not identify job");
    });
  });
});
