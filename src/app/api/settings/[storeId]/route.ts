import { NextRequest, NextResponse } from "next/server";
import { getWarehouseConfig, updateWarehouse, saveStoreMeta, loadApprovedRegex } from "@/lib/connections";
import { getPrisma } from "@/lib/prisma";
import { SYSTEM_PROMPT } from "@/lib/prompts";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ storeId: string }> }
) {
  try {
    const { storeId } = await params;

    const config = getWarehouseConfig(storeId);
    if (!config) {
      return NextResponse.json(
        { error: "仓库未找到" },
        { status: 404 }
      );
    }

    // 云端模式从 DB StoreMeta 加载模型配置，不从 warehouses.json 读
    let dbModelId = "";
    let dbCustomPrompt = "";
    let dbMemorySize = 200;
    if (config.deploymentMode && config.deploymentMode !== "local") {
      const prisma = getPrisma(storeId);
      if (prisma) {
        try {
          const { loadStoreMeta } = await import("@/lib/connections");
          const meta = await loadStoreMeta(prisma);
          dbModelId = meta.modelId || "";
          dbCustomPrompt = meta.customPrompt || "";
          dbMemorySize = meta.memorySize ? parseInt(String(meta.memorySize), 10) : 200;
        } catch {}
      }
    }

    return NextResponse.json({
      modelId: dbModelId || config.modelId || "",
      memorySize: dbMemorySize || config.memorySize || 200,
      customPrompt: dbCustomPrompt || config.customPrompt || SYSTEM_PROMPT,
      summaryEnabled: config.summaryEnabled ?? false,
      summaryThreshold: config.summaryThreshold || 50,
      summaryCount: config.summaryCount || 3,
      contextMode: config.contextMode || "recent",
      debugMode: config.debugMode ?? false,
      deploymentMode: config.deploymentMode || "local",
      customRegexRules: await loadCustomRegexRules(storeId),
    });
  } catch (error) {
    console.error("GET /api/settings/[storeId] error:", error);
    return NextResponse.json(
      { error: "获取仓库配置失败" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ storeId: string }> }
) {
  try {
    const { storeId } = await params;
    const body = await request.json();
    const { name, modelId, memorySize, customPrompt, summaryEnabled, summaryThreshold, summaryCount, contextMode, debugMode, deploymentMode, activeLlmConfigId } = body;

    // 云端模式：模型配置存入 DB StoreMeta，不写 warehouses.json
    const config = getWarehouseConfig(storeId);
    const isCloud = config?.deploymentMode && config.deploymentMode !== "local";
    if (isCloud) {
      const prisma = getPrisma(storeId);
      if (prisma) {
        const meta: Record<string, string> = {};
        if (modelId !== undefined) meta.modelId = modelId;
        if (customPrompt !== undefined) meta.customPrompt = customPrompt;
        if (memorySize !== undefined) meta.memorySize = String(memorySize);
        if (Object.keys(meta).length > 0) {
          await saveStoreMeta(prisma, meta).catch(() => {});
        }
      }
    } else {
      const result = updateWarehouse(storeId, {
        ...(name !== undefined ? { name } : {}),
        ...(modelId !== undefined ? { modelId } : {}),
        ...(memorySize !== undefined ? { memorySize: Number(memorySize) } : {}),
        ...(customPrompt !== undefined ? { customPrompt } : {}),
        ...(summaryEnabled !== undefined ? { summaryEnabled } : {}),
        ...(summaryThreshold !== undefined ? { summaryThreshold: Number(summaryThreshold) } : {}),
        ...(summaryCount !== undefined ? { summaryCount: Number(summaryCount) } : {}),
        ...(contextMode !== undefined ? { contextMode } : {}),
        ...(debugMode !== undefined ? { debugMode } : {}),
        ...(deploymentMode !== undefined ? { deploymentMode } : {}),
      });
      if (!result.success) {
        return NextResponse.json(
          { error: result.error || "更新仓库配置失败" },
          { status: 400 }
        );
      }
    }

    // Persist active LLM config to StoreMeta
    if (activeLlmConfigId !== undefined) {
      const prisma = getPrisma(storeId);
      if (prisma) {
        await saveStoreMeta(prisma, { activeLlmConfigId }).catch(() => {});
      }
    }

    // Persist custom regex rules — merge with existing, skip duplicates
    if (body.customRegexRules !== undefined) {
      const prisma = getPrisma(storeId);
      if (prisma) {
        const existing = await loadApprovedRegex(prisma).catch(() => [] as { pattern: string; action: string }[]);
        const incoming = (body.customRegexRules || []).map((r: any) => ({
          pattern: r.pattern || r.source || "",
          action: r.action || "query",
        }));
        // Merge: keep existing, add only new patterns
        for (const rule of incoming) {
          if (rule.pattern && !existing.some((e) => e.pattern === rule.pattern)) {
            existing.push(rule);
          }
        }
        await saveStoreMeta(prisma, {
          custom_regex_rules: JSON.stringify(existing),
        }).catch(() => {});
      }
    }

    return NextResponse.json({ success: true, message: "仓库配置更新成功" });
  } catch (error) {
    console.error("PUT /api/settings/[storeId] error:", error);
    return NextResponse.json(
      { error: "更新仓库配置失败" },
      { status: 500 }
    );
  }
}

/** Load regex rules — auto-seeds from REGEX_RULES on first access */
async function loadCustomRegexRules(storeId: string) {
  try {
    const prisma = getPrisma(storeId);
    if (!prisma) return [];
    return await loadApprovedRegex(prisma);
  } catch {
    return [];
  }
}
