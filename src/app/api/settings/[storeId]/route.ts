import { NextRequest, NextResponse } from "next/server";
import { getWarehouseConfig, updateWarehouse } from "@/lib/connections";
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
    const { name, modelId, memorySize, customPrompt } = body;

    const result = updateWarehouse(storeId, {
      ...(name !== undefined ? { name } : {}),
      ...(modelId !== undefined ? { modelId } : {}),
      ...(memorySize !== undefined ? { memorySize: Number(memorySize) } : {}),
      ...(customPrompt !== undefined ? { customPrompt } : {}),
    });
    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "更新仓库配置失败" },
        { status: 400 }
      );
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
