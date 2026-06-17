import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { inventoryService } from "@/services/inventory.service";
import { messageService } from "@/services/message.service";

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
      const result = await inventoryService.updateExpiryStatus(prisma);
      const msg = result.updated > 0
        ? `[保质期检查] 发现 ${result.updated} 个库存已过期，已自动标记为过期状态。`
        : `[保质期检查] 未发现过期物品。`;
      await messageService.saveMessage(prisma, "assistant", msg);
      return NextResponse.json(result);
    }

    const result = await inventoryService.checkStock(prisma);
    const parts: string[] = [];
    if (result.damagedItems.length > 0) {
      const names = result.damagedItems.map((i) => i.itemName).join("、");
      parts.push(`损坏/过期物品 (${result.damagedItems.length}): ${names}`);
    }
    if (result.unusedItems.length > 0) {
      const names = result.unusedItems.slice(0, 10).map((i) => i.itemName).join("、");
      const more = result.unusedItems.length > 10 ? ` 等${result.unusedItems.length}项` : "";
      parts.push(`长期未使用 (${result.unusedItems.length}): ${names}${more}`);
    }
    const msg = parts.length > 0
      ? `[定时盘点] ${parts.join("; ")}`
      : `[定时盘点] 库存状态正常，无异常物品。`;
    await messageService.saveMessage(prisma, "assistant", msg);
    return NextResponse.json(result);
  } catch (error) {
    console.error("GET /api/cron/run error:", error);
    return NextResponse.json(
      { error: "执行定时任务失败" },
      { status: 500 }
    );
  }
}
