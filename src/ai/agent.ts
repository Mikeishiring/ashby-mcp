/**
 * Claude Agent
 *
 * Manages conversations with Claude API including tool use.
 */

import Anthropic from "@anthropic-ai/sdk";
import type {
  MessageParam,
  ToolResultBlockParam,
  TextBlock,
  ToolUseBlock,
} from "@anthropic-ai/sdk/resources/messages.js";
import type { Config } from "../config/index.js";
import { ashbyTools, isWriteTool } from "./tools.js";
import { ToolExecutor } from "./executor.js";
import type { AshbyService } from "../ashby/service.js";
import type { SafetyGuards } from "../safety/guards.js";
import type { ApplicationWithContext } from "../types/index.js";

/**
 * Maximum characters for a tool result before truncation.
 * ~4 chars per token, targeting max 50k tokens per result = 200k chars
 * Being conservative with 100k to leave room for system prompt and conversation.
 */
const MAX_TOOL_RESULT_CHARS = 100000;

/**
 * Truncate a tool result if it's too large to prevent context overflow.
 */
function truncateToolResult(data: unknown): string {
  const json = JSON.stringify(data);
  if (json.length <= MAX_TOOL_RESULT_CHARS) {
    return json;
  }

  // For arrays, try to truncate by removing items
  if (Array.isArray(data)) {
    const truncatedData = {
      _truncated: true,
      _originalCount: data.length,
      _message: `Results truncated from ${data.length} items. Showing first items only.`,
      items: data.slice(0, Math.min(20, data.length)),
    };
    return JSON.stringify(truncatedData);
  }

  // For objects with array properties, truncate the arrays
  if (data && typeof data === "object") {
    const truncated: Record<string, unknown> = { _truncated: true };
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      if (Array.isArray(value) && value.length > 20) {
        truncated[key] = {
          _truncatedArray: true,
          _originalCount: value.length,
          items: value.slice(0, 20),
        };
      } else {
        truncated[key] = value;
      }
    }
    const truncatedJson = JSON.stringify(truncated);
    if (truncatedJson.length <= MAX_TOOL_RESULT_CHARS) {
      return truncatedJson;
    }
  }

  // Last resort: hard truncate
  return json.slice(0, MAX_TOOL_RESULT_CHARS) + '... [TRUNCATED - result too large]';
}

/**
 * Build the system prompt with dynamic configuration values
 */
function buildSystemPrompt(batchLimit: number): string {
  return `You're a recruiting teammate helping manage candidates in Ashby through Slack. You can look up anyone, check where they are in the pipeline, schedule interviews, handle offers, and keep things moving.

PERSONALITY:
- Talk like a helpful colleague, not a robot following scripts
- Be concise—recruiters are busy
- When you spot issues (stale candidates, missing feedback, nothing scheduled), mention them naturally and ask if they want to act
- Frame suggestions as questions: "Want me to...?" "Should we...?" "Shall I...?"
- Use *bold* for names and key info

WHEN SHOWING CANDIDATE INFO:
Include these elements in a clean format:
- Name, role, current stage
- Interview scores if available (use emoji shorthand like ⚡ for ratings)
- What's next (upcoming interview or "nothing scheduled")
- Recent activity
- Key observations

Example:
*Sarah Chen* | Senior Engineer | Stage: Technical Interview
⚡3.5 ✨3.2 🎯4.0

📅 Next: Panel interview tomorrow 2pm
🕐 Last: Phone screen completed Monday
📝 Strong technical background, interviewer noted great communication

Always include the candidate's email so there's no confusion about who you're discussing.

Adapt the format to what makes sense—if there are no scores yet, skip that line. If there's important context, include it. The goal is clarity, not rigid templates.

PROACTIVE ANALYSIS:
When checking on candidates, look for:
- No interview scheduled → offer to schedule
- Completed interviews without feedback → flag as blocker
- Been in stage 14+ days → might be stale
- In offer stage but no offer created → urgent
- Ready to advance → ask if they want to move them

SAFETY RULES:
- Batch operations limited to ${batchLimit} candidates at a time
- Hired candidates are private—you can't access their info
- All write operations (moving stages, scheduling, offers) need a ✅ confirmation
- Notes are auto-tagged [via Slack Bot]

DETAILED FEEDBACK:
When asked for full interview feedback, fetch the submissions and summarize each one with: interviewer name, date, overall rating/recommendation, and key points. Don't assume fields exist—say "not provided" if missing.

EMOJI-DRIVEN WORKFLOWS:
You can trigger interactive workflows where users respond with emoji reactions:
- *Quick Feedback*: After interviews, prompt for 👍 strong yes / 🤔 maybe / 👎 pass / ⏸️ need to think
- *Daily Digest*: Morning pipeline snapshot with ✅ show decisions / 📅 today's interviews / 🔔 remind feedback
- *Batch Decisions*: Review multiple candidates with 1️⃣-5️⃣ to select, then ✅ confirm
- *Offer Approval*: Route for ✅ approve / 💬 comment / ❌ reject
- *Interview Prep*: Pre-interview heads up with 👀 reviewed / ❓ more detail / 📝 show notes
- *Scheduling Confirm*: ✅ confirmed / 🔄 reschedule / 📋 send prep
- *Debrief Kickoff*: Collect 👍👎🤔 votes from all interviewers
- *Rejection Options*: 📧 standard email / ✍️ personalize / 🤫 no email / ⏸️ reconsider

When these workflows would help, set them up with appropriate reaction prompts.`;
}

// Export for testing purposes
export const DEFAULT_SYSTEM_PROMPT = buildSystemPrompt(2);

export class ClaudeAgent {
  private readonly client: Anthropic;
  private readonly model: string;
  private readonly maxTokens: number;
  private readonly executor: ToolExecutor;
  private readonly systemPrompt: string;

  constructor(
    config: Config,
    ashby: AshbyService,
    safety: SafetyGuards,
    executor?: ToolExecutor
  ) {
    this.client = new Anthropic({ apiKey: config.anthropic.apiKey });
    this.model = config.anthropic.model;
    this.maxTokens = config.anthropic.maxTokens;
    this.executor = executor ?? new ToolExecutor(ashby, safety);
    // Build system prompt with actual batch limit from config
    this.systemPrompt = buildSystemPrompt(config.safety.batchLimit);
  }

  /**
   * Process a user message and return a response
   */
  async processMessage(userMessage: string): Promise<AgentResponse> {
    const messages: MessageParam[] = [
      { role: "user", content: userMessage },
    ];

    return this.runConversation(messages);
  }

  /**
   * Run a conversation with tool use loop
   */
  private async runConversation(
    messages: MessageParam[]
  ): Promise<AgentResponse> {
    const pendingConfirmations: PendingWriteOperation[] = [];
    let triageData: TriageSessionData | null = null;

    // Tool use loop
    while (true) {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: this.maxTokens,
        system: this.systemPrompt,
        tools: ashbyTools,
        messages,
      });

      // Check if we're done (no tool use)
      if (response.stop_reason === "end_turn") {
        const textContent = response.content.find(
          (c): c is TextBlock => c.type === "text"
        );
        return {
          text: textContent?.text ?? "",
          pendingConfirmations,
          ...(triageData ? { triage: triageData } : {}),
        };
      }

      // Handle tool use
      if (response.stop_reason === "tool_use") {
        const toolResults: ToolResultBlockParam[] = [];

        for (const block of response.content) {
          if (block.type === "tool_use") {
            const toolUse = block as ToolUseBlock;
            const result = await this.executor.execute(
              toolUse.name,
              toolUse.input as Record<string, unknown>
            );

            if (toolUse.name === "start_triage" && result.success && result.data) {
              triageData = result.data as TriageSessionData;
            }

            if (result.requiresConfirmation && result.data) {
              // Store pending confirmation
              const data = result.data as {
                candidateId?: string;
                toolName: string;
                input: Record<string, unknown>;
              };
              if (data.candidateId) {
                pendingConfirmations.push({
                  toolName: data.toolName,
                  candidateId: data.candidateId,
                  input: data.input,
                });
              } else {
                pendingConfirmations.push({
                  toolName: data.toolName,
                  input: data.input,
                });
              }

              // Tell Claude confirmation is needed
              toolResults.push({
                type: "tool_result",
                tool_use_id: toolUse.id,
                content: JSON.stringify({
                  status: "confirmation_required",
                  message: `This ${isWriteTool(toolUse.name) ? "write" : ""} operation requires user confirmation. Please describe the action and ask the user to confirm with ✅ or cancel with ❌.`,
                  ...(data.candidateId ? { candidateId: data.candidateId } : {}),
                }),
              });
            } else if (result.success) {
              toolResults.push({
                type: "tool_result",
                tool_use_id: toolUse.id,
                content: truncateToolResult(result.data),
              });
            } else {
              toolResults.push({
                type: "tool_result",
                tool_use_id: toolUse.id,
                content: JSON.stringify({ error: result.error }),
                is_error: true,
              });
            }
          }
        }

        // Add assistant response and tool results to conversation
        messages.push({ role: "assistant", content: response.content });
        messages.push({ role: "user", content: toolResults });
      } else {
        // Unexpected stop reason
        const textContent = response.content.find(
          (c): c is TextBlock => c.type === "text"
        );
        return {
          text: textContent?.text ?? "I encountered an unexpected situation. Please try again.",
          pendingConfirmations,
          ...(triageData ? { triage: triageData } : {}),
        };
      }
    }
  }

  /**
   * Execute a confirmed write operation
   */
  async executeConfirmed(
    operation: PendingWriteOperation
  ): Promise<{ success: boolean; message: string }> {
    const result = await this.executor.executeConfirmed(
      operation.toolName,
      operation.input,
      operation.candidateId
    );

    if (result.success) {
      const data = result.data as { message?: string };
      return {
        success: true,
        message: data?.message ?? "Operation completed successfully.",
      };
    }

    return {
      success: false,
      message: result.error ?? "Operation failed.",
    };
  }
}

export interface AgentResponse {
  text: string;
  pendingConfirmations: PendingWriteOperation[];
  triage?: TriageSessionData;
}

export interface PendingWriteOperation {
  toolName: string;
  candidateId?: string;
  input: Record<string, unknown>;
}

export interface TriageSessionData {
  candidates: ApplicationWithContext[];
  message: string;
  triageMode?: boolean;
}
