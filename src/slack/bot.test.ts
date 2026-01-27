/**
 * Slack Bot Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Config } from "../config/index.js";
import type { ClaudeAgent, AgentResponse } from "../ai/agent.js";
import type { ConfirmationManager } from "../safety/confirmations.js";
import type { ReminderManager } from "../reminders/index.js";
import type { TriageSessionManager } from "../triage/index.js";
import type { ApplicationWithContext, TriageSession } from "../types/index.js";

// Mock setup - all mocks must be declared before vi.mock
const mockAppStart = vi.fn();
const mockAppStop = vi.fn();
const mockAppClient = {
  chat: {
    postMessage: vi.fn(),
  },
  reactions: {
    add: vi.fn(),
    remove: vi.fn(),
  },
};
const mockAppEvent = vi.fn();
const mockAppError = vi.fn();

// Mock Slack Bolt
vi.mock("@slack/bolt", () => ({
  App: class MockApp {
    start = mockAppStart;
    stop = mockAppStop;
    client = mockAppClient;
    event = mockAppEvent;
    error = mockAppError;
    constructor() {}
  },
  LogLevel: {
    INFO: "info",
  },
}));

// Import after mock
import { SlackBot } from "./bot.js";

const createMockApplicationWithContext = (overrides: Partial<ApplicationWithContext> = {}): ApplicationWithContext => ({
  id: "app-1",
  candidateId: "c-1",
  jobId: "j-1",
  status: "Active",
  currentInterviewStageId: "stage-1",
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
  job: { id: "j-1", title: "Software Engineer", status: "Open", hiringTeam: [], employmentType: "FullTime", jobPostings: [], createdAt: "2024-01-01T00:00:00Z", updatedAt: "2024-01-01T00:00:00Z" },
  candidate: { id: "c-1", name: "John Doe" } as any,
  currentInterviewStage: { id: "stage-1", title: "Phone Screen", interviewStageType: "Interview", orderInInterviewPlan: 1 },
  daysInCurrentStage: 3,
  isStale: false,
  ...overrides,
});

const createMockTriageSession = (overrides: Partial<TriageSession> = {}): TriageSession => ({
  id: `triage-U123-${Date.now()}`,
  userId: "U123",
  channelId: "C123",
  messageTs: "123.456",
  candidates: [],
  decisions: [],
  currentIndex: 0,
  createdAt: new Date(),
  expiresAt: new Date(),
  ...overrides,
});

const createMockConfig = (): Config =>
  ({
    slack: {
      botToken: "xoxb-test-token",
      appToken: "xapp-test-token",
    },
  }) as Config;

const createMockAgent = (): Partial<ClaudeAgent> => ({
  processMessage: vi.fn(),
  executeConfirmed: vi.fn(),
});

const createMockConfirmations = (): Partial<ConfirmationManager> => ({
  create: vi.fn(),
  findByMessageTs: vi.fn(),
  get: vi.fn(),
  complete: vi.fn(),
});

const createMockReminders = (): Partial<ReminderManager> => ({
  scheduleReminder: vi.fn(),
});

const createMockTriageSessions = (): Partial<TriageSessionManager> => ({
  create: vi.fn(),
  findByMessage: vi.fn(),
  get: vi.fn(),
  recordDecision: vi.fn(),
  getProgress: vi.fn(),
  formatCandidateCard: vi.fn(),
  formatSummary: vi.fn(),
  endSession: vi.fn(),
  updateMessageTs: vi.fn(),
});

describe("SlackBot", () => {
  let bot: SlackBot;
  let mockConfig: Config;
  let mockAgent: Partial<ClaudeAgent>;
  let mockConfirmations: Partial<ConfirmationManager>;
  let mockReminders: Partial<ReminderManager>;
  let mockTriageSessions: Partial<TriageSessionManager>;
  let consoleSpy: { log: ReturnType<typeof vi.spyOn>; warn: ReturnType<typeof vi.spyOn>; error: ReturnType<typeof vi.spyOn> };

  // Store event handlers
  let eventHandlers: Record<string, (args: any) => Promise<void>>;
  let errorHandler: (error: Error) => Promise<void>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockConfig = createMockConfig();
    mockAgent = createMockAgent();
    mockConfirmations = createMockConfirmations();
    mockReminders = createMockReminders();
    mockTriageSessions = createMockTriageSessions();
    consoleSpy = {
      log: vi.spyOn(console, "log").mockImplementation(() => {}),
      warn: vi.spyOn(console, "warn").mockImplementation(() => {}),
      error: vi.spyOn(console, "error").mockImplementation(() => {}),
    };

    // Capture event handlers
    eventHandlers = {};
    mockAppEvent.mockImplementation((eventName: string, handler: (args: any) => Promise<void>) => {
      eventHandlers[eventName] = handler;
    });
    mockAppError.mockImplementation((handler: (error: Error) => Promise<void>) => {
      errorHandler = handler;
    });

    bot = new SlackBot(
      mockConfig,
      mockAgent as ClaudeAgent,
      mockConfirmations as ConfirmationManager,
      mockReminders as ReminderManager,
      mockTriageSessions as TriageSessionManager
    );
  });

  afterEach(() => {
    consoleSpy.log.mockRestore();
    consoleSpy.warn.mockRestore();
    consoleSpy.error.mockRestore();
  });

  describe("constructor", () => {
    it("should create bot and setup event handlers", () => {
      expect(bot).toBeDefined();
      expect(mockAppEvent).toHaveBeenCalledWith("app_mention", expect.any(Function));
      expect(mockAppEvent).toHaveBeenCalledWith("reaction_added", expect.any(Function));
      expect(mockAppEvent).toHaveBeenCalledWith("message", expect.any(Function));
      expect(mockAppError).toHaveBeenCalledWith(expect.any(Function));
    });

    it("should work without reminders", () => {
      const botWithoutReminders = new SlackBot(
        mockConfig,
        mockAgent as ClaudeAgent,
        mockConfirmations as ConfirmationManager,
        undefined,
        mockTriageSessions as TriageSessionManager
      );
      expect(botWithoutReminders).toBeDefined();
    });
  });

  describe("start", () => {
    it("should start the app", async () => {
      await bot.start();

      expect(mockAppStart).toHaveBeenCalled();
      expect(consoleSpy.log).toHaveBeenCalledWith("⚡ Ashby Slack Bot is running!");
    });
  });

  describe("stop", () => {
    it("should stop the app", async () => {
      await bot.stop();

      expect(mockAppStop).toHaveBeenCalled();
      expect(consoleSpy.log).toHaveBeenCalledWith("Ashby Slack Bot stopped.");
    });
  });

  describe("getClient", () => {
    it("should return the Slack client", () => {
      const client = bot.getClient();
      expect(client).toBe(mockAppClient);
    });
  });

  describe("app_mention event", () => {
    it("should skip if no user", async () => {
      const handler = eventHandlers["app_mention"]!;

      await handler({
        event: { text: "<@BOT123> hello", channel: "C123", ts: "123.456" },
        say: vi.fn(),
      });

      expect(mockAgent.processMessage).not.toHaveBeenCalled();
    });

    it("should respond with help if empty mention", async () => {
      const handler = eventHandlers["app_mention"]!;
      const mockSay = vi.fn();

      await handler({
        event: {
          user: "U123",
          text: "<@BOT123>",
          channel: "C123",
          ts: "123.456",
        },
        say: mockSay,
      });

      expect(mockSay).toHaveBeenCalledWith({
        text: expect.stringContaining("How can I help you"),
        thread_ts: "123.456",
      });
    });

    it("should process message and send response", async () => {
      const handler = eventHandlers["app_mention"]!;
      const mockSay = vi.fn().mockResolvedValue({ ts: "response.123" });

      vi.mocked(mockAgent.processMessage!).mockResolvedValue({
        text: "Here are the jobs!",
        pendingConfirmations: [],
      });

      await handler({
        event: {
          user: "U123",
          text: "<@BOT123> show me open jobs",
          channel: "C123",
          ts: "123.456",
        },
        say: mockSay,
      });

      expect(mockAgent.processMessage).toHaveBeenCalledWith("show me open jobs", {
        userId: "U123",
        channelId: "C123",
      });
      expect(mockSay).toHaveBeenCalledWith({
        text: "Here are the jobs!",
        thread_ts: "123.456",
      });
    });

    it("should add and remove eyes reaction as typing indicator", async () => {
      const handler = eventHandlers["app_mention"]!;
      const mockSay = vi.fn().mockResolvedValue({ ts: "response.123" });

      vi.mocked(mockAgent.processMessage!).mockResolvedValue({
        text: "Response",
        pendingConfirmations: [],
      });

      await handler({
        event: {
          user: "U123",
          text: "<@BOT123> hello",
          channel: "C123",
          ts: "123.456",
        },
        say: mockSay,
      });

      expect(mockAppClient.reactions.add).toHaveBeenCalledWith({
        channel: "C123",
        timestamp: "123.456",
        name: "eyes",
      });
      expect(mockAppClient.reactions.remove).toHaveBeenCalledWith({
        channel: "C123",
        timestamp: "123.456",
        name: "eyes",
      });
    });

    it("should use thread_ts if present in event", async () => {
      const handler = eventHandlers["app_mention"]!;
      const mockSay = vi.fn().mockResolvedValue({ ts: "response.123" });

      vi.mocked(mockAgent.processMessage!).mockResolvedValue({
        text: "Response",
        pendingConfirmations: [],
      });

      await handler({
        event: {
          user: "U123",
          text: "<@BOT123> hello",
          channel: "C123",
          ts: "123.456",
          thread_ts: "thread.001",
        },
        say: mockSay,
      });

      expect(mockSay).toHaveBeenCalledWith({
        text: "Response",
        thread_ts: "thread.001",
      });
    });

    it("should setup pending confirmations when present", async () => {
      const handler = eventHandlers["app_mention"]!;
      const mockSay = vi.fn().mockResolvedValue({ ts: "response.789" });

      vi.mocked(mockAgent.processMessage!).mockResolvedValue({
        text: "Please confirm adding note",
        pendingConfirmations: [
          {
            toolName: "add_note",
            candidateId: "c-123",
            input: { content: "Test note" },
          },
        ],
      });

      await handler({
        event: {
          user: "U123",
          text: "<@BOT123> add note",
          channel: "C123",
          ts: "123.456",
        },
        say: mockSay,
      });

      expect(mockConfirmations.create).toHaveBeenCalled();
      expect(mockAppClient.reactions.add).toHaveBeenCalledWith({
        channel: "C123",
        timestamp: "response.789",
        name: "white_check_mark",
      });
      expect(mockAppClient.reactions.add).toHaveBeenCalledWith({
        channel: "C123",
        timestamp: "response.789",
        name: "x",
      });
    });

    it("should start triage session when triage data returned", async () => {
      const handler = eventHandlers["app_mention"]!;
      const mockSay = vi.fn().mockResolvedValue({ ts: "response.789" });

      mockAppClient.chat.postMessage.mockResolvedValue({ ts: "triage.123" });

      vi.mocked(mockAgent.processMessage!).mockResolvedValue({
        text: "Starting triage",
        pendingConfirmations: [],
        triage: {
          candidates: [createMockApplicationWithContext({ candidate: { id: "c-1", name: "John" } as any })],
          message: "Found 1 candidate",
          triageMode: true,
        },
      });

      vi.mocked(mockTriageSessions.formatCandidateCard!).mockReturnValue("*John* | Role");

      await handler({
        event: {
          user: "U123",
          text: "<@BOT123> start triage",
          channel: "C123",
          ts: "123.456",
        },
        say: mockSay,
      });

      expect(mockAppClient.chat.postMessage).toHaveBeenCalled();
      expect(mockTriageSessions.create).toHaveBeenCalled();
    });

    it("should handle empty triage candidates", async () => {
      const handler = eventHandlers["app_mention"]!;
      const mockSay = vi.fn().mockResolvedValue({ ts: "response.789" });

      vi.mocked(mockAgent.processMessage!).mockResolvedValue({
        text: "Starting triage",
        pendingConfirmations: [],
        triage: {
          candidates: [],
          message: "No candidates found",
          triageMode: true,
        },
      } as AgentResponse);

      await handler({
        event: {
          user: "U123",
          text: "<@BOT123> start triage",
          channel: "C123",
          ts: "123.456",
        },
        say: mockSay,
      });

      expect(mockAppClient.chat.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          text: "No candidates found",
        })
      );
      expect(mockTriageSessions.create).not.toHaveBeenCalled();
    });

    it("should handle errors during message processing", async () => {
      const handler = eventHandlers["app_mention"]!;
      const mockSay = vi.fn();

      vi.mocked(mockAgent.processMessage!).mockRejectedValue(new Error("API Error"));

      await handler({
        event: {
          user: "U123",
          text: "<@BOT123> hello",
          channel: "C123",
          ts: "123.456",
        },
        say: mockSay,
      });

      expect(consoleSpy.error).toHaveBeenCalledWith(
        "Error handling message:",
        expect.any(Error)
      );
      expect(mockSay).toHaveBeenCalledWith({
        text: expect.stringContaining("Something went wrong"),
        thread_ts: "123.456",
      });
      // Should remove eyes reaction on error
      expect(mockAppClient.reactions.remove).toHaveBeenCalled();
    });

    it("should handle reaction add/remove failures gracefully", async () => {
      const handler = eventHandlers["app_mention"]!;
      const mockSay = vi.fn().mockResolvedValue({ ts: "response.123" });

      mockAppClient.reactions.add.mockRejectedValue(new Error("Reaction failed"));
      mockAppClient.reactions.remove.mockRejectedValue(new Error("Remove failed"));

      vi.mocked(mockAgent.processMessage!).mockResolvedValue({
        text: "Response",
        pendingConfirmations: [],
      });

      // Should not throw
      await handler({
        event: {
          user: "U123",
          text: "<@BOT123> hello",
          channel: "C123",
          ts: "123.456",
        },
        say: mockSay,
      });

      expect(consoleSpy.warn).toHaveBeenCalledWith(
        "Failed to add reaction:",
        expect.any(Error)
      );
    });
  });

  describe("reaction_added event", () => {
    it("should handle triage advance decision", async () => {
      const handler = eventHandlers["reaction_added"]!;

      vi.mocked(mockTriageSessions.findByMessage!).mockReturnValue(createMockTriageSession());

      vi.mocked(mockTriageSessions.recordDecision!).mockReturnValue({
        candidate: createMockApplicationWithContext({ candidate: { id: "c-1", name: "John" } as any }),
        hasMore: false,
        nextCandidate: null,
      } as any);

      vi.mocked(mockTriageSessions.endSession!).mockReturnValue(createMockTriageSession());

      vi.mocked(mockTriageSessions.formatSummary!).mockReturnValue("Triage complete!");

      await handler({
        event: {
          user: "U123",
          reaction: "white_check_mark",
          item: { channel: "C123", ts: "123.456" },
        },
      });

      expect(mockTriageSessions.recordDecision).toHaveBeenCalledWith("U123", "advance");
    });

    it("should handle triage reject decision", async () => {
      const handler = eventHandlers["reaction_added"]!;

      vi.mocked(mockTriageSessions.findByMessage!).mockReturnValue(createMockTriageSession());

      vi.mocked(mockTriageSessions.recordDecision!).mockReturnValue({
        candidate: createMockApplicationWithContext({ candidate: { id: "c-1", name: "John" } as any }),
        hasMore: false,
        nextCandidate: null,
      } as any);

      vi.mocked(mockTriageSessions.endSession!).mockReturnValue(createMockTriageSession());
      vi.mocked(mockTriageSessions.formatSummary!).mockReturnValue("Done");

      await handler({
        event: {
          user: "U123",
          reaction: "x",
          item: { channel: "C123", ts: "123.456" },
        },
      });

      expect(mockTriageSessions.recordDecision).toHaveBeenCalledWith("U123", "reject");
    });

    it("should handle triage skip decision", async () => {
      const handler = eventHandlers["reaction_added"]!;

      vi.mocked(mockTriageSessions.findByMessage!).mockReturnValue(createMockTriageSession());

      vi.mocked(mockTriageSessions.recordDecision!).mockReturnValue({
        candidate: createMockApplicationWithContext({ candidate: { id: "c-1", name: "John" } as any }),
        hasMore: false,
        nextCandidate: null,
      } as any);

      vi.mocked(mockTriageSessions.endSession!).mockReturnValue(createMockTriageSession());
      vi.mocked(mockTriageSessions.formatSummary!).mockReturnValue("Done");

      await handler({
        event: {
          user: "U123",
          reaction: "thinking_face",
          item: { channel: "C123", ts: "123.456" },
        },
      });

      expect(mockTriageSessions.recordDecision).toHaveBeenCalledWith("U123", "skip");
    });

    it("should show next candidate when more remain", async () => {
      const handler = eventHandlers["reaction_added"]!;

      vi.mocked(mockTriageSessions.findByMessage!).mockReturnValue(createMockTriageSession());

      vi.mocked(mockTriageSessions.recordDecision!).mockReturnValue({
        candidate: createMockApplicationWithContext({ candidate: { id: "c-1", name: "John" } as any }),
        hasMore: true,
        nextCandidate: createMockApplicationWithContext({ candidate: { id: "c-2", name: "Jane" } as any }),
      } as any);

      vi.mocked(mockTriageSessions.getProgress!).mockReturnValue({ current: 2, total: 5, decisions: [] });
      vi.mocked(mockTriageSessions.formatCandidateCard!).mockReturnValue("*Jane* card");

      mockAppClient.chat.postMessage.mockResolvedValue({ ts: "next.123" });

      await handler({
        event: {
          user: "U123",
          reaction: "white_check_mark",
          item: { channel: "C123", ts: "123.456" },
        },
      });

      expect(mockTriageSessions.formatCandidateCard).toHaveBeenCalled();
      expect(mockTriageSessions.updateMessageTs).toHaveBeenCalledWith("U123", "next.123");
    });

    it("should ignore reactions from wrong user on triage", async () => {
      const handler = eventHandlers["reaction_added"]!;

      vi.mocked(mockTriageSessions.findByMessage!).mockReturnValue(createMockTriageSession({ userId: "U999" }));

      await handler({
        event: {
          user: "U123",
          reaction: "white_check_mark",
          item: { channel: "C123", ts: "123.456" },
        },
      });

      expect(mockTriageSessions.recordDecision).not.toHaveBeenCalled();
    });

    it("should handle standard confirmation approval", async () => {
      const handler = eventHandlers["reaction_added"]!;

      vi.mocked(mockTriageSessions.findByMessage!).mockReturnValue(null);
      vi.mocked(mockConfirmations.findByMessageTs!).mockReturnValue({
        id: "conf-1",
        type: "add_note",
        description: "Add note",
        candidateIds: ["c-123"],
        payload: { toolName: "add_note", candidateId: "c-123", input: { content: "Note" } },
        channelId: "C123",
        messageTs: "123.456",
        userId: "U123",
        createdAt: new Date(),
        expiresAt: new Date(),
      });

      vi.mocked(mockAgent.executeConfirmed!).mockResolvedValue({
        success: true,
        message: "Note added!",
      });

      await handler({
        event: {
          user: "U123",
          reaction: "white_check_mark",
          item: { channel: "C123", ts: "123.456" },
        },
      });

      expect(mockAgent.executeConfirmed).toHaveBeenCalled();
      expect(mockAppClient.chat.postMessage).toHaveBeenCalledWith({
        channel: "C123",
        thread_ts: "123.456",
        text: expect.stringContaining("Done! Note added!"),
      });
      expect(mockConfirmations.complete).toHaveBeenCalledWith("conf-1");
    });

    it("should handle standard confirmation cancellation", async () => {
      const handler = eventHandlers["reaction_added"]!;

      vi.mocked(mockTriageSessions.findByMessage!).mockReturnValue(null);
      vi.mocked(mockConfirmations.findByMessageTs!).mockReturnValue({
        id: "conf-1",
        type: "add_note",
        description: "Add note",
        candidateIds: ["c-123"],
        payload: { toolName: "add_note", input: {} },
        channelId: "C123",
        messageTs: "123.456",
        userId: "U123",
        createdAt: new Date(),
        expiresAt: new Date(),
      });

      await handler({
        event: {
          user: "U123",
          reaction: "x",
          item: { channel: "C123", ts: "123.456" },
        },
      });

      expect(mockAppClient.chat.postMessage).toHaveBeenCalledWith({
        channel: "C123",
        thread_ts: "123.456",
        text: "❌ Action cancelled.",
      });
      expect(mockConfirmations.complete).toHaveBeenCalledWith("conf-1");
    });

    it("should handle failed confirmed operation", async () => {
      const handler = eventHandlers["reaction_added"]!;

      vi.mocked(mockTriageSessions.findByMessage!).mockReturnValue(null);
      vi.mocked(mockConfirmations.findByMessageTs!).mockReturnValue({
        id: "conf-1",
        type: "add_note",
        description: "Add note",
        candidateIds: ["c-123"],
        payload: { toolName: "add_note", input: {} },
        channelId: "C123",
        messageTs: "123.456",
        userId: "U123",
        createdAt: new Date(),
        expiresAt: new Date(),
      });

      vi.mocked(mockAgent.executeConfirmed!).mockResolvedValue({
        success: false,
        message: "Candidate not found",
      });

      await handler({
        event: {
          user: "U123",
          reaction: "white_check_mark",
          item: { channel: "C123", ts: "123.456" },
        },
      });

      expect(mockAppClient.chat.postMessage).toHaveBeenCalledWith({
        channel: "C123",
        thread_ts: "123.456",
        text: expect.stringContaining("Failed: Candidate not found"),
      });
    });

    it("should handle set_reminder confirmation", async () => {
      const handler = eventHandlers["reaction_added"]!;

      vi.mocked(mockTriageSessions.findByMessage!).mockReturnValue(null);
      vi.mocked(mockConfirmations.findByMessageTs!).mockReturnValue({
        id: "conf-1",
        type: "add_note",
        description: "Set reminder",
        candidateIds: ["c-123"],
        payload: {
          toolName: "set_reminder",
          candidateId: "c-123",
          input: { remind_in: "3 days", note: "Follow up" },
        },
        channelId: "C123",
        messageTs: "123.456",
        userId: "U123",
        createdAt: new Date(),
        expiresAt: new Date(),
      });

      vi.mocked(mockReminders.scheduleReminder!).mockResolvedValue({
        success: true,
        scheduledTime: new Date(),
        message: "Reminder set for in 3 days",
      });

      await handler({
        event: {
          user: "U123",
          reaction: "white_check_mark",
          item: { channel: "C123", ts: "123.456" },
        },
      });

      expect(mockReminders.scheduleReminder).toHaveBeenCalledWith({
        userId: "U123",
        candidateId: "c-123",
        remindIn: "3 days",
        note: "Follow up",
      });
      expect(mockAppClient.chat.postMessage).toHaveBeenCalledWith({
        channel: "C123",
        thread_ts: "123.456",
        text: expect.stringContaining("Reminder set"),
      });
    });

    it("should handle reminder without note", async () => {
      const handler = eventHandlers["reaction_added"]!;

      vi.mocked(mockTriageSessions.findByMessage!).mockReturnValue(null);
      vi.mocked(mockConfirmations.findByMessageTs!).mockReturnValue({
        id: "conf-1",
        type: "add_note",
        description: "Set reminder",
        candidateIds: ["c-123"],
        payload: {
          toolName: "set_reminder",
          candidateId: "c-123",
          input: { remind_in: "1 week" },
        },
        channelId: "C123",
        messageTs: "123.456",
        userId: "U123",
        createdAt: new Date(),
        expiresAt: new Date(),
      });

      vi.mocked(mockReminders.scheduleReminder!).mockResolvedValue({
        success: true,
        scheduledTime: new Date(),
        message: "Reminder set",
      });

      await handler({
        event: {
          user: "U123",
          reaction: "white_check_mark",
          item: { channel: "C123", ts: "123.456" },
        },
      });

      expect(mockReminders.scheduleReminder).toHaveBeenCalledWith({
        userId: "U123",
        candidateId: "c-123",
        remindIn: "1 week",
      });
    });

    it("should handle reminder service unavailable", async () => {
      // Create new bot instance without reminders for this test
      vi.clearAllMocks();
      mockAppEvent.mockImplementation((eventName: string, handler: (args: any) => Promise<void>) => {
        eventHandlers[eventName] = handler;
      });
      mockAppError.mockImplementation(() => {});

      // Create new bot instance without reminders - assigns event handlers
      new SlackBot(
        mockConfig,
        mockAgent as ClaudeAgent,
        mockConfirmations as ConfirmationManager,
        undefined,
        mockTriageSessions as TriageSessionManager
      );

      const handler = eventHandlers["reaction_added"]!;

      vi.mocked(mockTriageSessions.findByMessage!).mockReturnValue(null);
      vi.mocked(mockConfirmations.findByMessageTs!).mockReturnValue({
        id: "conf-1",
        type: "add_note",
        description: "Set reminder",
        candidateIds: ["c-123"],
        payload: {
          toolName: "set_reminder",
          candidateId: "c-123",
          input: { remind_in: "3 days" },
        },
        channelId: "C123",
        messageTs: "123.456",
        userId: "U123",
        createdAt: new Date(),
        expiresAt: new Date(),
      });

      await handler({
        event: {
          user: "U123",
          reaction: "white_check_mark",
          item: { channel: "C123", ts: "123.456" },
        },
      });

      expect(mockAppClient.chat.postMessage).toHaveBeenCalledWith({
        channel: "C123",
        thread_ts: "123.456",
        text: expect.stringContaining("Reminder service is not available"),
      });
    });

    it("should handle missing reminder details", async () => {
      const handler = eventHandlers["reaction_added"]!;

      vi.mocked(mockTriageSessions.findByMessage!).mockReturnValue(null);
      vi.mocked(mockConfirmations.findByMessageTs!).mockReturnValue({
        id: "conf-1",
        type: "add_note",
        description: "Set reminder",
        candidateIds: [],
        payload: {
          toolName: "set_reminder",
          input: {}, // Missing remind_in and candidateId
        },
        channelId: "C123",
        messageTs: "123.456",
        userId: "U123",
        createdAt: new Date(),
        expiresAt: new Date(),
      });

      await handler({
        event: {
          user: "U123",
          reaction: "white_check_mark",
          item: { channel: "C123", ts: "123.456" },
        },
      });

      expect(mockAppClient.chat.postMessage).toHaveBeenCalledWith({
        channel: "C123",
        thread_ts: "123.456",
        text: expect.stringContaining("Missing reminder details"),
      });
    });

    it("should handle reminder scheduling error", async () => {
      const handler = eventHandlers["reaction_added"]!;

      vi.mocked(mockTriageSessions.findByMessage!).mockReturnValue(null);
      vi.mocked(mockConfirmations.findByMessageTs!).mockReturnValue({
        id: "conf-1",
        type: "add_note",
        description: "Set reminder",
        candidateIds: ["c-123"],
        payload: {
          toolName: "set_reminder",
          candidateId: "c-123",
          input: { remind_in: "invalid" },
        },
        channelId: "C123",
        messageTs: "123.456",
        userId: "U123",
        createdAt: new Date(),
        expiresAt: new Date(),
      });

      vi.mocked(mockReminders.scheduleReminder!).mockRejectedValue(
        new Error("Could not parse reminder time")
      );

      await handler({
        event: {
          user: "U123",
          reaction: "white_check_mark",
          item: { channel: "C123", ts: "123.456" },
        },
      });

      expect(mockAppClient.chat.postMessage).toHaveBeenCalledWith({
        channel: "C123",
        thread_ts: "123.456",
        text: expect.stringContaining("Failed: Could not parse reminder time"),
      });
    });

    it("should ignore non-confirm/cancel reactions for standard confirmations", async () => {
      const handler = eventHandlers["reaction_added"]!;

      vi.mocked(mockTriageSessions.findByMessage!).mockReturnValue(null);

      await handler({
        event: {
          user: "U123",
          reaction: "thumbsup",
          item: { channel: "C123", ts: "123.456" },
        },
      });

      expect(mockConfirmations.findByMessageTs).not.toHaveBeenCalled();
    });

    it("should ignore reactions from wrong user on confirmations", async () => {
      const handler = eventHandlers["reaction_added"]!;

      vi.mocked(mockTriageSessions.findByMessage!).mockReturnValue(null);
      vi.mocked(mockConfirmations.findByMessageTs!).mockReturnValue({
        id: "conf-1",
        type: "add_note",
        description: "Add note",
        candidateIds: ["c-123"],
        payload: { toolName: "add_note", input: {} },
        channelId: "C123",
        messageTs: "123.456",
        userId: "U999", // Different user
        createdAt: new Date(),
        expiresAt: new Date(),
      });

      await handler({
        event: {
          user: "U123",
          reaction: "white_check_mark",
          item: { channel: "C123", ts: "123.456" },
        },
      });

      expect(mockAgent.executeConfirmed).not.toHaveBeenCalled();
    });

    it("should handle no matching confirmation", async () => {
      const handler = eventHandlers["reaction_added"]!;

      vi.mocked(mockTriageSessions.findByMessage!).mockReturnValue(null);
      vi.mocked(mockConfirmations.findByMessageTs!).mockReturnValue(null);

      await handler({
        event: {
          user: "U123",
          reaction: "white_check_mark",
          item: { channel: "C123", ts: "123.456" },
        },
      });

      expect(mockAgent.executeConfirmed).not.toHaveBeenCalled();
    });
  });

  describe("message event", () => {
    it("should skip bot messages", async () => {
      const handler = eventHandlers["message"]!;

      await handler({
        event: {
          bot_id: "B123",
          channel: "C123",
          channel_type: "im",
        },
      });

      expect(mockAppClient.chat.postMessage).not.toHaveBeenCalled();
    });

    it("should skip threaded messages", async () => {
      const handler = eventHandlers["message"]!;

      await handler({
        event: {
          user: "U123",
          channel: "C123",
          thread_ts: "123.456",
          channel_type: "im",
        },
      });

      expect(mockAppClient.chat.postMessage).not.toHaveBeenCalled();
    });

    it("should respond to DMs with redirect message", async () => {
      const handler = eventHandlers["message"]!;

      await handler({
        event: {
          user: "U123",
          channel: "D123",
          channel_type: "im",
          text: "Hello",
        },
      });

      expect(mockAppClient.chat.postMessage).toHaveBeenCalledWith({
        channel: "D123",
        text: expect.stringContaining("only available in channels"),
      });
    });

    it("should not respond to channel messages", async () => {
      const handler = eventHandlers["message"]!;

      await handler({
        event: {
          user: "U123",
          channel: "C123",
          channel_type: "channel",
          text: "Hello",
        },
      });

      expect(mockAppClient.chat.postMessage).not.toHaveBeenCalled();
    });
  });

  describe("error handler", () => {
    it("should log errors", async () => {
      const testError = new Error("Test error");

      await errorHandler(testError);

      expect(consoleSpy.error).toHaveBeenCalledWith("Slack app error:", testError);
    });
  });

  describe("formatConfirmationDescription", () => {
    it("should format with name_or_email", async () => {
      const handler = eventHandlers["app_mention"]!;
      const mockSay = vi.fn().mockResolvedValue({ ts: "response.789" });

      vi.mocked(mockAgent.processMessage!).mockResolvedValue({
        text: "Confirm",
        pendingConfirmations: [
          {
            toolName: "add_note",
            input: { name_or_email: "john@example.com" },
          },
        ],
      });

      await handler({
        event: {
          user: "U123",
          text: "<@BOT123> add note",
          channel: "C123",
          ts: "123.456",
        },
        say: mockSay,
      });

      expect(mockConfirmations.create).toHaveBeenCalledWith(
        expect.objectContaining({
          description: "Add note to *john@example.com*",
        })
      );
    });

    it("should format with offer_id", async () => {
      const handler = eventHandlers["app_mention"]!;
      const mockSay = vi.fn().mockResolvedValue({ ts: "response.789" });

      vi.mocked(mockAgent.processMessage!).mockResolvedValue({
        text: "Confirm",
        pendingConfirmations: [
          {
            toolName: "approve_offer",
            input: { offer_id: "off-123" },
          },
        ],
      });

      await handler({
        event: {
          user: "U123",
          text: "<@BOT123> approve offer",
          channel: "C123",
          ts: "123.456",
        },
        say: mockSay,
      });

      expect(mockConfirmations.create).toHaveBeenCalledWith(
        expect.objectContaining({
          description: "Approve offer off-123...",
        })
      );
    });

    it("should format with interview_schedule_id", async () => {
      const handler = eventHandlers["app_mention"]!;
      const mockSay = vi.fn().mockResolvedValue({ ts: "response.789" });

      vi.mocked(mockAgent.processMessage!).mockResolvedValue({
        text: "Confirm",
        pendingConfirmations: [
          {
            toolName: "cancel_interview",
            input: { interview_schedule_id: "int-456" },
          },
        ],
      });

      await handler({
        event: {
          user: "U123",
          text: "<@BOT123> cancel interview",
          channel: "C123",
          ts: "123.456",
        },
        say: mockSay,
      });

      expect(mockConfirmations.create).toHaveBeenCalledWith(
        expect.objectContaining({
          description: "Cancel interview (schedule: int-456...)",
        })
      );
    });

    it("should fallback to just tool name", async () => {
      const handler = eventHandlers["app_mention"]!;
      const mockSay = vi.fn().mockResolvedValue({ ts: "response.789" });

      vi.mocked(mockAgent.processMessage!).mockResolvedValue({
        text: "Confirm",
        pendingConfirmations: [
          {
            toolName: "some_action",
            input: {},
          },
        ],
      });

      await handler({
        event: {
          user: "U123",
          text: "<@BOT123> do something",
          channel: "C123",
          ts: "123.456",
        },
        say: mockSay,
      });

      expect(mockConfirmations.create).toHaveBeenCalledWith(
        expect.objectContaining({
          description: "some action",
        })
      );
    });
  });
});
