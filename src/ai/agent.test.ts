/**
 * Claude Agent Tests
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Config } from "../config/index.js";
import type { AshbyService } from "../ashby/service.js";
import type { SafetyGuards } from "../safety/guards.js";
import type { ToolExecutor } from "./executor.js";
import { ConversationMemory } from "../memory/index.js";

// Mock Anthropic SDK with mock messages create function
const mockMessagesCreate = vi.fn();

vi.mock("@anthropic-ai/sdk", () => ({
  default: class MockAnthropic {
    messages = {
      create: mockMessagesCreate,
    };
    constructor() {}
  },
}));

// Import after mock
import { ClaudeAgent } from "./agent.js";

const createMockConfig = (): Config =>
  ({
    anthropic: {
      apiKey: "test-api-key",
      model: "claude-sonnet-4-20250514",
      maxTokens: 4096,
    },
    safety: {
      batchLimit: 5,
    },
  }) as Config;

const createMockAshby = (): Partial<AshbyService> => ({});

const createMockSafety = (): Partial<SafetyGuards> => ({});

const createMockExecutor = (): Partial<ToolExecutor> => ({
  execute: vi.fn(),
  executeConfirmed: vi.fn(),
});

describe("ClaudeAgent", () => {
  let agent: ClaudeAgent;
  let mockConfig: Config;
  let mockAshby: Partial<AshbyService>;
  let mockSafety: Partial<SafetyGuards>;
  let mockExecutor: Partial<ToolExecutor>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockConfig = createMockConfig();
    mockAshby = createMockAshby();
    mockSafety = createMockSafety();
    mockExecutor = createMockExecutor();

    agent = new ClaudeAgent(
      mockConfig,
      mockAshby as AshbyService,
      mockSafety as SafetyGuards,
      mockExecutor as ToolExecutor
    );
  });

  describe("constructor", () => {
    it("should create agent with provided executor", () => {
      expect(agent).toBeDefined();
    });

    it("should create agent without executor (creates default)", () => {
      const agentWithoutExecutor = new ClaudeAgent(
        mockConfig,
        mockAshby as AshbyService,
        mockSafety as SafetyGuards
      );
      expect(agentWithoutExecutor).toBeDefined();
    });
  });

  describe("processMessage", () => {
    it("should return text response when conversation ends", async () => {
      mockMessagesCreate.mockResolvedValue({
        stop_reason: "end_turn",
        content: [{ type: "text", text: "Hello! How can I help you?" }],
      });

      const response = await agent.processMessage("Hi");

      expect(response.text).toBe("Hello! How can I help you?");
      expect(response.pendingConfirmations).toEqual([]);
      expect(mockMessagesCreate).toHaveBeenCalledTimes(1);
    });

    it("should handle empty content when conversation ends", async () => {
      mockMessagesCreate.mockResolvedValue({
        stop_reason: "end_turn",
        content: [],
      });

      const response = await agent.processMessage("Hi");

      expect(response.text).toBe("");
    });

    it("should handle tool use with successful execution", async () => {
      mockMessagesCreate
        .mockResolvedValueOnce({
          stop_reason: "tool_use",
          content: [
            {
              type: "tool_use",
              id: "tool-1",
              name: "get_open_jobs",
              input: {},
            },
          ],
        })
        .mockResolvedValueOnce({
          stop_reason: "end_turn",
          content: [{ type: "text", text: "Here are the open jobs..." }],
        });

      vi.mocked(mockExecutor.execute!).mockResolvedValue({
        success: true,
        data: { jobs: [] },
      });

      const response = await agent.processMessage("Show me open jobs");

      expect(response.text).toBe("Here are the open jobs...");
      expect(mockExecutor.execute).toHaveBeenCalledWith("get_open_jobs", {});
    });

    it("should handle tool use with error", async () => {
      mockMessagesCreate
        .mockResolvedValueOnce({
          stop_reason: "tool_use",
          content: [
            {
              type: "tool_use",
              id: "tool-1",
              name: "search_candidates",
              input: { query: "John" },
            },
          ],
        })
        .mockResolvedValueOnce({
          stop_reason: "end_turn",
          content: [{ type: "text", text: "Sorry, I couldn't find candidates." }],
        });

      vi.mocked(mockExecutor.execute!).mockResolvedValue({
        success: false,
        error: "Search failed",
      });

      const response = await agent.processMessage("Search for John");

      expect(response.text).toBe("Sorry, I couldn't find candidates.");
    });

    it("should handle tool use requiring confirmation with candidateId", async () => {
      mockMessagesCreate
        .mockResolvedValueOnce({
          stop_reason: "tool_use",
          content: [
            {
              type: "tool_use",
              id: "tool-1",
              name: "add_note",
              input: { content: "Great interview" },
            },
          ],
        })
        .mockResolvedValueOnce({
          stop_reason: "end_turn",
          content: [{ type: "text", text: "I'll add that note. Please confirm." }],
        });

      vi.mocked(mockExecutor.execute!).mockResolvedValue({
        success: true,
        requiresConfirmation: true,
        data: {
          toolName: "add_note",
          candidateId: "c-123",
          input: { content: "Great interview" },
        },
      });

      const response = await agent.processMessage("Add a note saying Great interview");

      expect(response.pendingConfirmations).toHaveLength(1);
      expect(response.pendingConfirmations[0]).toEqual({
        toolName: "add_note",
        candidateId: "c-123",
        input: { content: "Great interview" },
      });
    });

    it("should handle tool use requiring confirmation without candidateId", async () => {
      mockMessagesCreate
        .mockResolvedValueOnce({
          stop_reason: "tool_use",
          content: [
            {
              type: "tool_use",
              id: "tool-1",
              name: "create_offer",
              input: { salary: 100000 },
            },
          ],
        })
        .mockResolvedValueOnce({
          stop_reason: "end_turn",
          content: [{ type: "text", text: "I'll create the offer. Please confirm." }],
        });

      vi.mocked(mockExecutor.execute!).mockResolvedValue({
        success: true,
        requiresConfirmation: true,
        data: {
          toolName: "create_offer",
          input: { salary: 100000 },
        },
      });

      const response = await agent.processMessage("Create an offer for $100k");

      expect(response.pendingConfirmations).toHaveLength(1);
      expect(response.pendingConfirmations[0]).toEqual({
        toolName: "create_offer",
        input: { salary: 100000 },
      });
    });

    it("should handle start_triage tool and return triage data", async () => {
      const triageData = {
        candidates: [{ id: "app-1", candidate: { name: "John" } }],
        message: "Starting triage",
        triageMode: true,
      };

      mockMessagesCreate
        .mockResolvedValueOnce({
          stop_reason: "tool_use",
          content: [
            {
              type: "tool_use",
              id: "tool-1",
              name: "start_triage",
              input: {},
            },
          ],
        })
        .mockResolvedValueOnce({
          stop_reason: "end_turn",
          content: [{ type: "text", text: "Starting triage mode..." }],
        });

      vi.mocked(mockExecutor.execute!).mockResolvedValue({
        success: true,
        data: triageData,
      });

      const response = await agent.processMessage("Start triage");

      expect(response.triage).toEqual(triageData);
    });

    it("should handle multiple tool uses in sequence", async () => {
      mockMessagesCreate
        .mockResolvedValueOnce({
          stop_reason: "tool_use",
          content: [
            {
              type: "tool_use",
              id: "tool-1",
              name: "search_candidates",
              input: { query: "John" },
            },
            {
              type: "tool_use",
              id: "tool-2",
              name: "get_open_jobs",
              input: {},
            },
          ],
        })
        .mockResolvedValueOnce({
          stop_reason: "end_turn",
          content: [{ type: "text", text: "Found John and listed jobs." }],
        });

      vi.mocked(mockExecutor.execute!)
        .mockResolvedValueOnce({
          success: true,
          data: { candidates: [{ name: "John Doe" }] },
        })
        .mockResolvedValueOnce({
          success: true,
          data: { jobs: [{ title: "Engineer" }] },
        });

      const response = await agent.processMessage("Find John and show jobs");

      expect(response.text).toBe("Found John and listed jobs.");
      expect(mockExecutor.execute).toHaveBeenCalledTimes(2);
    });

    it("should handle unexpected stop reason", async () => {
      mockMessagesCreate.mockResolvedValue({
        stop_reason: "max_tokens",
        content: [{ type: "text", text: "Partial response" }],
      });

      const response = await agent.processMessage("Long request");

      expect(response.text).toBe("Partial response");
    });

    it("should handle unexpected stop reason with no text", async () => {
      mockMessagesCreate.mockResolvedValue({
        stop_reason: "max_tokens",
        content: [],
      });

      const response = await agent.processMessage("Long request");

      expect(response.text).toBe("I encountered an unexpected situation. Please try again.");
    });

    it("should skip non-tool_use content blocks", async () => {
      mockMessagesCreate
        .mockResolvedValueOnce({
          stop_reason: "tool_use",
          content: [
            { type: "text", text: "Let me check..." },
            {
              type: "tool_use",
              id: "tool-1",
              name: "get_open_jobs",
              input: {},
            },
          ],
        })
        .mockResolvedValueOnce({
          stop_reason: "end_turn",
          content: [{ type: "text", text: "Here are the jobs." }],
        });

      vi.mocked(mockExecutor.execute!).mockResolvedValue({
        success: true,
        data: { jobs: [] },
      });

      const response = await agent.processMessage("Show jobs");

      expect(response.text).toBe("Here are the jobs.");
      expect(mockExecutor.execute).toHaveBeenCalledTimes(1);
    });
  });

  describe("executeConfirmed", () => {
    it("should execute confirmed operation successfully", async () => {
      vi.mocked(mockExecutor.executeConfirmed!).mockResolvedValue({
        success: true,
        data: { message: "Note added successfully" },
      });

      const result = await agent.executeConfirmed({
        toolName: "add_note",
        candidateId: "c-123",
        input: { content: "Great interview" },
      });

      expect(result.success).toBe(true);
      expect(result.message).toBe("Note added successfully");
      expect(mockExecutor.executeConfirmed).toHaveBeenCalledWith(
        "add_note",
        { content: "Great interview" },
        "c-123"
      );
    });

    it("should execute confirmed operation without candidateId", async () => {
      vi.mocked(mockExecutor.executeConfirmed!).mockResolvedValue({
        success: true,
        data: { message: "Offer created" },
      });

      const result = await agent.executeConfirmed({
        toolName: "create_offer",
        input: { salary: 100000 },
      });

      expect(result.success).toBe(true);
      expect(result.message).toBe("Offer created");
      expect(mockExecutor.executeConfirmed).toHaveBeenCalledWith(
        "create_offer",
        { salary: 100000 },
        undefined
      );
    });

    it("should return default success message when none provided", async () => {
      vi.mocked(mockExecutor.executeConfirmed!).mockResolvedValue({
        success: true,
        data: {},
      });

      const result = await agent.executeConfirmed({
        toolName: "move_candidate_stage",
        candidateId: "c-123",
        input: { stage_id: "s-456" },
      });

      expect(result.success).toBe(true);
      expect(result.message).toBe("Operation completed successfully.");
    });

    it("should handle failed confirmed operation", async () => {
      vi.mocked(mockExecutor.executeConfirmed!).mockResolvedValue({
        success: false,
        error: "Candidate not found",
      });

      const result = await agent.executeConfirmed({
        toolName: "add_note",
        candidateId: "c-invalid",
        input: { content: "Note" },
      });

      expect(result.success).toBe(false);
      expect(result.message).toBe("Candidate not found");
    });

    it("should return default error message when none provided", async () => {
      vi.mocked(mockExecutor.executeConfirmed!).mockResolvedValue({
        success: false,
      });

      const result = await agent.executeConfirmed({
        toolName: "add_note",
        candidateId: "c-123",
        input: { content: "Note" },
      });

      expect(result.success).toBe(false);
      expect(result.message).toBe("Operation failed.");
    });
  });

  describe("memory integration", () => {
    let memory: ConversationMemory;
    let agentWithMemory: ClaudeAgent;

    beforeEach(() => {
      memory = new ConversationMemory();
      agentWithMemory = new ClaudeAgent(
        mockConfig,
        mockAshby as AshbyService,
        mockSafety as SafetyGuards,
        mockExecutor as ToolExecutor,
        memory
      );
    });

    it("should record user message in memory when context provided", async () => {
      mockMessagesCreate.mockResolvedValue({
        stop_reason: "end_turn",
        content: [{ type: "text", text: "Hi there!" }],
      });

      await agentWithMemory.processMessage("Hello", {
        userId: "user-1",
        channelId: "channel-1",
      });

      const context = memory.getContext("user-1", "channel-1");
      expect(context.messages.length).toBe(2); // user + assistant
      expect(context.messages[0]?.content).toBe("Hello");
      expect(context.messages[0]?.role).toBe("user");
    });

    it("should record assistant response in memory when context provided", async () => {
      mockMessagesCreate.mockResolvedValue({
        stop_reason: "end_turn",
        content: [{ type: "text", text: "Hi there!" }],
      });

      await agentWithMemory.processMessage("Hello", {
        userId: "user-1",
        channelId: "channel-1",
      });

      const context = memory.getContext("user-1", "channel-1");
      expect(context.messages[1]?.content).toBe("Hi there!");
      expect(context.messages[1]?.role).toBe("assistant");
    });

    it("should record candidate context from search results", async () => {
      mockMessagesCreate
        .mockResolvedValueOnce({
          stop_reason: "tool_use",
          content: [
            {
              type: "tool_use",
              id: "tool-1",
              name: "search_candidates",
              input: { query: "John" },
            },
          ],
        })
        .mockResolvedValueOnce({
          stop_reason: "end_turn",
          content: [{ type: "text", text: "Found John Doe" }],
        });

      vi.mocked(mockExecutor.execute!).mockResolvedValue({
        success: true,
        data: [
          { id: "c-123", name: "John Doe", primaryEmailAddress: { value: "john@example.com" } },
        ],
      });

      await agentWithMemory.processMessage("Find John", {
        userId: "user-1",
        channelId: "channel-1",
      });

      const context = memory.getContext("user-1", "channel-1");
      expect(context.candidates.has("c-123")).toBe(true);
      expect(context.candidates.get("c-123")?.candidateName).toBe("John Doe");
    });

    it("should record candidate context with application from briefing", async () => {
      mockMessagesCreate
        .mockResolvedValueOnce({
          stop_reason: "tool_use",
          content: [
            {
              type: "tool_use",
              id: "tool-1",
              name: "get_interview_briefing",
              input: { interviewer_email: "test@example.com" },
            },
          ],
        })
        .mockResolvedValueOnce({
          stop_reason: "end_turn",
          content: [{ type: "text", text: "Here's your briefing" }],
        });

      vi.mocked(mockExecutor.execute!).mockResolvedValue({
        success: true,
        data: {
          briefing: {
            candidate: { id: "c-456", name: "Jane Smith" },
            application: {
              id: "app-1",
              candidateId: "c-456",
              jobId: "job-1",
              job: { id: "job-1", title: "Engineer" },
              daysInCurrentStage: 3,
            },
          },
        },
      });

      await agentWithMemory.processMessage("Who am I interviewing?", {
        userId: "user-1",
        channelId: "channel-1",
      });

      const context = memory.getContext("user-1", "channel-1");
      expect(context.candidates.has("c-456")).toBe(true);
      const candidateCtx = context.candidates.get("c-456");
      expect(candidateCtx?.candidateName).toBe("Jane Smith");
      expect(candidateCtx?.lastApplication?.jobTitle).toBe("Engineer");
    });

    it("should inject conversation context into enriched message", async () => {
      // First, populate some context
      memory.addUserMessage("user-1", "channel-1", "Hello");
      memory.addAssistantMessage("user-1", "channel-1", "Hi there!");

      mockMessagesCreate.mockResolvedValue({
        stop_reason: "end_turn",
        content: [{ type: "text", text: "Following up..." }],
      });

      await agentWithMemory.processMessage("What was I asking about?", {
        userId: "user-1",
        channelId: "channel-1",
      });

      // Check that the API was called with enriched context
      expect(mockMessagesCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [
            expect.objectContaining({
              role: "user",
              content: expect.stringContaining("RECENT CONVERSATION"),
            }),
          ],
        })
      );
    });

    it("should not use memory when context not provided", async () => {
      mockMessagesCreate.mockResolvedValue({
        stop_reason: "end_turn",
        content: [{ type: "text", text: "Hi!" }],
      });

      await agentWithMemory.processMessage("Hello");

      // Memory should still be empty (no context was passed)
      expect(memory.getStats().activeContexts).toBe(0);
    });

    it("should return memory instance via getMemory", () => {
      expect(agentWithMemory.getMemory()).toBe(memory);
    });

    it("should return null when no memory configured", () => {
      expect(agent.getMemory()).toBeNull();
    });
  });
});
