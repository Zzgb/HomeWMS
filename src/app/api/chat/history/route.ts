import { getPrisma } from "@/lib/prisma";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const storeId = searchParams.get("storeId");
    const limit = parseInt(searchParams.get("limit") || "200");

    if (!storeId) {
      return Response.json({ error: "storeId is required" }, { status: 400 });
    }

    const prisma = getPrisma(storeId);
    if (!prisma) {
      return Response.json(
        { error: "Warehouse not found or not connected" },
        { status: 404 }
      );
    }

    const messages = await prisma.message.findMany({
      where: { role: { not: "system" } },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return Response.json({
      messages: messages.reverse().map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        toolCalls: m.toolCalls,
        aiName: m.aiName,
        createdAt: m.createdAt.toISOString(),
      })),
    });
  } catch (error: any) {
    return Response.json(
      { error: error?.message || "Failed to load history" },
      { status: 500 }
    );
  }
}
