/**
 * Error Taxonomy
 *
 * Defines structured error codes and custom error classes for the application.
 */

/**
 * Error codes organized by category
 */
export const ErrorCode = {
  // Validation errors (1xxx)
  VALIDATION_FAILED: "E1001",
  MISSING_REQUIRED_FIELD: "E1002",
  INVALID_INPUT_FORMAT: "E1003",
  INVALID_DATE_FORMAT: "E1004",
  INVALID_EMAIL_FORMAT: "E1005",

  // Authentication/Authorization errors (2xxx)
  UNAUTHORIZED: "E2001",
  FORBIDDEN: "E2002",
  API_KEY_INVALID: "E2003",
  API_KEY_EXPIRED: "E2004",

  // Resource errors (3xxx)
  CANDIDATE_NOT_FOUND: "E3001",
  APPLICATION_NOT_FOUND: "E3002",
  JOB_NOT_FOUND: "E3003",
  INTERVIEW_NOT_FOUND: "E3004",
  OFFER_NOT_FOUND: "E3005",
  USER_NOT_FOUND: "E3006",
  STAGE_NOT_FOUND: "E3007",
  FEEDBACK_NOT_FOUND: "E3008",
  MULTIPLE_CANDIDATES_FOUND: "E3009",
  NO_ACTIVE_APPLICATION: "E3010",
  MULTIPLE_ACTIVE_APPLICATIONS: "E3011",

  // API errors (4xxx)
  API_ERROR: "E4001",
  API_RATE_LIMITED: "E4002",
  API_TIMEOUT: "E4003",
  API_UNAVAILABLE: "E4004",
  API_RESPONSE_INVALID: "E4005",

  // Safety errors (5xxx)
  OPERATION_NOT_ALLOWED: "E5001",
  HIRED_CANDIDATE_PROTECTED: "E5002",
  BATCH_LIMIT_EXCEEDED: "E5003",
  CONFIRMATION_REQUIRED: "E5004",
  CONFIRMATION_EXPIRED: "E5005",

  // Tool errors (6xxx)
  UNKNOWN_TOOL: "E6001",
  TOOL_EXECUTION_FAILED: "E6002",
  TOOL_INPUT_INVALID: "E6003",

  // Internal errors (9xxx)
  INTERNAL_ERROR: "E9001",
  CONFIGURATION_ERROR: "E9002",
  UNEXPECTED_ERROR: "E9999",
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/**
 * Human-readable error messages for each code
 */
export const ErrorMessages: Record<ErrorCode, string> = {
  [ErrorCode.VALIDATION_FAILED]: "Validation failed",
  [ErrorCode.MISSING_REQUIRED_FIELD]: "Missing required field",
  [ErrorCode.INVALID_INPUT_FORMAT]: "Invalid input format",
  [ErrorCode.INVALID_DATE_FORMAT]: "Invalid date format",
  [ErrorCode.INVALID_EMAIL_FORMAT]: "Invalid email format",

  [ErrorCode.UNAUTHORIZED]: "Unauthorized",
  [ErrorCode.FORBIDDEN]: "Access forbidden",
  [ErrorCode.API_KEY_INVALID]: "API key is invalid",
  [ErrorCode.API_KEY_EXPIRED]: "API key has expired",

  [ErrorCode.CANDIDATE_NOT_FOUND]: "Candidate not found",
  [ErrorCode.APPLICATION_NOT_FOUND]: "Application not found",
  [ErrorCode.JOB_NOT_FOUND]: "Job not found",
  [ErrorCode.INTERVIEW_NOT_FOUND]: "Interview not found",
  [ErrorCode.OFFER_NOT_FOUND]: "Offer not found",
  [ErrorCode.USER_NOT_FOUND]: "User not found",
  [ErrorCode.STAGE_NOT_FOUND]: "Interview stage not found",
  [ErrorCode.FEEDBACK_NOT_FOUND]: "Feedback not found",
  [ErrorCode.MULTIPLE_CANDIDATES_FOUND]: "Multiple candidates found - please be more specific",
  [ErrorCode.NO_ACTIVE_APPLICATION]: "No active application found for this candidate",
  [ErrorCode.MULTIPLE_ACTIVE_APPLICATIONS]: "Multiple active applications found - please specify application_id",

  [ErrorCode.API_ERROR]: "API request failed",
  [ErrorCode.API_RATE_LIMITED]: "API rate limit exceeded",
  [ErrorCode.API_TIMEOUT]: "API request timed out",
  [ErrorCode.API_UNAVAILABLE]: "API is unavailable",
  [ErrorCode.API_RESPONSE_INVALID]: "API response was invalid",

  [ErrorCode.OPERATION_NOT_ALLOWED]: "Operation not allowed",
  [ErrorCode.HIRED_CANDIDATE_PROTECTED]: "Cannot access hired candidate information",
  [ErrorCode.BATCH_LIMIT_EXCEEDED]: "Batch limit exceeded",
  [ErrorCode.CONFIRMATION_REQUIRED]: "This operation requires confirmation",
  [ErrorCode.CONFIRMATION_EXPIRED]: "Confirmation has expired",

  [ErrorCode.UNKNOWN_TOOL]: "Unknown tool",
  [ErrorCode.TOOL_EXECUTION_FAILED]: "Tool execution failed",
  [ErrorCode.TOOL_INPUT_INVALID]: "Tool input is invalid",

  [ErrorCode.INTERNAL_ERROR]: "Internal error",
  [ErrorCode.CONFIGURATION_ERROR]: "Configuration error",
  [ErrorCode.UNEXPECTED_ERROR]: "An unexpected error occurred",
};

/**
 * Base application error with code support
 */
export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly details: Record<string, unknown> | undefined;
  public override readonly cause: Error | undefined;

  constructor(
    code: ErrorCode,
    message?: string,
    options?: {
      details?: Record<string, unknown>;
      cause?: Error;
    }
  ) {
    super(message ?? ErrorMessages[code]);
    this.name = "AppError";
    this.code = code;
    this.details = options?.details;
    this.cause = options?.cause;

    // Maintains proper stack trace for where our error was thrown
    Error.captureStackTrace?.(this, AppError);
  }

  /**
   * Create a user-friendly error message
   */
  toUserMessage(): string {
    return this.message;
  }

  /**
   * Create a JSON representation for logging
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      details: this.details,
      stack: this.stack,
    };
  }
}

/**
 * Validation error
 */
export class ValidationError extends AppError {
  constructor(
    message: string,
    options?: {
      field?: string;
      details?: Record<string, unknown>;
      cause?: Error;
    }
  ) {
    const details = { field: options?.field, ...options?.details };
    super(ErrorCode.VALIDATION_FAILED, message, {
      details,
      ...(options?.cause ? { cause: options.cause } : {}),
    });
    this.name = "ValidationError";
  }
}

/**
 * Resource not found error
 */
export class NotFoundError extends AppError {
  constructor(
    resourceType: "candidate" | "application" | "job" | "interview" | "offer" | "user" | "stage" | "feedback",
    identifier?: string,
    options?: {
      details?: Record<string, unknown>;
      cause?: Error;
    }
  ) {
    const codeMap: Record<string, ErrorCode> = {
      candidate: ErrorCode.CANDIDATE_NOT_FOUND,
      application: ErrorCode.APPLICATION_NOT_FOUND,
      job: ErrorCode.JOB_NOT_FOUND,
      interview: ErrorCode.INTERVIEW_NOT_FOUND,
      offer: ErrorCode.OFFER_NOT_FOUND,
      user: ErrorCode.USER_NOT_FOUND,
      stage: ErrorCode.STAGE_NOT_FOUND,
      feedback: ErrorCode.FEEDBACK_NOT_FOUND,
    };

    const code = codeMap[resourceType] ?? ErrorCode.API_ERROR;
    const message = identifier
      ? `${resourceType.charAt(0).toUpperCase() + resourceType.slice(1)} not found: ${identifier}`
      : ErrorMessages[code];

    const details = { resourceType, identifier, ...options?.details };
    super(code, message, {
      details,
      ...(options?.cause ? { cause: options.cause } : {}),
    });
    this.name = "NotFoundError";
  }
}

/**
 * API error with HTTP status
 */
export class ApiError extends AppError {
  public readonly statusCode: number;
  public readonly responseBody: string | undefined;

  constructor(
    message: string,
    statusCode: number,
    options?: {
      responseBody?: string;
      details?: Record<string, unknown>;
      cause?: Error;
    }
  ) {
    const code = statusCode === 429 ? ErrorCode.API_RATE_LIMITED : ErrorCode.API_ERROR;
    const details = { statusCode, ...options?.details };

    super(code, message, {
      details,
      ...(options?.cause ? { cause: options.cause } : {}),
    });

    this.name = "ApiError";
    this.statusCode = statusCode;
    this.responseBody = options?.responseBody;
  }
}

/**
 * Rate limit error with retry information
 */
export class RateLimitError extends AppError {
  public readonly retryAfterMs: number;

  constructor(
    retryAfterMs: number,
    options?: {
      details?: Record<string, unknown>;
      cause?: Error;
    }
  ) {
    const details = { retryAfterMs, ...options?.details };
    super(ErrorCode.API_RATE_LIMITED, `Rate limited. Retry after ${retryAfterMs}ms`, {
      details,
      ...(options?.cause ? { cause: options.cause } : {}),
    });

    this.name = "RateLimitError";
    this.retryAfterMs = retryAfterMs;
  }
}

/**
 * Safety/permission error
 */
export class SafetyError extends AppError {
  constructor(
    code: ErrorCode,
    message?: string,
    options?: {
      details?: Record<string, unknown>;
      cause?: Error;
    }
  ) {
    super(code, message, options);
    this.name = "SafetyError";
  }
}

/**
 * Check if an error is an AppError
 */
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/**
 * Convert any error to an AppError
 */
export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }

  if (error instanceof Error) {
    return new AppError(ErrorCode.UNEXPECTED_ERROR, error.message, {
      cause: error,
    });
  }

  return new AppError(ErrorCode.UNEXPECTED_ERROR, String(error));
}

/**
 * Extract user-friendly message from any error
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof AppError) {
    return error.toUserMessage();
  }

  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

/**
 * Error categories for user-facing messages
 */
export type ErrorCategory =
  | "api_connection"
  | "not_found"
  | "validation"
  | "permission"
  | "rate_limit"
  | "timeout"
  | "unknown";

/**
 * Categorize an error for user-friendly messaging
 */
export function categorizeError(error: unknown): ErrorCategory {
  if (error instanceof RateLimitError) {
    return "rate_limit";
  }

  if (error instanceof NotFoundError) {
    return "not_found";
  }

  if (error instanceof ValidationError) {
    return "validation";
  }

  if (error instanceof SafetyError) {
    return "permission";
  }

  if (error instanceof ApiError) {
    if (error.statusCode === 429) return "rate_limit";
    if (error.statusCode === 408 || error.message.toLowerCase().includes("timeout")) return "timeout";
    return "api_connection";
  }

  if (error instanceof AppError) {
    const code = error.code;
    if (code.startsWith("E3")) return "not_found";
    if (code.startsWith("E1")) return "validation";
    if (code.startsWith("E5")) return "permission";
    if (code.startsWith("E4")) return "api_connection";
  }

  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("timeout") || msg.includes("timed out")) return "timeout";
    if (msg.includes("rate limit") || msg.includes("too many")) return "rate_limit";
    if (msg.includes("not found")) return "not_found";
    if (msg.includes("permission") || msg.includes("forbidden") || msg.includes("unauthorized")) return "permission";
    if (msg.includes("connect") || msg.includes("network") || msg.includes("fetch")) return "api_connection";
  }

  return "unknown";
}

/**
 * Get a user-friendly Slack message for an error
 */
export function getSlackErrorMessage(error: unknown): string {
  const category = categorizeError(error);
  const detail = error instanceof Error ? error.message : String(error);

  switch (category) {
    case "api_connection":
      return "I'm having trouble connecting to Ashby right now. This might be a temporary issue—try again in a moment.";

    case "not_found":
      // Include helpful context but sanitize sensitive info
      if (detail.includes("Candidate")) {
        return "I couldn't find that candidate. Double-check the name or email, or they might have been archived.";
      }
      if (detail.includes("Job") || detail.includes("job")) {
        return "I couldn't find that job. It might be closed or the title might be different than expected.";
      }
      if (detail.includes("Application") || detail.includes("application")) {
        return "I couldn't find an active application for that candidate. They might not have applied yet or the application was archived.";
      }
      return "I couldn't find what you're looking for. Can you double-check the details?";

    case "validation":
      return `Something's not quite right with that request: ${detail}`;

    case "permission":
      if (detail.toLowerCase().includes("hired")) {
        return "That candidate has been hired, so their information is now private.";
      }
      return "I don't have permission to do that. This might be a safety restriction or a permissions issue in Ashby.";

    case "rate_limit":
      return "I'm getting rate limited by Ashby—too many requests too fast. Give it a minute and try again.";

    case "timeout":
      return "That request took too long and timed out. Ashby might be running slow—try again in a moment.";

    default:
      return "Something went wrong processing your request. Try again, and if it keeps happening, the issue might need investigation.";
  }
}
