import type { ModelMessage } from "ai";
import { classifyIntent } from "@/agent/intent/classifier";
import { buildPlan, executePlan } from "@/agent/orchestrator";
import { assembleContext } from "@/agent/context/assembler";
import { generateResponse } from "@/agent/response/generator";
import type { ToolResult } from "@/agent/orchestrator/types";
import type { Conflict } from "@/agent/context/types";
import { messageService } from "@/services/message.service";

export interface ChatInput {
  prisma: any;
  modelId: string;
  userMessage: string;
  language: string;
  warehouseName: string;
  aiName: string;
  memorySize: number;
  contextMode: "recent" | "summary" | "hybrid";
  summaryCount: number;
  tools: Record<string, any>;
  onUsage?: (tokens: number) => void;
}

export async function runAgent(input: ChatInput) {
  const {
    prisma,
    modelId,
    userMessage,
    language,
    warehouseName,
    aiName,
    memorySize,
    contextMode,
    summaryCount,
    tools,
    onUsage,
  } = input;

  // ── Layer 1: Classify intent (no context, no Prisma) ──
  console.log(`[Agent:L1] Classifying: "${userMessage.slice(0, 80)}"`);
  const intent = await classifyIntent(userMessage, language, modelId);
  console.log(`[Agent:L1] Intent: ${intent.type}${intent.type === "mutate" ? ` ${(intent as any).action} ${(intent as any).keyword}` : ""}`);

  // ── Layer 2: Execute tools (skip only for pure chat) ──
  let toolResults: ToolResult[] = [];
  if (intent.type !== "chat") {
    const plan = buildPlan(intent);
    console.log(`[Agent:L2] Plan: ${plan.map((s) => s.toolName).join(" → ")}`);
    const result = await executePlan(tools, plan, modelId);
    toolResults = result.toolResults;
    console.log(
      `[Agent:L2] Results: ${toolResults.map((r) => `${r.toolName}=${r.success ? "✅" : "❌"}`).join(", ")}`
    );
  } else {
    console.log(`[Agent:L2] Skipped (${intent.type})`);
  }

  // ── Layer 3: Assemble context ──
  // Load summaries
  let summaries: string[] = [];
  if (contextMode === "summary" || contextMode === "hybrid") {
    try {
      const dbSummaries = await messageService.getRecentSummaries(prisma, summaryCount);
      summaries = dbSummaries.map((s: any) => s.content);
    } catch {}
  }

  const ctx = await assembleContext(prisma, {
    toolResults,
    dbMessages: [],
    summaries,
    systemPrompt: "",
    aiName,
    language,
    warehouseName,
    memorySize,
    contextMode,
  });

  console.log(`[Agent:L3] Messages=${ctx.finalMessages.length} Conflicts=${ctx.conflicts.length}`);

  // ── Layer 4: Generate response ──
  const userModelMessage: ModelMessage = {
    role: "user",
    content: userMessage,
  };

  const result = await generateResponse({
    modelId,
    system: ctx.system,
    userMessage: userModelMessage,
    contextMessages: ctx.finalMessages,
    tools,
    verifiedResults: toolResults,
    conflicts: ctx.conflicts,
    aiName,
    prisma,
    onUsage,
  });

  // Return metadata alongside stream
  return {
    stream: result,
    intent,
    toolResults,
    conflicts: ctx.conflicts,
  };
}
