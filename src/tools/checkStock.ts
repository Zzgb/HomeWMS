import { tool } from "ai";
import { z } from "zod";
import type { PrismaClient } from "@/generated/prisma/client";
import { inventoryService } from "@/services/inventory.service";

export function makeCheckStockTool(prisma: PrismaClient) {
  return tool({
    description:
      "Audit stock health. Returns two lists: (1) unused items — stock that has not been touched within the given number of days, and (2) damaged/expired items. Use this for inventory audits, identifying stale stock, or maintenance planning.",
    inputSchema: z.object({
      unusedDaysThreshold: z
        .number()
        .int()
        .positive()
        .default(30)
        .optional()
        .describe(
          "Number of days without any operation after which an item is considered 'unused' (default: 30).",
        ),
    }),
    execute: async ({ unusedDaysThreshold }) => {
      const result = await inventoryService.checkStock(prisma, unusedDaysThreshold);
      await prisma.log.create({
        data: {
          action: "check",
          note: `盘点: ${result.unusedItems.length} 个长期未使用, ${result.damagedItems.length} 个损坏/过期`,
        },
      }).catch(() => {});
      return result;
    },
  });
}
