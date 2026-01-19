/**
 * Slack Bot
 *
 * Handles Slack interactions using Socket Mode.
 */

import { App, LogLevel } from "@slack/bolt";
import type { Config } from "../config/index.js";
import type { ClaudeAgent, PendingWriteOperation } from "../ai/agent.js";
import type { ConfirmationManager } from "../safety/confirmations.js";
import type { MessageContext } from "../types/index.js";

export class SlackBot {
  private readonly app: App;
  private readonly agent: ClaudeAgent;
  private readonly confirmations: ConfirmationManager;

  constructor(
    config: Config,
    agent: ClaudeAgent,
    confirmations: ConfirmationManager
  ) {
    this.app = new App({
      token: config.slack.botToken,
      appToken: config.slack.appToken,
      socketMode: true,
      logLevel: LogLevel.INFO,
    });

    this.agent = agent;
    this.confirmations = confirmations;

    this.setupEventHandlers();
  }

  /**
   * Start the bot
   */
  async start(): Promise<void> {
    await this.app.start();
    console.log("⚡ Ashby Slack Bot is running!");
  }

  /**
   * Stop the bot
   */
  async stop(): Promise<void> {
    await this.app.stop();
    console.log("Ashby Slack Bot stopped.");
  }

  /**
   * Get the Slack client for external use (e.g., scheduled messages)
   */
  getClient(): App["client"] {
    return this.app.client;
  }

  /**
   * Setup all event handlers
   */
  private setupEventHandlers(): void {
    // Handle @mentions
    this.app.event("app_mention", async ({ event, say }) => {
      // Skip if we can't identify the user
      if (!event.user) return;

      const context: MessageContext = {
        channelId: event.channel,
        threadTs: event.thread_ts ?? event.ts,
        userId: event.user,
        text: this.cleanMentionText(event.text),
        messageTs: event.ts,
      };

      await this.handleMessage(context, say as (message: string | object) => Promise<unknown>);
    });

    // Handle reaction additions (for confirmations)
    this.app.event("reaction_added", async ({ event }) => {
      if (event.reaction !== "white_check_mark" && event.reaction !== "x") {
        return;
      }

      const confirmation = this.confirmations.findByMessageTs(
        event.item.channel,
        event.item.ts
      );

      if (!confirmation) return;

      // Verify the user who reacted is the one who requested the action
      if (event.user !== confirmation.userId) {
        return;
      }

      if (event.reaction === "white_check_mark") {
        await this.handleConfirmation(confirmation, true);
      } else if (event.reaction === "x") {
        await this.handleConfirmation(confirmation, false);
      }
    });

    // Handle direct messages (disabled for MVP per spec)
    this.app.event("message", async ({ event }) => {
      // Skip bot messages and messages in threads
      if ("bot_id" in event || "thread_ts" in event) return;

      // DMs are out of scope for MVP
      if (event.channel_type === "im") {
        await this.app.client.chat.postMessage({
          channel: event.channel,
          text: "I'm currently only available in channels. Please @mention me in a channel instead!",
        });
      }
    });

    // Error handling
    this.app.error(async (error) => {
      console.error("Slack app error:", error);
    });
  }

  /**
   * Handle an incoming message
   */
  private async handleMessage(
    context: MessageContext,
    say: (message: string | object) => Promise<unknown>
  ): Promise<void> {
    try {
      // Show typing indicator
      await this.app.client.reactions.add({
        channel: context.channelId,
        timestamp: context.messageTs,
        name: "eyes",
      });

      // Process with Claude
      const response = await this.agent.processMessage(context.text);

      // Remove typing indicator
      await this.app.client.reactions.remove({
        channel: context.channelId,
        timestamp: context.messageTs,
        name: "eyes",
      });

      // Send response in thread
      const message = await say({
        text: response.text,
        thread_ts: context.threadTs,
      });

      // If there are pending confirmations, set them up
      if (response.pendingConfirmations.length > 0) {
        const msgResponse = message as { ts?: string };
        if (msgResponse.ts) {
          this.setupPendingConfirmations(
            response.pendingConfirmations,
            context,
            msgResponse.ts
          );
        }
      }
    } catch (error) {
      console.error("Error handling message:", error);

      // Remove typing indicator on error
      try {
        await this.app.client.reactions.remove({
          channel: context.channelId,
          timestamp: context.messageTs,
          name: "eyes",
        });
      } catch {
        // Ignore reaction removal errors
      }

      await say({
        text: "Sorry, I encountered an error processing your request. Please try again.",
        thread_ts: context.threadTs,
      });
    }
  }

  /**
   * Setup pending confirmations from agent response
   */
  private setupPendingConfirmations(
    operations: PendingWriteOperation[],
    context: MessageContext,
    responseTs: string
  ): void {
    for (const op of operations) {
      this.confirmations.create({
        type: op.toolName === "add_note" ? "add_note" : "move_stage",
        description: `${op.toolName} for candidate ${op.candidateId}`,
        candidateIds: [op.candidateId],
        payload: op,
        channelId: context.channelId,
        messageTs: responseTs,
        userId: context.userId,
      });
    }

    // Add reaction prompt to the message
    this.app.client.reactions.add({
      channel: context.channelId,
      timestamp: responseTs,
      name: "white_check_mark",
    }).catch(console.error);

    this.app.client.reactions.add({
      channel: context.channelId,
      timestamp: responseTs,
      name: "x",
    }).catch(console.error);
  }

  /**
   * Handle a confirmation response
   */
  private async handleConfirmation(
    confirmation: ReturnType<ConfirmationManager["get"]>,
    approved: boolean
  ): Promise<void> {
    if (!confirmation) return;

    const operation = confirmation.payload as PendingWriteOperation;

    if (approved) {
      const result = await this.agent.executeConfirmed(operation);

      await this.app.client.chat.postMessage({
        channel: confirmation.channelId,
        thread_ts: confirmation.messageTs,
        text: result.success
          ? `✅ Done! ${result.message}`
          : `❌ Failed: ${result.message}`,
      });
    } else {
      await this.app.client.chat.postMessage({
        channel: confirmation.channelId,
        thread_ts: confirmation.messageTs,
        text: "❌ Action cancelled.",
      });
    }

    // Remove the confirmation
    this.confirmations.complete(confirmation.id);
  }

  /**
   * Clean the @mention text to extract the actual message
   */
  private cleanMentionText(text: string): string {
    // Remove the @mention at the start
    return text.replace(/<@[A-Z0-9]+>/g, "").trim();
  }
}
