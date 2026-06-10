import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { inventoryService } from "@/services/inventory.service";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { storeId, unusedDaysThreshold = 30 } = body;

    if (!storeId) {
      return NextResponse.json(
        { error: "请求体中缺少 storeId" },
        { status: 400 }
      );
    }

    const prisma = getPrisma(storeId);
    if (!prisma) {
      return NextResponse.json(
        { error: "仓库未找到或未连接" },
        { status: 404 }
      );
    }

    const results = await inventoryService.checkStock(prisma, unusedDaysThreshold);
    return NextResponse.json(results);
  } catch (error) {
    console.error("POST /api/inventory/check error:", error);
    return NextResponse.json(
      { error: "库存检查失败" },
      { status: 500 }
    );
  }
}
