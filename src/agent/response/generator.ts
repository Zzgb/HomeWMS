import { streamText } from "ai";
import { getModel } from "@/agent/router";
import type { ResponseInput, OnFinishEvent } from "./types";

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
    postFinish,
    signal,
  } = input;

  const messages = [userMessage, ...contextMessages];

  // Combine timeout + client disconnect signal so onFinish fires on abort
  const timeout = AbortSignal.timeout(60_000);
  const abortSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;

  const result = streamText({
    model: getModel(modelId),
    system,
    messages,
    tools,
    maxRetries: 2,
    abortSignal,
    onFinish: async ({ text, steps, usage }) => {
      const stepCount = steps?.length ?? 0;
      const totalToolCalls =
        steps?.reduce((sum, s: any) => sum + (s.toolCalls?.length ?? 0), 0) ?? 0;

      console.log(
        `[Agent:L4] steps=${stepCount} toolCalls=${totalToolCalls} responseLen=${text?.length ?? 0} aborted=${signal?.aborted ?? false}`
      );

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

      // Always save, even partial text (client disconnect case)
      try {
        const { messageService } = await import("@/services/message.service");
        const responseText = text || "";
        await messageService.saveMessage(
          prisma,
          "assistant",
          responseText || "(response interrupted)",
          toolCalls.length > 0 ? toolCalls : undefined,
          usage?.totalTokens,
          aiName
        );
      } catch (e) {
        console.error("Failed to save assistant message:", e);
      }

      onUsage?.(usage?.totalTokens ?? 0);

      // L5 correction hook — skip if aborted (no meaningful response to check)
      if (postFinish && !signal?.aborted) {
        const event: OnFinishEvent = { text: text || "", steps, usage };
        postFinish(event).catch((e) =>
          console.error("[Agent] postFinish error:", e)
        );
      }
    },
  });

  return result;
}
