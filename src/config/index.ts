import { z } from "zod";

/**
 * Safety mode determines how write operations are handled
 */
export const SafetyMode = {
  BATCH_LIMIT: "BATCH_LIMIT",
  CONFIRM_ALL: "CONFIRM_ALL",
} as const;

export type SafetyMode = (typeof SafetyMode)[keyof typeof SafetyMode];

/**
 * Configuration schema with validation
 */
const configSchema = z.object({
  // Slack configuration
  slack: z.object({
    botToken: z.string().min(1, "SLACK_BOT_TOKEN is required"),
    appToken: z.string().min(1, "SLACK_APP_TOKEN is required"),
    signingSecret: z.string().optional(),
  }),

  // Anthropic/Claude configuration
  anthropic: z.object({
    apiKey: z.string().min(1, "ANTHROPIC_API_KEY is required"),
    model: z.string().default("claude-sonnet-4-20250514"),
    maxTokens: z.number().default(4096),
  }),

  // Ashby configuration
  ashby: z.object({
    apiKey: z.string().min(1, "ASHBY_API_KEY is required"),
    baseUrl: z.string().default("https://api.ashbyhq.com"),
  }),

  // Safety configuration
  safety: z.object({
    mode: z.enum(["BATCH_LIMIT", "CONFIRM_ALL"]).default("CONFIRM_ALL"),
    batchLimit: z.number().min(1).max(10).default(2),
    confirmationTimeoutMs: z.number().default(1800000), // 30 minutes
  }),

  // Daily summary configuration
  dailySummary: z.object({
    enabled: z.boolean().default(true),
    time: z.string().default("09:00"), // 24hr format
    timezone: z.string().default("America/New_York"),
    channelId: z.string().optional(),
  }),

  // Pipeline alerts configuration
  pipelineAlerts: z
    .object({
      enabled: z.boolean().default(false),
      time: z.string().default("09:00"), // 24hr format
      timezone: z.string().default("America/New_York"),
      channelId: z.string().optional(),
      thresholds: z
        .object({
          stale: z.number().default(3), // Alert if >= N stale candidates
          needsDecision: z.number().default(2), // Alert if >= N need decisions
        })
        .optional(),
    })
    .optional(),

  // Proactive blocker alerts configuration
  blockerAlerts: z
    .object({
      enabled: z.boolean().default(false),
      cronExpression: z.string().default("0 */4 * * *"), // Every 4 hours
      channelId: z.string().optional(),
      minSeverity: z.enum(["info", "warning", "critical"]).default("warning"),
      notifyHiringManagers: z.boolean().default(false),
      cooldownHours: z.number().default(8),
    })
    .optional(),

  // Stale candidate threshold
  staleDays: z.number().default(14),
});

export type Config = z.infer<typeof configSchema>;

/**
 * Load and validate configuration from environment variables
 */
export function loadConfig(): Config {
  const rawConfig = {
    slack: {
      botToken: process.env["SLACK_BOT_TOKEN"] ?? "",
      appToken: process.env["SLACK_APP_TOKEN"] ?? "",
      signingSecret: process.env["SLACK_SIGNING_SECRET"],
    },
    anthropic: {
      apiKey: process.env["ANTHROPIC_API_KEY"] ?? "",
      model: process.env["ANTHROPIC_MODEL"] ?? "claude-sonnet-4-20250514",
      maxTokens: parseInt(process.env["ANTHROPIC_MAX_TOKENS"] ?? "4096", 10),
    },
    ashby: {
      apiKey: process.env["ASHBY_API_KEY"] ?? "",
      baseUrl: process.env["ASHBY_BASE_URL"] ?? "https://api.ashbyhq.com",
    },
    safety: {
      mode: (process.env["SAFETY_MODE"] as SafetyMode) ?? "CONFIRM_ALL",
      batchLimit: parseInt(process.env["BATCH_LIMIT"] ?? "2", 10),
      confirmationTimeoutMs: parseInt(
        process.env["CONFIRMATION_TIMEOUT_MS"] ?? "300000",
        10
      ),
    },
    dailySummary: {
      enabled: process.env["DAILY_SUMMARY_ENABLED"] !== "false",
      time: process.env["DAILY_SUMMARY_TIME"] ?? "09:00",
      timezone: process.env["DAILY_SUMMARY_TIMEZONE"] ?? "America/New_York",
      channelId: process.env["DAILY_SUMMARY_CHANNEL"],
    },
    pipelineAlerts: {
      enabled: process.env["PIPELINE_ALERTS_ENABLED"] === "true",
      time: process.env["PIPELINE_ALERTS_TIME"] ?? "09:00",
      timezone: process.env["PIPELINE_ALERTS_TIMEZONE"] ?? "America/New_York",
      channelId: process.env["PIPELINE_ALERTS_CHANNEL"],
      thresholds: {
        stale: parseInt(process.env["PIPELINE_ALERTS_STALE_THRESHOLD"] ?? "3", 10),
        needsDecision: parseInt(process.env["PIPELINE_ALERTS_DECISION_THRESHOLD"] ?? "2", 10),
      },
    },
    blockerAlerts: {
      enabled: process.env["BLOCKER_ALERTS_ENABLED"] === "true",
      cronExpression: process.env["BLOCKER_ALERTS_CRON"] ?? "0 */4 * * *",
      channelId: process.env["BLOCKER_ALERTS_CHANNEL"],
      minSeverity: (process.env["BLOCKER_ALERTS_MIN_SEVERITY"] as "info" | "warning" | "critical") ?? "warning",
      notifyHiringManagers: process.env["BLOCKER_ALERTS_NOTIFY_HM"] === "true",
      cooldownHours: parseInt(process.env["BLOCKER_ALERTS_COOLDOWN_HOURS"] ?? "8", 10),
    },
    staleDays: parseInt(process.env["STALE_DAYS"] ?? "14", 10),
  };

  const result = configSchema.safeParse(rawConfig);

  if (!result.success) {
    const errors = result.error.errors
      .map((e) => `  - ${e.path.join(".")}: ${e.message}`)
      .join("\n");
    throw new Error(`Configuration validation failed:\n${errors}`);
  }

  return result.data;
}
