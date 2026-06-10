import type { ModelMessage } from "ai";
import type { ToolResult } from "@/agent/orchestrator/types";
import type { Conflict } from "@/agent/context/types";

export interface ResponseInput {
  modelId: string;
  system: string;
  userMessage: ModelMessage;
  contextMessages: ModelMessage[];
  tools: Record<string, any>;
  verifiedResults: ToolResult[];
  conflicts: Conflict[];
  aiName: string;
  prisma: any;
  onUsage?: (tokens: number) => void;
}
