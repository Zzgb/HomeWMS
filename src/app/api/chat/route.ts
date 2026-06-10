import { streamText, stepCountIs } from "ai";
import { getModel } from "@/agent/router";
import { assembleContext } from "@/agent/context";
import { maybeSummarize } from "@/agent/summarizer";
import { createToolDefinitions } from "@/tools";
import { getPrisma } from "@/lib/prisma";
import { DEFAULT_MEMORY_SIZE, DEFAULT_MODEL } from "@/lib/constants";

export async function POST(req: Request) {
  try {
    const { messages, storeId } = await req.json();

    if (!storeId) {
      return Response.json({ error: "storeId is required" }, { status: 400 });
    }

    // Get per-warehouse PrismaClient
    const prisma = getPrisma(storeId);
    if (!prisma) {
      return Response.json(
        { error: `仓库 "${storeId}" 连接失败。请去设置→仓库管理检查连接是否正常。` },
        { status: 404 }
      );
    }

    // Read warehouse config
    const { getWarehouseConfig } = await import("@/lib/connections");
    const cfg = getWarehouseConfig(storeId);
    const modelId = cfg?.modelId || DEFAULT_MODEL;
    const memorySize = cfg?.memorySize || DEFAULT_MEMORY_SIZE;

    // Read current aiName from latest message with aiName set (any role), default to 小鞠
    let aiName = "小鞠";
    try {
      const lastWithName = await prisma.message.findFirst({
        where: { aiName: { not: null } },
        orderBy: { createdAt: "desc" },
        select: { aiName: true },
      });
      if (lastWithName?.aiName) aiName = lastWithName.aiName;
    } catch {}

    // Save user message
    const lastUserMsg = messages[messages.length - 1];
    if (lastUserMsg?.role === "user") {
      try {
        const { messageService } = await import("@/services/message.service");
        const userText = typeof lastUserMsg.content === "string" && lastUserMsg.content
          ? lastUserMsg.content
          : lastUserMsg.parts?.filter((p: any) => p.type === "text").map((p: any) => p.text).join("") || "(empty)";
        await messageService.saveMessage(prisma, "user", userText, undefined, undefined, aiName);
      } catch (e) {
        console.error("Failed to save user message:", e);
      }
    }

    // Assemble context
    let system: string;
    let dbMessages: any[];
    try {
      const ctx = await assembleContext(prisma, cfg?.name || storeId, memorySize, aiName, storeId);
      system = ctx.system;
      dbMessages = ctx.messages;
    } catch (e) {
      console.error("Context assembly failed:", e);
      system = "You are a warehouse management assistant.";
      dbMessages = [];
    }

    // Validate modelId format
    let resolvedModelId = modelId;
    if (!modelId || !modelId.includes("/")) {
      console.warn(`Invalid modelId "${modelId}", falling back to ${DEFAULT_MODEL}`);
      resolvedModelId = DEFAULT_MODEL;
    }

    // Convert client UIMessages (parts-based) to ModelMessages (content-based)
    const clientModelMessages = messages.map((m: any) => ({
      role: m.role,
      content: typeof m.content === "string" ? m.content
        : m.parts?.filter((p: any) => p.type === "text").map((p: any) => p.text).join("") || "",
    }));

    // Combine DB context with client messages
    const allMessages = [...dbMessages, ...clientModelMessages];

    // Create tool definitions per warehouse
    const toolDefinitions = createToolDefinitions(prisma);

    // Stream response
    const result = streamText({
      model: getModel(resolvedModelId),
      system,
      messages: allMessages,
      tools: toolDefinitions,
      stopWhen: stepCountIs(5),
      onFinish: async ({ text, steps, usage }) => {
        // Collect tool calls with results from all steps
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

        // Re-read aiName from DB — if setAiName ran, it already wrote the new name
        let effectiveAiName = aiName;
        try {
          const latest = await prisma.message.findFirst({
            where: { aiName: { not: null } },
            orderBy: { createdAt: "desc" },
            select: { aiName: true },
          });
          if (latest?.aiName) effectiveAiName = latest.aiName;
        } catch {}

        // Save assistant response
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
              effectiveAiName
            );
          }
        } catch (e) {
          console.error("Failed to save assistant message:", e);
        }

        maybeSummarize(prisma).catch(console.error);
      },
    });

    return result.toUIMessageStreamResponse();
  } catch (error: any) {
    console.error("Chat error:", error);
    return Response.json(
      { error: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}
