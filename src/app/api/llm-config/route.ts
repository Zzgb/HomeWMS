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
    const { provider, apiKey, baseURL } = body;
    if (!provider || !apiKey) {
      return NextResponse.json({ error: "provider and apiKey are required" }, { status: 400 });
    }

    await saveLLMConfig(prisma, provider, apiKey, baseURL || undefined);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("PUT /api/llm-config error:", error);
    return NextResponse.json({ error: "Failed to save LLM config" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const storeId = request.nextUrl.searchParams.get("storeId");
    const provider = request.nextUrl.searchParams.get("provider");
    if (!storeId || !provider) {
      return NextResponse.json({ error: "storeId and provider are required" }, { status: 400 });
    }

    const prisma = getPrisma(storeId);
    if (!prisma) {
      return NextResponse.json({ error: "Warehouse not connected" }, { status: 404 });
    }

    await deleteLLMConfig(prisma, provider);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/llm-config error:", error);
    return NextResponse.json({ error: "Failed to delete LLM config" }, { status: 500 });
  }
}
