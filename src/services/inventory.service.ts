import type { PrismaClient } from "@/generated/prisma/client";

export const inventoryService = {
  async findItems(prisma: PrismaClient, keyword: string) {
    return prisma.item.findMany({
      where: {
        name: { contains: keyword, mode: "insensitive" },
      },
      include: {
        stocks: { include: { spot: true } },
      },
      orderBy: { name: "asc" },
    });
  },

  async getSpotTree(prisma: PrismaClient) {
    const spots = await prisma.spot.findMany({
      include: { children: true },
      orderBy: { name: "asc" },
    });
    return spots.filter((s) => !s.parentId);
  },

  async getStockList(prisma: PrismaClient) {
    return prisma.stock.findMany({
      include: {
        item: true,
        spot: true,
      },
      orderBy: [{ item: { name: "asc" } }, { spot: { name: "asc" } }],
    });
  },

  async stockIn(
    prisma: PrismaClient,
    itemName: string,
    qty: number,
    spotName: string,
    note?: string,
    expiryDate?: string,
    category?: string,
    status?: string
  ) {
    return prisma.$transaction(async (tx) => {
      // Find or create item
      let item = await tx.item.findFirst({
        where: { name: { equals: itemName, mode: "insensitive" } },
      });
      if (!item) {
        item = await tx.item.create({
          data: { name: itemName, category },
        });
      } else if (category && !item.category) {
        // Update category if item exists but has no category
        await tx.item.update({ where: { id: item.id }, data: { category } });
      }

      // Find or create spot
      let spot = await tx.spot.findFirst({
        where: { name: { equals: spotName, mode: "insensitive" } },
      });
      if (!spot) {
        spot = await tx.spot.create({
          data: { name: spotName },
        });
      }

      // Determine effective status
      const expiry = expiryDate ? new Date(expiryDate) : null;
      const isExpired = expiry && expiry < new Date();
      const effectiveStatus = isExpired ? "expired" : (status || "normal");

      // Upsert stock
      const stock = await tx.stock.upsert({
        where: {
          itemId_spotId: { itemId: item.id, spotId: spot.id },
        },
        create: { itemId: item.id, spotId: spot.id, qty, expiryDate: expiry, status: effectiveStatus },
        update: { qty: { increment: qty } },
      });

      // Create log
      const log = await tx.log.create({
        data: {
          itemId: item.id,
          action: "in",
          qty,
          toSpot: spot.id,
          note: note || `Stock in: ${itemName} +${qty} at ${spotName}`,
        },
      });

      return {
        success: true,
        message: `Added ${qty} ${itemName} to ${spotName}. Total: ${stock.qty}`,
        logId: log.id,
      };
    });
  },

  async consumeItem(
    prisma: PrismaClient,
    itemName: string,
    qty: number,
    spotName: string,
    note?: string
  ) {
    return prisma.$transaction(async (tx) => {
      // Find item
      const item = await tx.item.findFirst({
        where: { name: { equals: itemName, mode: "insensitive" } },
      });
      if (!item) {
        return { success: false, message: `Item "${itemName}" not found.` };
      }

      // Find spot
      const spot = await tx.spot.findFirst({
        where: { name: { equals: spotName, mode: "insensitive" } },
      });
      if (!spot) {
        return { success: false, message: `Location "${spotName}" not found.` };
      }

      // Find stock
      const stock = await tx.stock.findUnique({
        where: {
          itemId_spotId: { itemId: item.id, spotId: spot.id },
        },
      });
      if (!stock) {
        return {
          success: false,
          message: `No stock of "${itemName}" found at "${spotName}".`,
        };
      }
      if (stock.qty < qty) {
        return {
          success: false,
          message: `Insufficient stock. ${itemName} at ${spotName} has ${stock.qty}, but you requested ${qty}.`,
        };
      }

      // Decrement or delete stock
      const newQty = stock.qty - qty;
      if (newQty <= 0) {
        await tx.stock.delete({ where: { id: stock.id } });
      } else {
        await tx.stock.update({
          where: { id: stock.id },
          data: { qty: { decrement: qty } },
        });
      }

      // Create log
      const log = await tx.log.create({
        data: {
          itemId: item.id,
          action: "out",
          qty: -qty,
          fromSpot: spot.id,
          note: note || `Consumed: ${itemName} -${qty} from ${spotName}`,
        },
      });

      return {
        success: true,
        message: `Removed ${qty} ${itemName} from ${spotName}.${newQty > 0 ? ` Remaining: ${newQty}` : " Stock cleared."}`,
        logId: log.id,
      };
    });
  },

  async moveItem(
    prisma: PrismaClient,
    itemName: string,
    fromSpotName: string,
    toSpotName: string,
    qty: number
  ) {
    return prisma.$transaction(async (tx) => {
      // Find item
      const item = await tx.item.findFirst({
        where: { name: { equals: itemName, mode: "insensitive" } },
      });
      if (!item) {
        return { success: false, message: `Item "${itemName}" not found.` };
      }

      // Find source spot
      const fromSpot = await tx.spot.findFirst({
        where: { name: { equals: fromSpotName, mode: "insensitive" } },
      });
      if (!fromSpot) {
        return { success: false, message: `Source location "${fromSpotName}" not found.` };
      }

      // Find source stock
      const fromStock = await tx.stock.findUnique({
        where: {
          itemId_spotId: { itemId: item.id, spotId: fromSpot.id },
        },
      });
      if (!fromStock || fromStock.qty < qty) {
        return {
          success: false,
          message: `Insufficient stock. ${itemName} at ${fromSpotName} has ${fromStock?.qty ?? 0}, but you requested ${qty}.`,
        };
      }

      // Find or create target spot
      let toSpot = await tx.spot.findFirst({
        where: { name: { equals: toSpotName, mode: "insensitive" } },
      });
      if (!toSpot) {
        toSpot = await tx.spot.create({
          data: { name: toSpotName },
        });
      }

      // Decrement or delete source
      const newQty = fromStock.qty - qty;
      if (newQty <= 0) {
        await tx.stock.delete({ where: { id: fromStock.id } });
      } else {
        await tx.stock.update({
          where: { id: fromStock.id },
          data: { qty: { decrement: qty } },
        });
      }

      // Upsert target
      await tx.stock.upsert({
        where: {
          itemId_spotId: { itemId: item.id, spotId: toSpot.id },
        },
        create: { itemId: item.id, spotId: toSpot.id, qty },
        update: { qty: { increment: qty } },
      });

      // Create log
      const log = await tx.log.create({
        data: {
          itemId: item.id,
          action: "move",
          qty,
          fromSpot: fromSpot.id,
          toSpot: toSpot.id,
          note: `Moved: ${itemName} x${qty} from ${fromSpotName} to ${toSpotName}`,
        },
      });

      return {
        success: true,
        message: `Moved ${qty} ${itemName} from ${fromSpotName} to ${toSpotName}.`,
        logId: log.id,
      };
    });
  },

  async checkStock(prisma: PrismaClient, unusedDaysThreshold: number = 30) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - unusedDaysThreshold);

    // Find items that haven't been used (no log entries) since cutoff
    const recentItems = await prisma.log.findMany({
      where: {
        createdAt: { gte: cutoff },
        itemId: { not: null },
      },
      select: { itemId: true },
      distinct: ["itemId"],
    });
    const recentItemIds = recentItems.map((l) => l.itemId!);

    const unusedItems = await prisma.stock.findMany({
      where: {
        qty: { gt: 0 },
        ...(recentItemIds.length > 0
          ? { itemId: { notIn: recentItemIds } }
          : {}),
      },
      include: { item: true, spot: true },
      orderBy: { updatedAt: "asc" },
    });

    const damagedItems = await prisma.stock.findMany({
      where: {
        status: { in: ["damaged", "expired"] },
        qty: { gt: 0 },
      },
      include: { item: true, spot: true },
    });

    const expiredByDate = await prisma.stock.findMany({
      where: {
        expiryDate: { lt: new Date() },
        status: "normal",
        qty: { gt: 0 },
      },
      include: { item: true, spot: true },
    });

    return {
      unusedItems: unusedItems.map((s) => ({
        itemName: s.item.name,
        spotName: s.spot.name,
        qty: s.qty,
        status: s.status,
        lastUsed: s.updatedAt.toISOString(),
      })),
      damagedItems: [...damagedItems, ...expiredByDate].map((s) => ({
        itemName: s.item.name,
        spotName: s.spot.name,
        qty: s.qty,
        status: s.expiryDate && s.expiryDate < new Date() ? "expired" : s.status,
      })),
    };
  },

  async createItem(
    prisma: PrismaClient,
    name: string,
    desc?: string,
    category?: string
  ) {
    const existing = await prisma.item.findFirst({
      where: { name: { equals: name, mode: "insensitive" } },
    });
    if (existing) {
      return {
        success: false,
        message: `Item "${name}" already exists.`,
        itemId: existing.id,
      };
    }

    const item = await prisma.item.create({
      data: { name, desc, category },
    });

    await prisma.log.create({
      data: {
        itemId: item.id,
        action: "adjust",
        note: `New item created: ${name}`,
      },
    });

    return {
      success: true,
      message: `Created new item: ${name}`,
      itemId: item.id,
    };
  },

  async updateItem(
    prisma: PrismaClient,
    id: string,
    data: { name?: string; desc?: string; category?: string }
  ) {
    return prisma.$transaction(async (tx) => {
      const item = await tx.item.findUnique({ where: { id } });
      if (!item) return { success: false, message: "Item not found." };

      await tx.item.update({ where: { id }, data });

      await tx.log.create({
        data: {
          itemId: id,
          action: "adjust",
          note: `Item updated: ${data.name || item.name}`,
        },
      });

      return { success: true, message: `Updated item: ${data.name || item.name}` };
    });
  },

  async deleteItem(prisma: PrismaClient, id: string) {
    return prisma.$transaction(async (tx) => {
      const item = await tx.item.findUnique({ where: { id } });
      if (!item) return { success: false, message: "Item not found." };

      await tx.log.create({
        data: {
          action: "adjust",
          note: `Item deleted: ${item.name} (id: ${id})`,
        },
      });

      await tx.item.delete({ where: { id } });

      return { success: true, message: `Deleted item: ${item.name}` };
    });
  },

  async updateStock(
    prisma: PrismaClient,
    id: string,
    data: { qty?: number; status?: string; spotId?: string; expiryDate?: string | null }
  ) {
    return prisma.$transaction(async (tx) => {
      const stock = await tx.stock.findUnique({ where: { id }, include: { item: true, spot: true } });
      if (!stock) return { success: false, message: "Stock not found." };

      // If qty is explicitly set to 0 or below, delete the stock record
      if (data.qty !== undefined && data.qty <= 0) {
        await tx.stock.delete({ where: { id } });
        await tx.log.create({
          data: {
            itemId: stock.itemId,
            action: "adjust",
            note: `Stock deleted (qty set to 0): ${stock.item.name} @ ${stock.spot.name}`,
          },
        });
        return { success: true, message: `Deleted stock: ${stock.item.name} @ ${stock.spot.name} (qty set to 0)` };
      }

      const updateData: Record<string, unknown> = {};
      if (data.qty !== undefined) updateData.qty = data.qty;
      if (data.status !== undefined) updateData.status = data.status;
      if (data.spotId !== undefined) updateData.spotId = data.spotId;
      if (data.expiryDate !== undefined) {
        updateData.expiryDate = data.expiryDate ? new Date(data.expiryDate) : null;
      }

      await tx.stock.update({ where: { id }, data: updateData });

      const changes = Object.entries(updateData)
        .map(([k, v]) => `${k}: ${v}`)
        .join(", ");
      await tx.log.create({
        data: {
          itemId: stock.itemId,
          action: "adjust",
          note: `Stock updated: ${stock.item.name} @ ${stock.spot.name} — ${changes}`,
        },
      });

      return { success: true, message: `Updated stock: ${stock.item.name} @ ${stock.spot.name}` };
    });
  },

  async deleteStock(prisma: PrismaClient, id: string) {
    return prisma.$transaction(async (tx) => {
      const stock = await tx.stock.findUnique({ where: { id }, include: { item: true, spot: true } });
      if (!stock) return { success: false, message: "Stock not found." };

      await tx.log.create({
        data: {
          itemId: stock.itemId,
          action: "adjust",
          note: `Stock deleted: ${stock.item.name} x${stock.qty} @ ${stock.spot.name}`,
        },
      });

      await tx.stock.delete({ where: { id } });

      return { success: true, message: `Deleted stock: ${stock.item.name} @ ${stock.spot.name}` };
    });
  },
};
