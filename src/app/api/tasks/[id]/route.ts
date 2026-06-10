import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { storeId, cron, enabled, type } = body;

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

    const data: { cron?: string; enabled?: boolean; type?: string } = {};
    if (cron !== undefined) data.cron = cron;
    if (enabled !== undefined) data.enabled = enabled;
    if (type !== undefined) data.type = type;

    const task = await prisma.task.update({
      where: { id },
      data,
    });

    return NextResponse.json(task);
  } catch (error) {
    console.error("PUT /api/tasks/[id] error:", error);
    return NextResponse.json(
      { error: "更新任务失败" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { storeId } = body;

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

    const task = await prisma.task.delete({ where: { id } });
    return NextResponse.json(task);
  } catch (error) {
    console.error("DELETE /api/tasks/[id] error:", error);
    return NextResponse.json(
      { error: "删除任务失败" },
      { status: 500 }
    );
  }
}
