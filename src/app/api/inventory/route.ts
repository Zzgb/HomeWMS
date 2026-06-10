import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { inventoryService } from "@/services/inventory.service";

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

    const stockList = await inventoryService.getStockList(prisma);
    return NextResponse.json(stockList);
  } catch (error) {
    console.error("GET /api/inventory error:", error);
    return NextResponse.json(
      { error: "获取库存列表失败" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { storeId, name, desc, category } = await request.json();
    if (!storeId || !name) {
      return NextResponse.json({ error: "缺少 storeId 或 name" }, { status: 400 });
    }

    const prisma = getPrisma(storeId);
    if (!prisma) {
      return NextResponse.json({ error: "仓库未找到或未连接" }, { status: 404 });
    }

    const result = await inventoryService.createItem(prisma, name, desc, category);
    return NextResponse.json(result);
  } catch (error) {
    console.error("POST /api/inventory error:", error);
    return NextResponse.json({ error: "创建物品失败" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { storeId, id, name, desc, category, qty, status, spotId, expiryDate } = body;
    if (!storeId || !id) {
      return NextResponse.json({ error: "缺少 storeId 或 id" }, { status: 400 });
    }

    const prisma = getPrisma(storeId);
    if (!prisma) {
      return NextResponse.json({ error: "仓库未找到或未连接" }, { status: 404 });
    }

    // If item fields present, update item; otherwise update stock
    if (name !== undefined || desc !== undefined || category !== undefined) {
      const result = await inventoryService.updateItem(prisma, id, { name, desc, category });
      return NextResponse.json(result);
    }

    if (qty !== undefined || status !== undefined || spotId !== undefined || expiryDate !== undefined) {
      const result = await inventoryService.updateStock(prisma, id, { qty, status, spotId, expiryDate });
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: "没有可更新的字段" }, { status: 400 });
  } catch (error) {
    console.error("PUT /api/inventory error:", error);
    return NextResponse.json({ error: "更新失败" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const storeId = searchParams.get("storeId");
    const id = searchParams.get("id");
    const type = searchParams.get("type") || "item";

    if (!storeId || !id) {
      return NextResponse.json({ error: "缺少 storeId 或 id" }, { status: 400 });
    }

    const prisma = getPrisma(storeId);
    if (!prisma) {
      return NextResponse.json({ error: "仓库未找到或未连接" }, { status: 404 });
    }

    const result = type === "stock"
      ? await inventoryService.deleteStock(prisma, id)
      : await inventoryService.deleteItem(prisma, id);

    return NextResponse.json(result);
  } catch (error) {
    console.error("DELETE /api/inventory error:", error);
    return NextResponse.json({ error: "删除失败" }, { status: 500 });
  }
}
