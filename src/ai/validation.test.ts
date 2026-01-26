/**
 * Tool Input Validation Tests
 */

import { describe, it, expect } from "vitest";
import {
  validateToolInput,
  toolSchemas,
  scheduleInterviewSchema,
  createOfferSchema,
  createCandidateSchema,
  candidateIdentifierSchema,
  jobIdentifierSchema,
} from "./validation.js";

describe("candidateIdentifierSchema", () => {
  it("should accept candidate_id", () => {
    const result = candidateIdentifierSchema.safeParse({ candidate_id: "123" });
    expect(result.success).toBe(true);
  });

  it("should accept name_or_email", () => {
    const result = candidateIdentifierSchema.safeParse({ name_or_email: "john@example.com" });
    expect(result.success).toBe(true);
  });

  it("should accept candidate_name", () => {
    const result = candidateIdentifierSchema.safeParse({ candidate_name: "John Doe" });
    expect(result.success).toBe(true);
  });

  it("should accept candidate_email", () => {
    const result = candidateIdentifierSchema.safeParse({ candidate_email: "john@example.com" });
    expect(result.success).toBe(true);
  });

  it("should reject empty object", () => {
    const result = candidateIdentifierSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("should reject invalid email", () => {
    const result = candidateIdentifierSchema.safeParse({ candidate_email: "not-an-email" });
    expect(result.success).toBe(false);
  });
});

describe("jobIdentifierSchema", () => {
  it("should accept job_id", () => {
    const result = jobIdentifierSchema.safeParse({ job_id: "456" });
    expect(result.success).toBe(true);
  });

  it("should accept job_title", () => {
    const result = jobIdentifierSchema.safeParse({ job_title: "Software Engineer" });
    expect(result.success).toBe(true);
  });

  it("should reject empty object", () => {
    const result = jobIdentifierSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe("scheduleInterviewSchema", () => {
  const validInput = {
    candidate_id: "123",
    start_time: "2024-01-15T10:00:00Z",
    end_time: "2024-01-15T11:00:00Z",
    interviewer_ids: ["user-1", "user-2"],
  };

  it("should accept valid input", () => {
    const result = scheduleInterviewSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it("should accept optional meeting_link", () => {
    const result = scheduleInterviewSchema.safeParse({
      ...validInput,
      meeting_link: "https://zoom.us/j/123",
    });
    expect(result.success).toBe(true);
  });

  it("should reject invalid meeting_link URL", () => {
    const result = scheduleInterviewSchema.safeParse({
      ...validInput,
      meeting_link: "not-a-url",
    });
    expect(result.success).toBe(false);
  });

  it("should reject invalid datetime", () => {
    const result = scheduleInterviewSchema.safeParse({
      ...validInput,
      start_time: "not-a-date",
    });
    expect(result.success).toBe(false);
  });

  it("should reject empty interviewer_ids", () => {
    const result = scheduleInterviewSchema.safeParse({
      ...validInput,
      interviewer_ids: [],
    });
    expect(result.success).toBe(false);
  });
});

describe("createOfferSchema", () => {
  const validInput = {
    candidate_id: "123",
    offer_process_id: "process-1",
    start_date: "2024-02-01",
    salary: 100000,
  };

  it("should accept valid input", () => {
    const result = createOfferSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it("should accept optional fields", () => {
    const result = createOfferSchema.safeParse({
      ...validInput,
      salary_frequency: "Annual",
      currency: "USD",
      equity: 0.5,
      signing_bonus: 10000,
    });
    expect(result.success).toBe(true);
  });

  it("should reject invalid salary_frequency", () => {
    const result = createOfferSchema.safeParse({
      ...validInput,
      salary_frequency: "Monthly",
    });
    expect(result.success).toBe(false);
  });

  it("should reject invalid date format", () => {
    const result = createOfferSchema.safeParse({
      ...validInput,
      start_date: "2024/02/01",
    });
    expect(result.success).toBe(false);
  });

  it("should reject negative salary", () => {
    const result = createOfferSchema.safeParse({
      ...validInput,
      salary: -100,
    });
    expect(result.success).toBe(false);
  });
});

describe("createCandidateSchema", () => {
  const validInput = {
    name: "John Doe",
    email: "john@example.com",
  };

  it("should accept valid input", () => {
    const result = createCandidateSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it("should accept optional phone", () => {
    const result = createCandidateSchema.safeParse({
      ...validInput,
      phone_number: "+1-555-123-4567",
    });
    expect(result.success).toBe(true);
  });

  it("should accept optional linkedin", () => {
    const result = createCandidateSchema.safeParse({
      ...validInput,
      linkedin_url: "https://linkedin.com/in/johndoe",
    });
    expect(result.success).toBe(true);
  });

  it("should reject invalid email", () => {
    const result = createCandidateSchema.safeParse({
      ...validInput,
      email: "not-an-email",
    });
    expect(result.success).toBe(false);
  });

  it("should reject missing name", () => {
    const result = createCandidateSchema.safeParse({
      email: "john@example.com",
    });
    expect(result.success).toBe(false);
  });

  it("should reject invalid linkedin URL", () => {
    const result = createCandidateSchema.safeParse({
      ...validInput,
      linkedin_url: "not-a-url",
    });
    expect(result.success).toBe(false);
  });
});

describe("validateToolInput", () => {
  it("should validate known tool", () => {
    const result = validateToolInput("search_candidates", { query: "john" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ query: "john" });
    }
  });

  it("should return error for unknown tool", () => {
    const result = validateToolInput("unknown_tool", {});
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("No validation schema");
    }
  });

  it("should return validation errors", () => {
    const result = validateToolInput("search_candidates", {});
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("Validation failed");
    }
  });

  it("should validate get_pipeline_overview with empty object", () => {
    const result = validateToolInput("get_pipeline_overview", {});
    expect(result.success).toBe(true);
  });

  it("should validate get_stale_candidates with optional limit", () => {
    const result = validateToolInput("get_stale_candidates", { limit: 5 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(5);
    }
  });
});

describe("toolSchemas registry", () => {
  it("should have schemas for all expected tools", () => {
    const expectedTools = [
      "get_pipeline_overview",
      "get_stale_candidates",
      "search_candidates",
      "get_candidate_details",
      "schedule_interview",
      "create_offer",
      "create_candidate",
      "add_note",
      "move_candidate_stage",
    ];

    for (const tool of expectedTools) {
      expect(toolSchemas[tool]).toBeDefined();
    }
  });
});
