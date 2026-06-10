import { assembleContext } from "@/agent/context";
import { executeStream } from "@/agent/execute";
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

    // ── Save user message ──
    const lastUserMsg = messages[messages.length - 1];
    if (lastUserMsg?.role === "user") {
      try {
        const { messageService } = await import("@/services/message.service");
        const userText =
          typeof lastUserMsg.content === "string"
            ? lastUserMsg.content
            : lastUserMsg.parts
                ?.filter((p: any) => p.type === "text")
                .map((p: any) => p.text)
                .join("") || "(empty)";
        await messageService.saveMessage(prisma, "user", userText, undefined, undefined, aiName);
      } catch (e) {
        console.error("Failed to save user message:", e);
      }
    }

    // ── Context ──
    const ctx = await assembleContext(
      prisma,
      cfg?.name || storeId,
      memorySize,
      aiName,
      storeId,
      contextMode,
      summaryCount,
      language
    );

    // Convert client messages + dedup
    const clientModelMessages = messages.map((m: any) => ({
      role: m.role as "user" | "assistant",
      content:
        typeof m.content === "string"
          ? m.content
          : m.parts
              ?.filter((p: any) => p.type === "text")
              .map((p: any) => p.text)
              .join("") || "",
    }));

    // ── Build two-phase messages ──
    const clientIds = new Set(messages.map((m: any) => m.id).filter(Boolean));
    const filteredDbMessages = ctx.messages.filter((m: any) => !clientIds.has(m.id));
    const combined = [...filteredDbMessages, ...clientModelMessages];
    const contextMessages = combined.length > memorySize
      ? combined.slice(-memorySize)
      : combined;

    // Phase 1: NO context — forces model to call tools
    const phase1Messages = [
      ...clientModelMessages.slice(-2),
      { role: "system" as const, content: "Call findItem NOW. Get real database data. Do NOT use memory or guess." },
    ];

    // Phase 2: WITH context — for comparison and rhetoric after tool results
    const phase2Messages = [
      { role: "system" as const, content: "⬇️ REFERENCE CONTEXT — may be wrong. Compare with DB results above. DB wins if conflict." },
      ...contextMessages,
      { role: "system" as const, content: "⬆️ Compare DB results with context. Generate final response using verified DB data. If context contradicts DB, note the correction." },
    ];

    // ── Debug log ──
    if (debugMode) {
      try {
        await prisma.log.create({
          data: {
            action: "debug",
            note: `Context debug | mode=${contextMode} memorySize=${memorySize} phase1=${phase1Messages.length} phase2=${phase2Messages.length}\n${JSON.stringify({ config: { contextMode, memorySize }, system: ctx.system.slice(0, 2000), phase2: phase2Messages.map((m: any, i: number) => ({ idx: i, role: m.role, content: (m.content || "").slice(0, 300) })) }, null, 2)}`,
          },
        });
      } catch {}
    }

    // ── Execute ──
    const tools = createToolDefinitions(prisma);
    const result = await executeStream({
      prisma,
      modelId,
      system: ctx.system,
      phase1Messages,
      phase2Messages,
      tools,
      aiName,
    });

    // ── Summarize ──
    maybeSummarize(prisma, { enabled: summaryEnabled, threshold: summaryThreshold }).catch(
      console.error
    );

    return result.toUIMessageStreamResponse();
  } catch (error: any) {
    console.error("Chat error:", error);
    return Response.json(
      { error: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}
