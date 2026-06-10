import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { inventoryService } from "@/services/inventory.service";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const secret = searchParams.get("secret");
    const storeId = searchParams.get("storeId");

    // Validate secret
    if (!secret || secret !== process.env.CRON_SECRET) {
      return NextResponse.json(
        { error: "未授权访问" },
        { status: 401 }
      );
    }

    if (!storeId) {
      return NextResponse.json(
        { error: "缺少 storeId 查询参数" },
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

    const action = searchParams.get("action") || "check_stock";

    if (action === "expiry_check") {
      const results = await inventoryService.updateExpiryStatus(prisma);
      return NextResponse.json(results);
    }

    const results = await inventoryService.checkStock(prisma);
    return NextResponse.json(results);
  } catch (error) {
    console.error("GET /api/cron/run error:", error);
    return NextResponse.json(
      { error: "执行定时任务失败" },
      { status: 500 }
    );
  }
}
