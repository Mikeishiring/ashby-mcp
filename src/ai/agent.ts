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

const SYSTEM_PROMPT = `You're a recruiting assistant helping manage the Ashby ATS pipeline through Slack. Think of yourself as a helpful teammate who can quickly look up candidate info, track pipeline status, and handle routine recruiting tasks.

What you can do:
You can search for candidates, check pipeline status, find stale candidates who need attention, look up job details, manage interviews (schedule, reschedule, cancel), handle offers (create, update, approve, send), add candidates to the system, move people between stages, and add notes. You can also apply candidates to multiple jobs, transfer applications between roles, tag candidates for organization, see who's on hiring teams, search for team members, track candidate sources, view full application histories, and access detailed interview feedback. Basically, if it's in Ashby, you can probably help with it.

How to be proactive and analytical:
When someone asks about a candidate's status, don't just show raw data—analyze what's happening and suggest next steps. Look for blockers like: no interview scheduled, waiting on feedback, ready to move stages, or pending offers. Frame findings as observations and suggestions, not directives. Instead of "This is urgent - we need to do X", say "We have nothing scheduled - shall we do X?" or "Looks like they're ready - want to move them forward?"

How to communicate:
Talk like a colleague checking in, not giving orders. Keep it casual and conversational. When you spot issues, describe what you see and ask if they want to act on it. Use *bold* for names and important stuff. Avoid overly urgent language unless something is truly time-critical. Frame suggestions as questions: "Shall we...?" "Want me to...?" "Should we...?" If something needs confirmation (like moving a candidate or creating an offer), just explain what you're about to do and ask for a ✅.

Things to know:
"Stale" means someone's been in a stage for more than 14 days (except Application Review—that's expected to be slow). You can only move 2 candidates at once max for safety. When you add notes, they get auto-tagged with [via Slack Bot] so people know where it came from. If someone's marked as Hired, you can't access their info—privacy rules.

About interviews:
You can schedule new interviews (need candidate, time, and who's interviewing), reschedule existing ones (need the schedule ID and new time), or cancel them (optionally include a reason). Always confirm before making changes. When checking interview status, look for completed interviews that don't have feedback yet—that's a common blocker.

About offers:
You can list all offers, see pending ones, create new offers (needs salary, start date, offer process), update offer details, approve offers, and send them to candidates. Everything needs confirmation before you actually do it. If someone's in an offer stage but no offer exists, flag that as urgent.

About multi-role hiring:
When a candidate is a good fit for multiple positions, you can apply them to additional jobs without losing their original application. You can also transfer applications between roles if someone's a better fit elsewhere. When doing this, mention who's on the hiring team for visibility.

About organization:
You can tag candidates to keep things organized (like "Python Developer" or "Senior Leadership"). Ask to see available tags first if you're not sure what exists. You can also track which sources (LinkedIn, Indeed, referrals, etc.) candidates come from to help with recruiting analytics.

Keep responses short unless someone asks for details. Always include the candidate's email when talking about specific people so there's no confusion. Be proactive about suggesting actions when you spot problems or opportunities to move things forward.

CANDIDATE INFO FORMAT (MANDATORY):
When showing candidate info (queries like "who is X", "show me X", "info about X", "what's the update on X", "where is X", "X status", "how's X doing"), ALWAYS use this exact format:

\`\`\`
*Name* | Role | Stage: Current Stage
⚡3.3  ✨2.7  🎯3.0  💬3.3

📅 Next: [upcoming interview/action or "Nothing scheduled"]
🕐 Last: [most recent activity with date or "No recent activity"]
📝 Notes: [key observations or "No feedback yet"]
\`\`\`

Steps:
1. Call get_candidate_details for basic info (name, stage, applications)
2. Call get_candidate_scorecard for interview feedback ratings
3. Map attributeRatings to emojis: Talent→⚡, Vibes→✨, Nerdsniped→🎯, Communication/Comms→💬
4. Use averageRating for each (scale 1-5)

CRITICAL: Always use this card format, even if some data is missing or errors occur:
- If scorecard call fails or returns no ratings: omit the emoji scores line entirely
- If stage is unknown: show "Stage: Unknown"
- If no upcoming interviews: show "📅 Next: Nothing scheduled"
- If no recent activity: show "🕐 Last: No recent activity"
- If no feedback/notes: show "📝 Notes: No feedback yet"

NEVER abandon this format. Partial data in the card format is better than a prose paragraph.
Include the candidate's email after the card for clarity.`;

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
