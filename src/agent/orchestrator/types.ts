import type { Intent } from "@/agent/intent/types";

export interface ToolResult {
  toolName: string;
  args: Record<string, unknown>;
  result: unknown;
  success: boolean;
}

export interface OrchestratorInput {
  intent: Intent;
  tools: Record<string, any>;
}

export interface OrchestratorOutput {
  toolResults: ToolResult[];
  success: boolean;
  errorMessage?: string;
  fallback?: boolean;   // findItem returned no exact match — defer to Layer 4
}

export interface CallStep {
  toolName: string;
  argsBuilder: (previous: ToolResult[]) => Record<string, unknown>;
}
