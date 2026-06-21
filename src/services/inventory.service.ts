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
        update: {
          qty: { increment: qty },
          ...(expiry ? { expiryDate: expiry } : {}),
          ...(status ? { status: effectiveStatus } : {}),
        },
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

      // Verify: re-query stock to confirm actual state
      const verifiedStock = await tx.stock.findUnique({
        where: { itemId_spotId: { itemId: item.id, spotId: spot.id } },
        include: { item: true, spot: true },
      });

      if (!verifiedStock || verifiedStock.qty !== stock.qty) {
        return {
          success: false,
          message: `❌ FAILED: Verification error. Expected qty ${stock.qty}, DB shows ${verifiedStock?.qty ?? "null"}. Operation did NOT take effect. Retry.`,
        };
      }

      return {
        success: true,
        message: `✅ Added ${qty} ${itemName} to ${spotName}. Verified total: ${verifiedStock.qty}`,
        logId: log.id,
        verified: verifiedStock
          ? {
              itemName: verifiedStock.item.name,
              spotName: verifiedStock.spot.name,
              qty: verifiedStock.qty,
              status: verifiedStock.status,
              expiryDate: verifiedStock.expiryDate?.toISOString().slice(0, 10) ?? null,
            }
          : null,
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
    // Pre-fetch item+spot for post-transaction verification
    const preItem = await prisma.item.findFirst({
      where: { name: { equals: itemName, mode: "insensitive" } },
    });
    if (!preItem) {
      let similar = await prisma.item.findMany({
        where: { name: { contains: itemName, mode: "insensitive" } },
        take: 5, select: { name: true },
      });
      if (similar.length === 0) {
        similar = await prisma.item.findMany({ take: 10, select: { name: true }, orderBy: { name: "asc" } });
      }
      return {
        success: false,
        message: `❌ FAILED: "${itemName}" not in database. You MUST retry with one of: ${similar.map((s) => s.name).join(", ")}`,
        suggestions: similar.map((s) => s.name),
      };
    }

    const preSpot = await prisma.spot.findFirst({
      where: { name: { equals: spotName, mode: "insensitive" } },
    });
    if (!preSpot) {
      const spots = await prisma.spot.findMany({ take: 10, select: { name: true }, orderBy: { name: "asc" } });
      return {
        success: false,
        message: `❌ FAILED: Location "${spotName}" not found. Available: ${spots.map((s) => s.name).join(", ")}.`,
        suggestions: spots.map((s) => s.name),
      };
    }

    // Save pre-op qty for verification
    const preStock = await prisma.stock.findUnique({
      where: { itemId_spotId: { itemId: preItem.id, spotId: preSpot.id } },
    });
    const preQty = preStock?.qty ?? 0;
    if (preQty < qty) {
      return {
        success: false,
        message: `❌ FAILED: Insufficient stock. Only ${preQty} available, you asked for ${qty}.`,
      };
    }

    // Execute in transaction
    const txResult = await prisma.$transaction(async (tx) => {
      const stock = await tx.stock.findUnique({
        where: { itemId_spotId: { itemId: preItem.id, spotId: preSpot.id } },
      });
      if (!stock || stock.qty < qty) {
        return { committed: false };
      }

      const newQty = stock.qty - qty;
      if (newQty <= 0) {
        await tx.stock.delete({ where: { id: stock.id } });
        // Cleanup orphan item: delete item if no stocks remain
        const remaining = await tx.stock.count({ where: { itemId: stock.itemId } });
        if (remaining === 0) {
          await tx.item.delete({ where: { id: stock.itemId } });
        }
      } else {
        await tx.stock.update({ where: { id: stock.id }, data: { qty: { decrement: qty } } });
      }

      const log = await tx.log.create({
        data: {
          itemId: preItem.id,
          action: "out",
          qty: -qty,
          fromSpot: preSpot.id,
          note: note || `Consumed: ${itemName} -${qty} from ${spotName}`,
        },
      });

      return { committed: true, newQty, logId: log.id };
    });

    if (!txResult.committed) {
      return { success: false, message: `❌ FAILED: Stock changed during operation. Retry.` };
    }

    // POST-TRANSACTION verification with main client
    const postStock = await prisma.stock.findUnique({
      where: { itemId_spotId: { itemId: preItem.id, spotId: preSpot.id } },
      include: { item: true, spot: true },
    });

    const expectedQty = preQty - qty;
    const actualQty = postStock?.qty ?? 0;

    if (expectedQty !== actualQty) {
      return {
        success: false,
        message: `❌ FAILED: Post-verification failed. Expected ${expectedQty} remaining (was ${preQty}, removed ${qty}), but DB shows ${actualQty}. The database was NOT updated.`,
      };
    }

    if (expectedQty <= 0) {
      return {
        success: true,
        message: `✅ Removed ${qty} ${itemName} from ${spotName}. Stock cleared (was ${preQty}).`,
        logId: txResult.logId,
        verified: { remaining: 0, deleted: true },
      };
    }

    return {
      success: true,
      message: `✅ Removed ${qty} ${itemName} from ${spotName}. Verified: ${actualQty} remaining (was ${preQty}).`,
      logId: txResult.logId,
      verified: {
        itemName: postStock!.item.name,
        spotName: postStock!.spot.name,
        remaining: postStock!.qty,
        status: postStock!.status,
      },
    };
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
        let similar = await tx.item.findMany({
          where: { name: { contains: itemName, mode: "insensitive" } },
          take: 5,
          select: { name: true },
        });
        if (similar.length === 0) {
          similar = await tx.item.findMany({
            take: 10,
            select: { name: true },
            orderBy: { name: "asc" },
          });
        }
        return {
          success: false,
          message: `[OPERATION FAILED] Item "${itemName}" not found. Available items: ${similar.map((s) => s.name).join(", ")}`,
          suggestions: similar.map((s) => s.name),
        };
      }

      // Find source spot
      const fromSpot = await tx.spot.findFirst({
        where: { name: { equals: fromSpotName, mode: "insensitive" } },
      });
      if (!fromSpot) {
        const spots = await tx.spot.findMany({ take: 10, select: { name: true }, orderBy: { name: "asc" } });
        return {
          success: false,
          message: `[OPERATION FAILED] Source location "${fromSpotName}" not found. Available locations: ${spots.map((s) => s.name).join(", ")}`,
        };
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
        // Cleanup orphan item
        const remaining = await tx.stock.count({ where: { itemId: fromStock.itemId } });
        if (remaining === 0) {
          await tx.item.delete({ where: { id: fromStock.itemId } });
        }
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

      // Verify: re-query both source and target
      const verifiedSource = await tx.stock.findUnique({
        where: { itemId_spotId: { itemId: item.id, spotId: fromSpot.id } },
      });
      const verifiedTarget = await tx.stock.findUnique({
        where: { itemId_spotId: { itemId: item.id, spotId: toSpot.id } },
      });

      // Validate source
      if (newQty > 0 && (!verifiedSource || verifiedSource.qty !== newQty)) {
        return {
          success: false,
          message: `❌ FAILED: Source verification error. Expected ${newQty} at ${fromSpotName}, found ${verifiedSource?.qty ?? "deleted"}. Operation did NOT take effect.`,
        };
      }
      if (newQty <= 0 && verifiedSource) {
        return {
          success: false,
          message: `❌ FAILED: Source should be empty at ${fromSpotName} but still has ${verifiedSource.qty}. Operation did NOT take effect.`,
        };
      }
      if (!verifiedTarget || verifiedTarget.qty < qty) {
        return {
          success: false,
          message: `❌ FAILED: Target verification error. Expected ≥${qty} at ${toSpotName}, found ${verifiedTarget?.qty ?? "null"}. Operation did NOT take effect.`,
        };
      }

      return {
        success: true,
        message: `✅ Moved ${qty} ${itemName} from ${fromSpotName} to ${toSpotName}. Verified.`,
        logId: log.id,
        verified: {
          source: verifiedSource
            ? { spotName: fromSpotName, remaining: verifiedSource.qty }
            : { spotName: fromSpotName, remaining: 0, cleared: true },
          target: { spotName: toSpotName, qty: verifiedTarget?.qty ?? 0 },
        },
      };
    });
  },

  async checkStock(prisma: PrismaClient, unusedDaysThreshold: number = 30) {
    // Clean up any zero/negative qty stocks first
    await prisma.stock.deleteMany({ where: { qty: { lte: 0 } } }).catch(() => {});

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - unusedDaysThreshold);

    // Find items that haven't been used (no log entries) since cutoff
    const recentLogs = await prisma.log.findMany({
      where: {
        createdAt: { gte: cutoff },
        itemId: { not: null },
      },
      select: { itemId: true },
    });
    const recentItemIds = [...new Set(recentLogs.map((l) => l.itemId!))];

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
        expiryDate: s.expiryDate?.toISOString().slice(0, 10) ?? null,
        lastUsed: s.updatedAt.toISOString(),
      })),
      damagedItems: [...damagedItems, ...expiredByDate].map((s) => ({
        itemName: s.item.name,
        spotName: s.spot.name,
        qty: s.qty,
        status: s.expiryDate && s.expiryDate < new Date() ? "expired" : s.status,
        expiryDate: s.expiryDate?.toISOString().slice(0, 10) ?? null,
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

    // Verify item exists
    const verified = await prisma.item.findUnique({ where: { id: item.id } });

    return {
      success: true,
      message: `Created new item: ${name}`,
      itemId: item.id,
      verified: verified ? { name: verified.name, category: verified.category } : null,
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

      const itemName = item.name;

      await tx.log.create({
        data: {
          action: "adjust",
          note: `Item deleted: ${itemName} (id: ${id})`,
        },
      });

      await tx.item.delete({ where: { id } });

      // Verify deletion
      const check = await tx.item.findUnique({ where: { id } });

      return {
        success: true,
        message: `Deleted item: ${itemName}`,
        verified: { deleted: check === null },
      };
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
        // Verify deletion
        const check = await tx.stock.findUnique({ where: { id } });
        return {
          success: true,
          message: `Deleted stock: ${stock.item.name} @ ${stock.spot.name}`,
          verified: { deleted: check === null },
        };
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

      // Verify: re-query to confirm new values
      const verifiedStock = await tx.stock.findUnique({
        where: { id },
        include: { item: true, spot: true },
      });

      return {
        success: true,
        message: `Updated stock: ${stock.item.name} @ ${stock.spot.name}`,
        verified: verifiedStock
          ? {
              itemName: verifiedStock.item.name,
              spotName: verifiedStock.spot.name,
              qty: verifiedStock.qty,
              status: verifiedStock.status,
              expiryDate: verifiedStock.expiryDate?.toISOString().slice(0, 10) ?? null,
            }
          : null,
      };
    });
  },

  async deleteStock(prisma: PrismaClient, id: string) {
    return prisma.$transaction(async (tx) => {
      const stock = await tx.stock.findUnique({ where: { id }, include: { item: true, spot: true } });
      if (!stock) return { success: false, message: "Stock not found." };

      const stockInfo = `${stock.item.name} x${stock.qty} @ ${stock.spot.name}`;

      await tx.log.create({
        data: {
          itemId: stock.itemId,
          action: "adjust",
          note: `Stock deleted: ${stockInfo}`,
        },
      });

      await tx.stock.delete({ where: { id } });

      // Verify deletion
      const check = await tx.stock.findUnique({ where: { id } });

      return {
        success: true,
        message: `Deleted stock: ${stockInfo}`,
        verified: { deleted: check === null },
      };
    });
  },

  async updateExpiryStatus(prisma: PrismaClient) {
    const now = new Date();

    // Find all normal stocks with past expiry date
    const expired = await prisma.stock.findMany({
      where: {
        expiryDate: { lt: now },
        status: "normal",
        qty: { gt: 0 },
      },
      include: { item: true, spot: true },
    });

    if (expired.length === 0) return { updated: 0 };

    // Bulk update status to expired
    const ids = expired.map((s) => s.id);
    await prisma.stock.updateMany({
      where: { id: { in: ids } },
      data: { status: "expired" },
    });

    // Write logs
    for (const s of expired) {
      await prisma.log.create({
        data: {
          itemId: s.itemId,
          action: "expire",
          note: `Expired by date: ${s.item.name} x${s.qty} @ ${s.spot.name} (expiry: ${s.expiryDate?.toISOString().slice(0, 10)})`,
        },
      });
    }

    return { updated: expired.length };
  },
};
