import { streamText } from "ai";
import { getModel } from "@/agent/router";
import type { ResponseInput } from "./types";

export async function generateResponse(input: ResponseInput) {
  const {
    modelId,
    system,
    userMessage,
    contextMessages,
    tools,
    aiName,
    prisma,
    onUsage,
  } = input;

  // User message first, then context
  const messages = [userMessage, ...contextMessages];

  const result = streamText({
    model: getModel(modelId),
    system,
    messages,
    tools,
    maxRetries: 2,
    abortSignal: AbortSignal.timeout(60_000),
    onFinish: async ({ text, steps, usage }) => {
      const stepCount = steps?.length ?? 0;
      const totalToolCalls =
        steps?.reduce((sum, s: any) => sum + (s.toolCalls?.length ?? 0), 0) ?? 0;

      console.log(
        `[Agent] steps=${stepCount} toolCalls=${totalToolCalls} responseLen=${text?.length ?? 0}`
      );

      if (totalToolCalls === 0 && text && text.length > 0) {
        console.warn(
          `[Agent] WARNING: No tool calls in response phase. Response: ${text.slice(0, 200)}`
        );
      }

      // Collect tool results
      const toolCalls = steps?.flatMap((s: any) => {
        const resultsByCallId = new Map(
          (s.toolResults || []).map((tr: any) => [tr.toolCallId, tr])
        );
        return (s.toolCalls || []).map((tc: any) => {
          const tr: any = resultsByCallId.get(tc.toolCallId);
          return {
            toolName: tc.toolName,
            args: tc.args,
            success: tr?.result?.success,
            message: tr?.result?.message,
          };
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
