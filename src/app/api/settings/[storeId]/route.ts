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

    // Return config fields needed by frontend
    return NextResponse.json({
      modelId: config.modelId || "",
      memorySize: config.memorySize || 200,
      customPrompt: config.customPrompt || SYSTEM_PROMPT,
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

    // Persist active LLM config to StoreMeta
    if (activeLlmConfigId !== undefined) {
      const prisma = getPrisma(storeId);
      if (prisma) {
        await saveStoreMeta(prisma, { activeLlmConfigId }).catch(() => {});
      }
    }

    // Persist custom regex rules to StoreMeta (strip to minimal format)
    if (body.customRegexRules !== undefined) {
      const prisma = getPrisma(storeId);
      if (prisma) {
        const minimal = (body.customRegexRules || []).map((r: any) => ({
          pattern: r.pattern || r.source || "",
          action: r.action || "query",
        }));
        await saveStoreMeta(prisma, {
          custom_regex_rules: JSON.stringify(minimal),
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
