import { NextRequest, NextResponse } from "next/server";
import { storeService } from "@/services/store.service";
import { disconnectWarehouse } from "@/lib/connections";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { name, host, port, user, password, database } = body;

    // Clear cached client if connection params changed
    if (host || port || user || password || database) {
      disconnectWarehouse(id);
    }

    const result = storeService.updateStore(id, {
      ...(name !== undefined ? { name } : {}),
      ...(host !== undefined ? { host } : {}),
      ...(port !== undefined ? { port: parseInt(port) || 5432 } : {}),
      ...(user !== undefined ? { user } : {}),
      ...(password !== undefined ? { password } : {}),
      ...(database !== undefined ? { database } : {}),
    });
    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "更新仓库失败" },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, message: "仓库更新成功" });
  } catch (error) {
    console.error("PUT /api/stores/[id] error:", error);
    return NextResponse.json(
      { error: "更新仓库失败" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const result = storeService.deleteStore(id);
    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "删除仓库失败" },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, message: "仓库删除成功" });
  } catch (error) {
    console.error("DELETE /api/stores/[id] error:", error);
    return NextResponse.json(
      { error: "删除仓库失败" },
      { status: 500 }
    );
  }
}
