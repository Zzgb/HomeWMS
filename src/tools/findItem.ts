import { tool } from "ai";
import { z } from "zod";
import type { PrismaClient } from "@/generated/prisma/client";
import { inventoryService } from "@/services/inventory.service";

export function makeFindItemTool(prisma: PrismaClient) {
  return tool({
    description:
      "MANDATORY first step for ANY inventory operation. Search items by name or use empty keyword to list all. ALWAYS call this before consumeItem/moveItem/deleteItem/updateStock to get exact DB names. Returns stocks with quantities, locations, status, expiry.",
    inputSchema: z.object({
      keyword: z
        .string()
        .default("")
        .describe("Item name to search (case-insensitive). Use empty string to list all items."),
    }),
    execute: async ({ keyword }) => {
      const k = keyword?.trim() || "";
      let items = await inventoryService.findItems(prisma, k);

      // Fallback: if search returns nothing, return ALL items so AI can find the correct name
      if (items.length === 0 && k) {
        items = await inventoryService.findItems(prisma, "");
      }

      // Log the query
      await prisma.log.create({
        data: {
          action: "query",
          note: k ? `搜索物品: "${k}", 找到 ${items.length} 个结果` : "查看全部库存",
        },
      }).catch(() => {});

      if (!items.length) {
        return {
          found: false,
          keyword: k,
          message: "仓库中还没有物品",
          items: [],
        };
      }

      const fallback = k && items.length > 0 && !items.some(i => i.name.toLowerCase().includes(k.toLowerCase()));
      const now = new Date();
      return {
        found: true,
        keyword: k,
        total: items.length,
        note: fallback ? `No exact match for "${k}". Showing ALL items — use the exact name from this list.` : undefined,
        items: items.map((item) => ({
          name: item.name,
          category: item.category,
          stocks: item.stocks.map((s) => {
            const isExpiredByDate = s.status === "normal" && s.expiryDate && s.expiryDate < now;
            return {
              spot: s.spot.name,
              qty: s.qty,
              status: isExpiredByDate ? "expired" : s.status,
              expiryDate: s.expiryDate?.toISOString().slice(0, 10) ?? null,
            };
          }),
        })),
      };
    },
  });
}
