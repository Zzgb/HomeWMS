import { tool } from "ai";
import { z } from "zod";
import type { PrismaClient } from "@/generated/prisma/client";
import { inventoryService } from "@/services/inventory.service";

export function makeFindItemTool(prisma: PrismaClient) {
  return tool({
    description:
      "Search for items by name (fuzzy), or leave keyword empty to list ALL items. Returns items with stock levels and locations. Use empty keyword to get a full inventory overview.",
    inputSchema: z.object({
      keyword: z
        .string()
        .default("")
        .describe("Item name to search (case-insensitive). Use empty string to list all items."),
    }),
    execute: async ({ keyword }) => {
      const k = keyword?.trim() || "";
      const items = await inventoryService.findItems(prisma, k);

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
          message: k ? `未找到匹配 "${k}" 的物品` : "仓库中还没有物品",
          items: [],
        };
      }

      return {
        found: true,
        keyword: k,
        total: items.length,
        items: items.map((item) => ({
          name: item.name,
          category: item.category,
          stocks: item.stocks.map((s) => ({
            spot: s.spot.name,
            qty: s.qty,
            status: s.status,
          })),
        })),
      };
    },
  });
}
