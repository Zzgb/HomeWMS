import type { ModelMessage } from "ai";
import type { ToolResult } from "@/agent/orchestrator/types";
import type { Conflict } from "@/agent/context/types";

export interface OnFinishEvent {
  text: string;
  steps?: any[];
  usage?: { totalTokens?: number };
}

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
  /** Called after the message is saved. Use for L5 correction check. */
  postFinish?: (event: OnFinishEvent) => Promise<void>;
  /** AbortSignal from the HTTP request — fires onFinish even on client disconnect */
  signal?: AbortSignal;
}
