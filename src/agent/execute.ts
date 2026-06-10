import { streamText, stepCountIs, type ModelMessage } from "ai";
import { getModel } from "@/agent/router";
import type { PrismaClient } from "@/generated/prisma/client";

export interface ExecuteInput {
  prisma: PrismaClient;
  modelId: string;
  system: string;
  /** Phase 1: no context — forces tool calls */
  phase1Messages: ModelMessage[];
  /** Phase 2: full context — for comparison and rhetoric after tool results */
  phase2Messages: ModelMessage[];
  tools: Record<string, any>;
  aiName: string;
  onToolResult?: (info: { toolName: string; args: unknown; success?: boolean; message?: string }) => void;
  onUsage?: (tokens: number) => void;
}

export async function executeStream(input: ExecuteInput) {
  const { prisma, modelId, system, phase1Messages, phase2Messages, tools, aiName, onToolResult, onUsage } = input;

  const result = streamText({
    model: getModel(modelId),
    system,
    messages: phase1Messages,
    tools,
    stopWhen: stepCountIs(8),
    maxRetries: 2,
    abortSignal: AbortSignal.timeout(60_000),
    prepareStep: async ({ stepNumber }) => {
      // Step 1: no context (forces tool calls)
      // Step 2+: inject context for comparison with DB results
      if (stepNumber > 1) {
        return { messages: phase2Messages };
      }
      return {};
    },
    onFinish: async ({ text, steps, usage }) => {
      const stepCount = steps?.length ?? 0;
      const totalToolCalls =
        steps?.reduce((sum, s: any) => sum + (s.toolCalls?.length ?? 0), 0) ?? 0;

      console.log(
        `[Agent] steps=${stepCount} toolCalls=${totalToolCalls} responseLen=${text?.length ?? 0}`
      );

      if (totalToolCalls === 0 && text && text.length > 0) {
        console.warn(
          `[Agent] WARNING: No tool calls. Response: ${text.slice(0, 200)}`
        );
      }

      // Collect tool results
      const toolCalls = steps?.flatMap((s: any) => {
        const resultsByCallId = new Map(
          (s.toolResults || []).map((tr: any) => [tr.toolCallId, tr])
        );
        return (s.toolCalls || []).map((tc: any) => {
          const tr: any = resultsByCallId.get(tc.toolCallId);
          const info = {
            toolName: tc.toolName,
            args: tc.args,
            success: tr?.result?.success,
            message: tr?.result?.message,
          };
          onToolResult?.(info);
          return info;
        });
      }) || [];

      // Save assistant message
      try {
        const { messageService } = await import("@/services/message.service");
        const responseText = text || "";
        if (responseText) {
          await messageService.saveMessage(
            prisma,
            "assistant",
            responseText,
            toolCalls.length > 0 ? toolCalls : undefined,
            usage?.totalTokens,
            aiName
          );
        }
      } catch (e) {
        console.error("Failed to save assistant message:", e);
      }

      onUsage?.(usage?.totalTokens ?? 0);
    },
  });

  return result;
}
