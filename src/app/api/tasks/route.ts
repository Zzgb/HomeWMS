import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";

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

    const tasks = await prisma.task.findMany({
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(tasks);
  } catch (error) {
    console.error("GET /api/tasks error:", error);
    return NextResponse.json(
      { error: "获取任务列表失败" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { storeId, type, cron, enabled } = body;

    if (!storeId) {
      return NextResponse.json(
        { error: "请求体中缺少 storeId" },
        { status: 400 }
      );
    }

    if (!type || !cron) {
      return NextResponse.json(
        { error: "type 和 cron 为必填项" },
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

    const task = await prisma.task.create({
      data: {
        type,
        cron,
        enabled: enabled !== undefined ? enabled : true,
      },
    });

    return NextResponse.json(task, { status: 201 });
  } catch (error) {
    console.error("POST /api/tasks error:", error);
    return NextResponse.json(
      { error: "创建任务失败" },
      { status: 500 }
    );
  }
}
