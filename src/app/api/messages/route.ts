import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { messageService } from "@/services/message.service";

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const storeId = searchParams.get("storeId");
    const mode = searchParams.get("mode") || "full";

    if (!storeId) {
      return NextResponse.json({ error: "storeId is required" }, { status: 400 });
    }

    const prisma = getPrisma(storeId);
    if (!prisma) {
      return NextResponse.json({ error: "Warehouse not connected" }, { status: 404 });
    }

    let result: { deleted: number; aiName: string };

    if (mode === "compress") {
      const cfg = (await import("@/lib/connections")).getWarehouseConfig(storeId);
      const modelId = cfg?.modelId;
      result = await messageService.compressAndDelete(prisma, modelId);
    } else {
      result = await messageService.deleteAll(prisma);
    }

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("DELETE /api/messages error:", error);
    return NextResponse.json({ error: "Failed to delete messages" }, { status: 500 });
  }
}
