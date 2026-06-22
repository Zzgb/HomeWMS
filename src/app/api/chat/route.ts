import { runAgent } from "@/agent";
import { maybeSummarize } from "@/agent/summarizer";
import { createToolDefinitions } from "@/tools";
import { getPrisma } from "@/lib/prisma";
import { DEFAULT_MEMORY_SIZE, DEFAULT_MODEL } from "@/lib/constants";

export async function POST(req: Request) {
  try {
    const { messages, storeId, language, dbUrl, warehouseName: clientWarehouseName } = await req.json();

    if (!storeId) {
      return Response.json({ error: "storeId is required" }, { status: 400 });
    }

    // ── Connect ──
    let prisma = getPrisma(storeId);
    // 云端模式：缓存未命中时用客户端传来的 dbUrl 即时建连接
    if (!prisma && dbUrl) {
      const { registerFromUrl } = await import("@/lib/connections");
      const result = await registerFromUrl(dbUrl);
      if (result.success) {
        prisma = getPrisma(storeId);
      }
    }
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
    const customPrompt = cfg?.customPrompt;
    const deploymentMode = cfg?.deploymentMode || "local";

    // ── LLM keys: cloud deployments load from DB ──
    let activeModelId = modelId;
    if (deploymentMode !== "local") {
      const { setLLMKeyOverrides } = await import("@/agent/router");
      const { loadLLMConfigs, loadStoreMeta } = await import("@/lib/connections");
      try {
        const configs = await loadLLMConfigs(prisma);
        if (configs.length > 0) {
          const map: Record<string, { apiKey: string; baseURL?: string }> = {};
          for (const c of configs) map[c.provider] = { apiKey: c.apiKey, baseURL: c.baseURL || undefined };
          setLLMKeyOverrides(map);
          const meta = await loadStoreMeta(prisma);
          const activeId = meta.activeLlmConfigId;
          if (activeId) {
            const active = configs.find((c) => c.id === activeId);
            if (active) activeModelId = `${active.provider}/${active.modelId}`;
          }
        } else {
          // 云端模式无 LLM 配置：显式设空避免回退到 .env key
          setLLMKeyOverrides({});
        }
      } catch {
        setLLMKeyOverrides({});
      }
    }
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
    const { stream, intents, toolResults, conflicts } = await runAgent({
      prisma,
      modelId: activeModelId,
      userMessage: userText,
      language: language || "zh",
      warehouseName: clientWarehouseName || cfg?.name || storeId,
      aiName,
      memorySize,
      contextMode: contextMode as "recent" | "summary" | "hybrid",
      summaryCount: summaryCount || 3,
      customPrompt: customPrompt || undefined,
      tools,
      signal: req.signal,
    });

    // ── Debug log ──
    if (debugMode) {
      try {
        await prisma.log.create({
          data: {
            action: "debug",
            note: JSON.stringify({
              intents,
              toolResults: toolResults.map((tr) => ({
                toolName: tr.toolName,
                args: tr.args,
                success: tr.success,
              })),
              conflicts: conflicts.map((c: any) => ({
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
