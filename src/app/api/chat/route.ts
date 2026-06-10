import { runAgent } from "@/agent";
import { maybeSummarize } from "@/agent/summarizer";
import { createToolDefinitions } from "@/tools";
import { getPrisma } from "@/lib/prisma";
import { DEFAULT_MEMORY_SIZE, DEFAULT_MODEL } from "@/lib/constants";

export async function POST(req: Request) {
  try {
    const { messages, storeId, language } = await req.json();

    if (!storeId) {
      return Response.json({ error: "storeId is required" }, { status: 400 });
    }

    // ── Connect ──
    const prisma = getPrisma(storeId);
    if (!prisma) {
      return Response.json(
        { error: `仓库 "${storeId}" 连接失败。请去设置→仓库管理检查连接是否正常。` },
        { status: 404 }
      );
    }

    // ── Config ──
    const { getWarehouseConfig } = await import("@/lib/connections");
    const cfg = getWarehouseConfig(storeId);
    const modelId = cfg?.modelId || DEFAULT_MODEL;
    const memorySize = cfg?.memorySize || DEFAULT_MEMORY_SIZE;
    const summaryEnabled = cfg?.summaryEnabled ?? false;
    const summaryThreshold = cfg?.summaryThreshold;
    const summaryCount = cfg?.summaryCount;
    const contextMode = cfg?.contextMode || "recent";
    const debugMode = cfg?.debugMode ?? false;

    // ── AI name ──
    let aiName = "小鞠";
    try {
      const lastWithName = await prisma.message.findFirst({
        where: { aiName: { not: null } },
        orderBy: { createdAt: "desc" },
        select: { aiName: true },
      });
      if (lastWithName?.aiName) aiName = lastWithName.aiName;
    } catch {}

    // ── Extract user message text ──
    const lastUserMsg = messages[messages.length - 1];
    const userText =
      typeof lastUserMsg?.content === "string"
        ? lastUserMsg.content
        : lastUserMsg?.parts
            ?.filter((p: any) => p.type === "text")
            .map((p: any) => p.text)
            .join("") || "";

    if (!userText.trim()) {
      return Response.json({ error: "Empty message" }, { status: 400 });
    }

    // ── Save user message ──
    try {
      const { messageService } = await import("@/services/message.service");
      await messageService.saveMessage(prisma, "user", userText, undefined, undefined, aiName);
    } catch (e) {
      console.error("Failed to save user message:", e);
    }

    // ── Tool definitions ──
    const tools = createToolDefinitions(prisma);

    // ── Run agent (4 layers) ──
    const { stream, intent, toolResults, conflicts } = await runAgent({
      prisma,
      modelId,
      userMessage: userText,
      language: language || "zh",
      warehouseName: cfg?.name || storeId,
      aiName,
      memorySize,
      contextMode: contextMode as "recent" | "summary" | "hybrid",
      summaryCount: summaryCount || 3,
      tools,
    });

    // ── Debug log ──
    if (debugMode) {
      try {
        await prisma.log.create({
          data: {
            action: "debug",
            note: JSON.stringify({
              intent,
              toolResults: toolResults.map((tr) => ({
                toolName: tr.toolName,
                args: tr.args,
                success: tr.success,
              })),
              conflicts: conflicts.map((c) => ({
                itemName: c.itemName,
                field: c.field,
                dbValue: c.dbValue,
                contextValue: c.contextValue,
              })),
              config: { contextMode, memorySize, modelId },
            }, null, 2),
          },
        });
      } catch {}
    }

    // ── Summarize (fire and forget) ──
    maybeSummarize(prisma, { enabled: summaryEnabled, threshold: summaryThreshold }).catch(
      console.error
    );

    return stream.toUIMessageStreamResponse();
  } catch (error: any) {
    console.error("Chat error:", error);
    return Response.json(
      { error: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}
