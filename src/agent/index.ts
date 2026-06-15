import type { ModelMessage } from "ai";
import { classifyIntent } from "@/agent/intent/classifier";
import { buildPlan, executePlan } from "@/agent/orchestrator";
import { assembleContext } from "@/agent/context/assembler";
import { generateResponse } from "@/agent/response/generator";
import { checkCorrection } from "@/agent/correction/checker";
import { recordCorrection, maybeLearn } from "@/agent/correction/learner";
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
  signal?: AbortSignal;
}

async function runSinglePass(
  input: ChatInput,
  intent: any,
  previousContext?: { toolResults: ToolResult[]; summaries: string[] }
) {
  const {
    prisma, modelId, language, warehouseName,
    aiName, memorySize, contextMode, summaryCount, tools,
  } = input;

  // ── Layer 2: Execute tools ──
  let toolResults: ToolResult[] = [];
  if (intent.type !== "chat") {
    const plan = await buildPlan(intent);
    console.log(`[Agent:L2] Plan: ${plan.map((s: any) => s.toolName).join(" → ")}`);
    const result = await executePlan(tools, plan);
    toolResults = result.toolResults;
    console.log(
      `[Agent:L2] Results: ${toolResults.map((r) => `${r.toolName}=${r.success ? "✅" : "❌"}`).join(", ")}`
    );
  } else {
    console.log(`[Agent:L2] Skipped (chat)`);
  }

  // ── Layer 3: Assemble context ──
  let summaries = previousContext?.summaries ?? [];
  if (!previousContext && (contextMode === "summary" || contextMode === "hybrid")) {
    try {
      const dbSummaries = await messageService.getRecentSummaries(prisma, summaryCount);
      summaries = dbSummaries.map((s: any) => s.content);
    } catch {}
  }

  // Merge with previous results if multi-intent
  const mergedResults = [...(previousContext?.toolResults ?? []), ...toolResults];

  const ctx = await assembleContext(prisma, {
    toolResults: mergedResults,
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

  return { toolResults, mergedResults, ctx, summaries };
}

export async function runAgent(input: ChatInput) {
  const { prisma, modelId, userMessage, tools, onUsage } = input;

  // ── Layer 1: Classify intent (now returns Intent[]) ──
  console.log(`[Agent:L1] Classifying: "${userMessage.slice(0, 80)}"`);
  const intents = await classifyIntent(userMessage, input.language, modelId);
  console.log(`[Agent:L1] ${intents.length} intent(s): ${intents.map(i => i.type + (i.type === "mutate" ? `:${(i as any).action}` : "")).join(", ")}`);

  // ── Layer 2-3: Execute each intent ──
  const allResults: ToolResult[] = [];
  let mergedResults: ToolResult[] = [];
  let ctx: any;
  let summaries: string[] = [];

  for (let i = 0; i < intents.length; i++) {
    const previousContext = i > 0 ? { toolResults: allResults, summaries } : undefined;
    const pass = await runSinglePass(input, intents[i], previousContext);
    allResults.push(...pass.toolResults);
    mergedResults = pass.mergedResults;
    ctx = pass.ctx;
    summaries = pass.summaries;
  }

  // ── Layer 4: Generate response ──
  const userModelMessage: ModelMessage = {
    role: "user",
    content: userMessage,
  };

  let correctionRan = false;

  const result = await generateResponse({
    modelId,
    system: ctx.system,
    userMessage: userModelMessage,
    contextMessages: ctx.finalMessages,
    tools: {},
    verifiedResults: mergedResults,
    conflicts: ctx.conflicts,
    aiName: input.aiName,
    prisma,
    onUsage,
    signal: input.signal,
    postFinish: async (event) => {
      if (correctionRan) return;
      correctionRan = true;

      console.log(`[Agent:L5] Running correction check (DB + LLM)...`);

      // ── L5: Correction check with DB verification ──
      const correction = await checkCorrection(
        userMessage,
        intents,
        mergedResults,
        event.text,
        modelId,
        prisma
      );

      if (!correction.needsCorrection) {
        console.log(`[Agent:L5] No correction needed.`);
        return;
      }

      console.log(`[Agent:L5] Correction needed: ${correction.reason}`);

      // Record for regex learning
      recordCorrection(prisma, userMessage, intents, correction).catch((e) =>
        console.error("[Agent:L5] recordCorrection failed:", e)
      );

      // Check if we should trigger regex learning (≥3 cases)
      maybeLearn(prisma, modelId).catch((e) =>
        console.error("[Agent:L5] maybeLearn failed:", e)
      );

      // Parse corrected action(s) — may be multi-line for multi-item corrections
      const actionLines = (correction.correctedAction || "").split("\n").filter(Boolean);
      const correctedPlans = actionLines
        .map((line) => parseCorrectedAction(line.trim(), userMessage))
        .filter(Boolean);

      if (correctedPlans.length === 0) {
        const isFabrication = correction.reason.includes("FABRICATION");
        if (isFabrication) {
          console.log(`[Agent:L5] Fabrication detected, re-running full classification + execution`);
          // Re-classify with empty keyword fallback to trigger delete-all
          const retryIntent = { type: "mutate" as const, action: "delete" as const, keyword: "" };
          try {
            const retryPass = await runSinglePass(input, retryIntent);
            const retryResults = retryPass.toolResults;

            const retryCtx = await assembleContext(prisma, {
              toolResults: retryResults,
              dbMessages: [],
              summaries: [],
              systemPrompt: "",
              aiName: input.aiName,
              language: input.language,
              warehouseName: input.warehouseName,
              memorySize: input.memorySize,
              contextMode: input.contextMode,
            });

            retryCtx.finalMessages.unshift({
              role: "system",
              content:
                `❗[自纠正] 刚才的回复是编造的。现在重新执行了实际操作。` +
                `报告真实的执行结果。如果操作失败就说失败。如果成功就说成功。简洁。`,
            } as any);

            const correctedStream = await generateResponse({
              modelId,
              system: retryCtx.system,
              userMessage: { role: "user", content: `Correct this fabrication: ${userMessage}` } as ModelMessage,
              contextMessages: retryCtx.finalMessages,
              tools: {},
              verifiedResults: retryResults,
              conflicts: retryCtx.conflicts,
              aiName: input.aiName,
              prisma,
            });
            try { await (correctedStream as any).text; } catch {}
          } catch (e) {
            console.error("[Agent:L5] Fabrication re-run failed:", e);
          }
        }
        console.log(`[Agent:L5] No parseable corrected action.`);
        return;
      }

      // ── Execute all corrected plans ──
      const allCorrectedResults: ToolResult[] = [];
      for (const plan of correctedPlans) {
        console.log(`[Agent:L5] Corrected plan: ${(plan as any[]).map((s: any) => s.toolName).join(" → ")}`);
        const res = await executePlan(tools, plan as any);
        allCorrectedResults.push(...res.toolResults);
      }
      console.log(
        `[Agent:L5] Corrected results: ${allCorrectedResults.map((r) => `${r.toolName}=${r.success ? "✅" : "❌"}`).join(", ")}`
      );

      // ── Assemble correction context ──
      const correctionCtx = await assembleContext(prisma, {
        toolResults: allCorrectedResults,
        dbMessages: [],
        summaries: [],
        systemPrompt: "",
        aiName: input.aiName,
        language: input.language,
        warehouseName: input.warehouseName,
        memorySize: input.memorySize,
        contextMode: input.contextMode,
      });

      correctionCtx.finalMessages.unshift({
        role: "system",
        content:
          `⚠️ SELF-CORRECTION: Your previous response was WRONG. ` +
          `You MUST start your message with EXACTLY: ` +
          `"❗[自纠正] 刚才的回复有误，实际情况是：" ` +
          `Then report the CORRECT results. Do NOT re-try or re-attempt. ` +
          `Just state what the database actually shows. Be concise.`,
      } as any);

      // ── Generate correction response ──
      const correctionStream = await generateResponse({
        modelId,
        system: correctionCtx.system,
        userMessage: {
          role: "user",
          content: `Correct this: ${correction.reason}`,
        } as ModelMessage,
        contextMessages: correctionCtx.finalMessages,
        tools: {},
        verifiedResults: allCorrectedResults,
        conflicts: correctionCtx.conflicts,
        aiName: input.aiName,
        prisma,
      });

      try {
        await (correctionStream as any).text;
      } catch (e) {
        console.error("[Agent:L5] Correction stream failed:", e);
      }
    },
  });

  return {
    stream: result,
    intents,
    toolResults: mergedResults,
    conflicts: ctx.conflicts,
  };
}

// ── Parse L5 corrected action into CallStep[] ──

function parseCorrectedAction(
  correctedAction: string | undefined,
  userMessage: string
) {
  if (!correctedAction) return null;

  const actionMatch = correctedAction.match(/^(move|stockin|consume|query|delete)\b/i);
  if (!actionMatch) return null;

  const action = actionMatch[1].toLowerCase();
  const itemMatch = correctedAction.match(/ITEM:\s*(.+?)(?:\s+TARGET:|$)/i);
  const targetMatch = correctedAction.match(/TARGET:\s*(.+?)$/i);
  const qtyMatch = correctedAction.match(/QTY:\s*(\d+)/i);

  const itemName = itemMatch?.[1]?.trim();
  const target = targetMatch?.[1]?.trim();
  const qty = qtyMatch ? parseInt(qtyMatch[1], 10) : undefined;

  if (!itemName) return null;

  const findStep = {
    toolName: "findItem",
    argsBuilder: () => ({ keyword: itemName }),
  };

  const pickName = (prev: any[]) => {
    const items = prev[0]?.result?.items;
    if (items?.length) {
      const match = items.find(
        (i: any) => i.name.toLowerCase() === itemName.toLowerCase()
      );
      return match?.name || items[0].name;
    }
    return itemName;
  };

  const pickSpot = (prev: any[]) => {
    const items = prev[0]?.result?.items;
    if (items?.length) {
      const match = items.find(
        (i: any) => i.name.toLowerCase() === itemName.toLowerCase()
      ) || items[0];
      return match?.stocks?.[0]?.spot || "默认位置";
    }
    return "默认位置";
  };

  switch (action) {
    case "move":
      return [
        findStep,
        {
          toolName: "moveItem",
          argsBuilder: (prev: any[]) => ({
            itemName: pickName(prev),
            fromSpot: pickSpot(prev),
            toSpot: target || "默认位置",
          }),
        },
      ];
    case "stockin":
      return [
        findStep,
        {
          toolName: "stockIn",
          argsBuilder: (prev: any[]) => ({
            itemName: pickName(prev),
            qty: qty || 1,
            spot: target || "默认位置",
          }),
        },
      ];
    case "consume":
      return [
        findStep,
        {
          toolName: "consumeItem",
          argsBuilder: (prev: any[]) => ({
            itemName: pickName(prev),
            qty: qty || 1,
            spot: pickSpot(prev),
          }),
        },
      ];
    case "delete":
      return [
        findStep,
        {
          toolName: "deleteItem",
          argsBuilder: (prev: any[]) => ({ itemName: pickName(prev) }),
        },
      ];
    case "query":
      return [findStep];
    default:
      return null;
  }
}
