import { tool } from "ai";
import { z } from "zod";
import type { PrismaClient } from "@/generated/prisma/client";
import { inventoryService } from "@/services/inventory.service";

export function makeConsumeItemTool(prisma: PrismaClient) {
  return tool({
    description:
      "Remove (consume) a quantity of an item from a specific location. Use this when items are taken out of inventory for use, sold, discarded, or otherwise removed. Returns an error if the item, location, or sufficient quantity is not found. Check stock first with find-item if unsure about availability.",
    inputSchema: z.object({
      itemName: z
        .string()
        .min(1)
        .describe("The name of the item to consume."),
      qty: z
        .number()
        .int()
        .positive()
        .describe("The quantity to remove (must be a positive integer)."),
      spot: z
        .string()
        .min(1)
        .describe("The storage location name from which to remove the items."),
      note: z
        .string()
        .optional()
        .describe("Optional note about this consumption (e.g., reason, recipient)."),
    }),
    execute: async ({ itemName, qty, spot, note }) => {
      try {
        return await inventoryService.consumeItem(prisma, itemName, qty, spot, note);
      } catch (e: any) {
        return { success: false, message: `出库失败: ${e.message || "未知错误"}` };
      }
    },
  });
}
