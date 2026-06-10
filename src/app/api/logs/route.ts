import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { logService } from "@/services/log.service";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const storeId = searchParams.get("storeId");

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

    const action = searchParams.get("action") || undefined;
    const from = searchParams.get("from") || undefined;
    const to = searchParams.get("to") || undefined;
    const page = searchParams.get("page")
      ? parseInt(searchParams.get("page")!, 10)
      : undefined;
    const pageSize = searchParams.get("pageSize")
      ? parseInt(searchParams.get("pageSize")!, 10)
      : undefined;

    const results = await logService.queryLogs(prisma, {
      action,
      from,
      to,
      page,
      pageSize,
    });

    return NextResponse.json(results);
  } catch (error) {
    console.error("GET /api/logs error:", error);
    return NextResponse.json(
      { error: "查询日志失败" },
      { status: 500 }
    );
  }
}
