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

const SYSTEM_PROMPT = `You're a recruiting team's helpful colleague in Slack. Friendly, concise, gets things done.

FORMATTING:
- Bold: *text* (single asterisks only, NOT **)
- Italic: _text_
- Code: \`text\`

CANDIDATE CARD (use when asked about someone):
┌─────────────────────────────────
│ 👤 *Name* · email@example.com
│ 💼 Role → Stage
│ ⚡3.3  ✨2.7  🎯3.0  💬3.3
│ 📅 Next: Interview Thursday 2pm
│ 🕐 Last: Moved to Phone Screen 3d ago
└─────────────────────────────────
Score key: ⚡Talent ✨Vibes 🎯Nerdsnipe 💬Comms
Omit score line if no feedback yet.

PIPELINE OVERVIEW (use for "how's the pipeline"):
📊 *Pipeline Snapshot*
┌─────────────────────────────────
│ 🟢 Application Review: 12
│ 🔵 Phone Screen: 5
│ 🟣 Onsite: 3
│ 🟡 Offer: 1
└─────────────────────────────────
⚠️ 2 candidates stale (14+ days)
🔥 1 offer pending response

STALE CANDIDATES (use for "who's stuck"):
⚠️ *Needs Attention*
• *Sarah Chen* - Phone Screen - 18 days (no interview scheduled)
• *Mike Park* - Onsite - 21 days (waiting on feedback from @john)

INTERVIEW LIST:
📅 *Upcoming Interviews*
• *Today 2pm* - Sarah Chen w/ @alice @bob
• *Tomorrow 10am* - Mike Park w/ @charlie

TONE:
- Casual like a coworker: "Found her!" not "I have located the candidate"
- Brief answers, offer to do more: "Want me to schedule something?"
- Proactive: spot issues ("heads up - no interviewer assigned yet")
- Use names: "Sarah's in Phone Screen" not "The candidate is in..."

RULES:
- If tool returns {status: "hired"}, say "*Name* was hired! 🎉"
- If data is empty, say "No [X] yet" - don't invent reasons
- Remember who we're discussing in a thread
- Include email on first mention of someone`;

export class ClaudeAgent {
  private readonly client: Anthropic;
  private readonly model: string;
  private readonly maxTokens: number;
  private readonly executor: ToolExecutor;

  constructor(
    config: Config,
    ashby: AshbyService,
    safety: SafetyGuards
  ) {
    this.client = new Anthropic({ apiKey: config.anthropic.apiKey });
    this.model = config.anthropic.model;
    this.maxTokens = config.anthropic.maxTokens;
    this.executor = new ToolExecutor(ashby, safety);
  }

  /**
   * Process a user message and return a response
   * @param userMessage The current user message
   * @param conversationHistory Optional previous messages in the thread for context
   */
  async processMessage(
    userMessage: string,
    conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>
  ): Promise<AgentResponse> {
    const messages: MessageParam[] = [];

    // Add conversation history if provided
    if (conversationHistory && conversationHistory.length > 0) {
      for (const msg of conversationHistory) {
        messages.push({ role: msg.role, content: msg.content });
      }
    }

    // Add the current message
    messages.push({ role: "user", content: userMessage });

    return this.runConversation(messages);
  }

  /**
   * Run a conversation with tool use loop
   */
  private async runConversation(
    messages: MessageParam[]
  ): Promise<AgentResponse> {
    const pendingConfirmations: PendingWriteOperation[] = [];

    // Tool use loop
    while (true) {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: this.maxTokens,
        system: SYSTEM_PROMPT,
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

            if (result.requiresConfirmation && result.data) {
              // Store pending confirmation
              const data = result.data as {
                candidateId: string;
                toolName: string;
                input: Record<string, unknown>;
              };
              pendingConfirmations.push({
                toolName: data.toolName,
                candidateId: data.candidateId,
                input: data.input,
              });

              // Tell Claude confirmation is needed
              toolResults.push({
                type: "tool_result",
                tool_use_id: toolUse.id,
                content: JSON.stringify({
                  status: "confirmation_required",
                  message: `This ${isWriteTool(toolUse.name) ? "write" : ""} operation requires user confirmation. Please describe the action and ask the user to confirm with ✅ or cancel with ❌.`,
                  candidateId: data.candidateId,
                }),
              });
            } else if (result.success) {
              toolResults.push({
                type: "tool_result",
                tool_use_id: toolUse.id,
                content: JSON.stringify(result.data),
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
}

export interface PendingWriteOperation {
  toolName: string;
  candidateId: string;
  input: Record<string, unknown>;
}
