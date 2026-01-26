/**
 * Claude Tools Tests
 */

import { describe, it, expect } from "vitest";
import { ashbyTools, getToolNames, isWriteTool } from "./tools.js";

describe("Claude Tools", () => {
  describe("ashbyTools", () => {
    it("should export an array of tools", () => {
      expect(Array.isArray(ashbyTools)).toBe(true);
      expect(ashbyTools.length).toBeGreaterThan(0);
    });

    it("should have valid tool structure for all tools", () => {
      for (const tool of ashbyTools) {
        expect(tool.name).toBeDefined();
        expect(typeof tool.name).toBe("string");
        expect(tool.description).toBeDefined();
        expect(typeof tool.description).toBe("string");
        expect(tool.input_schema).toBeDefined();
        expect(tool.input_schema.type).toBe("object");
        expect(tool.input_schema.properties).toBeDefined();
        expect(Array.isArray(tool.input_schema.required)).toBe(true);
      }
    });

    it("should have unique tool names", () => {
      const names = ashbyTools.map((t) => t.name);
      const uniqueNames = new Set(names);
      expect(uniqueNames.size).toBe(names.length);
    });

    it("should include pipeline tools", () => {
      const toolNames = ashbyTools.map((t) => t.name);
      expect(toolNames).toContain("get_pipeline_overview");
      expect(toolNames).toContain("get_stale_candidates");
      expect(toolNames).toContain("get_candidates_needing_decision");
      expect(toolNames).toContain("get_recent_applications");
    });

    it("should include search tools", () => {
      const toolNames = ashbyTools.map((t) => t.name);
      expect(toolNames).toContain("search_candidates");
      expect(toolNames).toContain("get_candidates_for_job");
      expect(toolNames).toContain("get_candidate_details");
    });

    it("should include job tools", () => {
      const toolNames = ashbyTools.map((t) => t.name);
      expect(toolNames).toContain("get_open_jobs");
      expect(toolNames).toContain("get_job_details");
    });

    it("should include interview tools", () => {
      const toolNames = ashbyTools.map((t) => t.name);
      expect(toolNames).toContain("list_interview_plans");
      expect(toolNames).toContain("get_interview_schedules");
      expect(toolNames).toContain("get_team_members");
      expect(toolNames).toContain("schedule_interview");
    });

    it("should include feedback tools", () => {
      const toolNames = ashbyTools.map((t) => t.name);
      expect(toolNames).toContain("get_candidate_scorecard");
      expect(toolNames).toContain("list_feedback_submissions");
      expect(toolNames).toContain("get_feedback_details");
    });

    it("should include offer tools", () => {
      const toolNames = ashbyTools.map((t) => t.name);
      expect(toolNames).toContain("list_offers");
      expect(toolNames).toContain("get_pending_offers");
      expect(toolNames).toContain("get_candidate_offer");
      expect(toolNames).toContain("create_offer");
      expect(toolNames).toContain("update_offer");
      expect(toolNames).toContain("approve_offer");
      expect(toolNames).toContain("send_offer");
    });

    it("should include write operation tools", () => {
      const toolNames = ashbyTools.map((t) => t.name);
      expect(toolNames).toContain("add_note");
      expect(toolNames).toContain("move_candidate_stage");
      expect(toolNames).toContain("reject_candidate");
      expect(toolNames).toContain("create_candidate");
    });

    it("should include analysis tools", () => {
      const toolNames = ashbyTools.map((t) => t.name);
      expect(toolNames).toContain("analyze_candidate_status");
      expect(toolNames).toContain("analyze_candidate_blockers");
    });

    it("should include triage and reminder tools", () => {
      const toolNames = ashbyTools.map((t) => t.name);
      expect(toolNames).toContain("start_triage");
      expect(toolNames).toContain("set_reminder");
    });
  });

  describe("getToolNames", () => {
    it("should return all tool names when no category specified", () => {
      const allNames = getToolNames();
      expect(allNames.length).toBeGreaterThan(0);
      expect(allNames).toContain("get_pipeline_overview");
      expect(allNames).toContain("add_note");
    });

    it("should return only read tools when category is read", () => {
      const readNames = getToolNames("read");
      expect(readNames.length).toBeGreaterThan(0);
      expect(readNames).toContain("get_pipeline_overview");
      expect(readNames).toContain("search_candidates");
      expect(readNames).toContain("get_candidate_details");
      expect(readNames).not.toContain("add_note");
      expect(readNames).not.toContain("move_candidate_stage");
    });

    it("should return only write tools when category is write", () => {
      const writeNames = getToolNames("write");
      expect(writeNames.length).toBeGreaterThan(0);
      expect(writeNames).toContain("add_note");
      expect(writeNames).toContain("move_candidate_stage");
      expect(writeNames).toContain("schedule_interview");
      expect(writeNames).toContain("reject_candidate");
      expect(writeNames).not.toContain("get_pipeline_overview");
      expect(writeNames).not.toContain("search_candidates");
    });

    it("should include Phase 1 offer tools in correct categories", () => {
      const readNames = getToolNames("read");
      const writeNames = getToolNames("write");

      expect(readNames).toContain("list_offers");
      expect(readNames).toContain("get_pending_offers");
      expect(readNames).toContain("get_candidate_offer");

      expect(writeNames).toContain("create_offer");
      expect(writeNames).toContain("update_offer");
      expect(writeNames).toContain("approve_offer");
      expect(writeNames).toContain("send_offer");
    });

    it("should include Phase 1 interview tools in correct categories", () => {
      const readNames = getToolNames("read");
      const writeNames = getToolNames("write");

      expect(readNames).toContain("list_all_interviews");
      expect(readNames).toContain("get_upcoming_interviews");

      expect(writeNames).toContain("reschedule_interview");
      expect(writeNames).toContain("cancel_interview");
    });

    it("should include proactive analysis tools in read category", () => {
      const readNames = getToolNames("read");
      expect(readNames).toContain("analyze_candidate_status");
      expect(readNames).toContain("analyze_candidate_blockers");
    });

    it("should have no overlap between read and write tools", () => {
      const readNames = new Set(getToolNames("read"));
      const writeNames = getToolNames("write");

      for (const writeTool of writeNames) {
        expect(readNames.has(writeTool)).toBe(false);
      }
    });

    it("should have all tools in combined list", () => {
      const allNames = getToolNames();
      const readNames = getToolNames("read");
      const writeNames = getToolNames("write");

      expect(allNames.length).toBe(readNames.length + writeNames.length);
    });
  });

  describe("isWriteTool", () => {
    it("should return true for write tools", () => {
      expect(isWriteTool("add_note")).toBe(true);
      expect(isWriteTool("move_candidate_stage")).toBe(true);
      expect(isWriteTool("schedule_interview")).toBe(true);
      expect(isWriteTool("reject_candidate")).toBe(true);
      expect(isWriteTool("set_reminder")).toBe(true);
      expect(isWriteTool("create_offer")).toBe(true);
      expect(isWriteTool("create_candidate")).toBe(true);
    });

    it("should return false for read tools", () => {
      expect(isWriteTool("get_pipeline_overview")).toBe(false);
      expect(isWriteTool("search_candidates")).toBe(false);
      expect(isWriteTool("get_candidate_details")).toBe(false);
      expect(isWriteTool("get_open_jobs")).toBe(false);
      expect(isWriteTool("list_offers")).toBe(false);
      expect(isWriteTool("analyze_candidate_status")).toBe(false);
    });

    it("should return false for unknown tools", () => {
      expect(isWriteTool("unknown_tool")).toBe(false);
      expect(isWriteTool("")).toBe(false);
    });

    it("should classify all defined write tools correctly", () => {
      const writeNames = getToolNames("write");
      for (const name of writeNames) {
        expect(isWriteTool(name)).toBe(true);
      }
    });

    it("should classify all defined read tools correctly", () => {
      const readNames = getToolNames("read");
      for (const name of readNames) {
        expect(isWriteTool(name)).toBe(false);
      }
    });
  });

  describe("Tool Schema Validation", () => {
    it("should have required parameters marked correctly", () => {
      // search_candidates requires query
      const searchTool = ashbyTools.find((t) => t.name === "search_candidates");
      expect(searchTool?.input_schema.required).toContain("query");

      // add_note requires content
      const addNoteTool = ashbyTools.find((t) => t.name === "add_note");
      expect(addNoteTool?.input_schema.required).toContain("content");

      // reject_candidate requires archive_reason_id
      const rejectTool = ashbyTools.find((t) => t.name === "reject_candidate");
      expect(rejectTool?.input_schema.required).toContain("archive_reason_id");

      // create_candidate requires name and email
      const createTool = ashbyTools.find((t) => t.name === "create_candidate");
      expect(createTool?.input_schema.required).toContain("name");
      expect(createTool?.input_schema.required).toContain("email");
    });

    it("should have correct property types in schemas", () => {
      type SchemaProps = Record<string, { type?: string }>;

      const staleTool = ashbyTools.find((t) => t.name === "get_stale_candidates");
      expect((staleTool?.input_schema.properties as SchemaProps).limit?.type).toBe("number");

      const searchTool = ashbyTools.find((t) => t.name === "search_candidates");
      expect((searchTool?.input_schema.properties as SchemaProps).query?.type).toBe("string");

      const scheduleTool = ashbyTools.find((t) => t.name === "schedule_interview");
      expect((scheduleTool?.input_schema.properties as SchemaProps).interviewer_ids?.type).toBe("array");
    });
  });
});
