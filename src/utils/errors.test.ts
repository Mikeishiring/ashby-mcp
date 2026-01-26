/**
 * Error Taxonomy Tests
 */

import { describe, it, expect } from "vitest";
import {
  AppError,
  ValidationError,
  NotFoundError,
  ApiError,
  RateLimitError,
  SafetyError,
  ErrorCode,
  ErrorMessages,
  isAppError,
  toAppError,
  getErrorMessage,
} from "./errors.js";

describe("ErrorCode", () => {
  it("should have unique error codes", () => {
    const codes = Object.values(ErrorCode);
    const uniqueCodes = new Set(codes);
    expect(codes.length).toBe(uniqueCodes.size);
  });

  it("should have messages for all error codes", () => {
    const codes = Object.values(ErrorCode);
    for (const code of codes) {
      expect(ErrorMessages[code]).toBeDefined();
      expect(typeof ErrorMessages[code]).toBe("string");
    }
  });
});

describe("AppError", () => {
  it("should create error with code and default message", () => {
    const error = new AppError(ErrorCode.VALIDATION_FAILED);
    expect(error.code).toBe(ErrorCode.VALIDATION_FAILED);
    expect(error.message).toBe(ErrorMessages[ErrorCode.VALIDATION_FAILED]);
    expect(error.name).toBe("AppError");
  });

  it("should create error with custom message", () => {
    const error = new AppError(ErrorCode.VALIDATION_FAILED, "Custom message");
    expect(error.message).toBe("Custom message");
  });

  it("should include details when provided", () => {
    const error = new AppError(ErrorCode.VALIDATION_FAILED, "Test", {
      details: { field: "email" },
    });
    expect(error.details).toEqual({ field: "email" });
  });

  it("should include cause when provided", () => {
    const cause = new Error("Original error");
    const error = new AppError(ErrorCode.VALIDATION_FAILED, "Test", { cause });
    expect(error.cause).toBe(cause);
  });

  it("should convert to user message", () => {
    const error = new AppError(ErrorCode.VALIDATION_FAILED, "User-friendly message");
    expect(error.toUserMessage()).toBe("User-friendly message");
  });

  it("should convert to JSON", () => {
    const error = new AppError(ErrorCode.VALIDATION_FAILED, "Test", {
      details: { field: "email" },
    });
    const json = error.toJSON();
    expect(json.name).toBe("AppError");
    expect(json.code).toBe(ErrorCode.VALIDATION_FAILED);
    expect(json.message).toBe("Test");
    expect(json.details).toEqual({ field: "email" });
  });
});

describe("ValidationError", () => {
  it("should create validation error with field", () => {
    const error = new ValidationError("Email is invalid", { field: "email" });
    expect(error.code).toBe(ErrorCode.VALIDATION_FAILED);
    expect(error.message).toBe("Email is invalid");
    expect(error.details?.field).toBe("email");
    expect(error.name).toBe("ValidationError");
  });
});

describe("NotFoundError", () => {
  it("should create not found error for candidate", () => {
    const error = new NotFoundError("candidate", "123");
    expect(error.code).toBe(ErrorCode.CANDIDATE_NOT_FOUND);
    expect(error.message).toBe("Candidate not found: 123");
    expect(error.name).toBe("NotFoundError");
  });

  it("should create not found error for job", () => {
    const error = new NotFoundError("job", "456");
    expect(error.code).toBe(ErrorCode.JOB_NOT_FOUND);
    expect(error.message).toBe("Job not found: 456");
  });

  it("should use default message when no identifier", () => {
    const error = new NotFoundError("interview");
    expect(error.code).toBe(ErrorCode.INTERVIEW_NOT_FOUND);
    expect(error.message).toBe(ErrorMessages[ErrorCode.INTERVIEW_NOT_FOUND]);
  });
});

describe("ApiError", () => {
  it("should create API error with status code", () => {
    const error = new ApiError("Request failed", 500, {
      responseBody: '{"error": "Internal error"}',
    });
    expect(error.code).toBe(ErrorCode.API_ERROR);
    expect(error.statusCode).toBe(500);
    expect(error.responseBody).toBe('{"error": "Internal error"}');
    expect(error.name).toBe("ApiError");
  });

  it("should use rate limit code for 429", () => {
    const error = new ApiError("Rate limited", 429);
    expect(error.code).toBe(ErrorCode.API_RATE_LIMITED);
    expect(error.statusCode).toBe(429);
  });
});

describe("RateLimitError", () => {
  it("should create rate limit error with retry time", () => {
    const error = new RateLimitError(5000);
    expect(error.code).toBe(ErrorCode.API_RATE_LIMITED);
    expect(error.retryAfterMs).toBe(5000);
    expect(error.message).toBe("Rate limited. Retry after 5000ms");
    expect(error.name).toBe("RateLimitError");
  });
});

describe("SafetyError", () => {
  it("should create safety error", () => {
    const error = new SafetyError(ErrorCode.HIRED_CANDIDATE_PROTECTED, "Cannot access hired candidate");
    expect(error.code).toBe(ErrorCode.HIRED_CANDIDATE_PROTECTED);
    expect(error.name).toBe("SafetyError");
  });
});

describe("isAppError", () => {
  it("should return true for AppError instances", () => {
    expect(isAppError(new AppError(ErrorCode.VALIDATION_FAILED))).toBe(true);
    expect(isAppError(new ValidationError("test"))).toBe(true);
    expect(isAppError(new NotFoundError("candidate"))).toBe(true);
    expect(isAppError(new ApiError("test", 500))).toBe(true);
  });

  it("should return false for non-AppError", () => {
    expect(isAppError(new Error("test"))).toBe(false);
    expect(isAppError("error")).toBe(false);
    expect(isAppError(null)).toBe(false);
    expect(isAppError(undefined)).toBe(false);
  });
});

describe("toAppError", () => {
  it("should return same error if already AppError", () => {
    const error = new AppError(ErrorCode.VALIDATION_FAILED);
    expect(toAppError(error)).toBe(error);
  });

  it("should wrap Error as AppError", () => {
    const original = new Error("Original message");
    const wrapped = toAppError(original);
    expect(wrapped).toBeInstanceOf(AppError);
    expect(wrapped.message).toBe("Original message");
    expect(wrapped.code).toBe(ErrorCode.UNEXPECTED_ERROR);
    expect(wrapped.cause).toBe(original);
  });

  it("should wrap string as AppError", () => {
    const wrapped = toAppError("String error");
    expect(wrapped).toBeInstanceOf(AppError);
    expect(wrapped.message).toBe("String error");
  });
});

describe("getErrorMessage", () => {
  it("should get message from AppError", () => {
    const error = new AppError(ErrorCode.VALIDATION_FAILED, "Custom message");
    expect(getErrorMessage(error)).toBe("Custom message");
  });

  it("should get message from Error", () => {
    const error = new Error("Standard error");
    expect(getErrorMessage(error)).toBe("Standard error");
  });

  it("should convert non-errors to string", () => {
    expect(getErrorMessage("string error")).toBe("string error");
    expect(getErrorMessage(123)).toBe("123");
  });
});
