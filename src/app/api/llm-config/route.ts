import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { loadLLMConfigs, saveLLMConfig, deleteLLMConfig } from "@/lib/connections";

export async function GET(request: NextRequest) {
  try {
    const storeId = request.nextUrl.searchParams.get("storeId");
    if (!storeId) {
      return NextResponse.json({ error: "storeId is required" }, { status: 400 });
    }

    const prisma = getPrisma(storeId);
    if (!prisma) {
      return NextResponse.json({ error: "Warehouse not connected" }, { status: 404 });
    }

    const configs = await loadLLMConfigs(prisma);
    return NextResponse.json(configs);
  } catch (error) {
    console.error("GET /api/llm-config error:", error);
    return NextResponse.json({ error: "Failed to load LLM configs" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const storeId = request.nextUrl.searchParams.get("storeId");
    if (!storeId) {
      return NextResponse.json({ error: "storeId is required" }, { status: 400 });
    }

    const prisma = getPrisma(storeId);
    if (!prisma) {
      return NextResponse.json({ error: "Warehouse not connected" }, { status: 404 });
    }

    const body = await request.json();
    const { id, provider, modelId, apiKey, baseURL, label } = body;
    if (!provider || !apiKey) {
      return NextResponse.json({ error: "provider and apiKey are required" }, { status: 400 });
    }

    await saveLLMConfig(prisma, id || null, provider, modelId || "", apiKey, baseURL || undefined, label || undefined);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("PUT /api/llm-config error:", error);
    return NextResponse.json({ error: "Failed to save LLM config" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const storeId = request.nextUrl.searchParams.get("storeId");
    const id = request.nextUrl.searchParams.get("id");
    if (!storeId || !id) {
      return NextResponse.json({ error: "storeId and id are required" }, { status: 400 });
    }

    const prisma = getPrisma(storeId);
    if (!prisma) {
      return NextResponse.json({ error: "Warehouse not connected" }, { status: 404 });
    }

    await deleteLLMConfig(prisma, id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/llm-config error:", error);
    return NextResponse.json({ error: "Failed to delete LLM config" }, { status: 500 });
  }
}
