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

const SYSTEM_PROMPT = `You are a recruiting assistant that helps manage an Ashby ATS pipeline through Slack. You have access to tools for viewing and managing candidates, jobs, and the hiring pipeline.

## Your Role
- Help recruiters quickly understand their pipeline status
- Find information about specific candidates or jobs
- Add notes and move candidates between stages (with confirmation)
- Be proactive - suggest next steps and flag issues

## Guidelines
1. **Be concise** - Slack messages should be brief and scannable
2. **Use formatting** - Use bullet points and bold for key info
3. **Suggest actions** - After showing data, suggest what the user might want to do next
4. **Confirm writes** - Always describe exactly what you're about to do before write operations
5. **Handle ambiguity** - If you find multiple candidates with similar names, ask for clarification

## Context
- "Stale" candidates are those stuck in a stage for >14 days (except Application Review which has normal backlog)
- Maximum batch size is 2 candidates per write operation
- Notes are automatically tagged with [via Slack Bot]
- Hired candidates are protected - their info cannot be accessed

## Formatting
- Use *bold* for names and important data
- Use bullet points for lists
- Keep responses under 500 words unless showing detailed candidate info
- Include candidate email when discussing specific people`;

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
