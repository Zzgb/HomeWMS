import type { ModelMessage } from "ai";
import type { ToolResult } from "@/agent/orchestrator/types";

export interface Conflict {
  itemName: string;
  field: string;
  dbValue: unknown;
  contextValue: string;
  contextSource: number;
}

export interface ContextInput {
  toolResults: ToolResult[];
  dbMessages: ModelMessage[];
  summaries: string[];
  systemPrompt: string;
  aiName: string;
  language: string;
  warehouseName: string;
  memorySize: number;
  contextMode: "recent" | "summary" | "hybrid";
}

export interface ContextOutput {
  finalMessages: ModelMessage[];
  conflicts: Conflict[];
  system: string;
}
