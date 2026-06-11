import { tool } from "ai";
import { z } from "zod";
import type { PrismaClient } from "@/generated/prisma/client";
import { inventoryService } from "@/services/inventory.service";

export function makeDeleteItemTool(prisma: PrismaClient) {
  return tool({
    description:
      "Delete an item and ALL its stock records. If itemName is empty/ALL, deletes EVERY item in the warehouse. Irreversible.",
    inputSchema: z.object({
      itemName: z
        .string()
        .default("")
        .describe("Item name to delete. Empty string or 'ALL' deletes everything."),
    }),
    execute: async ({ itemName }) => {
      const name = itemName?.trim() || "";

      try {
        // ── Delete all items ──
        if (!name || name.toUpperCase() === "ALL") {
          const allItems = await prisma.item.findMany({
            include: { stocks: true },
          });

          if (allItems.length === 0) {
            return { success: true, message: "Warehouse is already empty." };
          }

          let deleted = 0;
          for (const item of allItems) {
            // Delete stocks first (cascade would handle, but explicit is safer)
            if (item.stocks.length > 0) {
              await prisma.stock.deleteMany({ where: { itemId: item.id } });
            }
            await prisma.item.delete({ where: { id: item.id } });

            await prisma.log.create({
              data: {
                action: "adjust",
                note: `Warehouse cleared: "${item.name}" deleted`,
              },
            }).catch(() => {});

            deleted++;
          }

          return {
            success: true,
            message: `Cleared warehouse: deleted ${deleted} items.`,
            deletedCount: deleted,
          };
        }

        // ── Delete single item ──
        const item = await prisma.item.findFirst({
          where: { name: { equals: name, mode: "insensitive" } },
        });
        if (!item) {
          return { success: false, message: `Item "${name}" not found.` };
        }
        return await inventoryService.deleteItem(prisma, item.id);
      } catch (e: any) {
        return { success: false, message: `Delete failed: ${e.message || "Unknown error"}` };
      }
    },
  });
}
