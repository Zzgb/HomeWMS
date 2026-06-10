import { tool } from "ai";
import { z } from "zod";
import type { PrismaClient } from "@/generated/prisma/client";
import { inventoryService } from "@/services/inventory.service";

export function makeConsumeItemTool(prisma: PrismaClient) {
  return tool({
    description:
      "MANDATORY for any removal: 喝/吃/用/扔/取出/消耗/出库. Removes items from inventory. Call findItem FIRST to get exact DB names, then call this tool with those exact names. Do NOT guess item names.",
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
        const result = await inventoryService.consumeItem(prisma, itemName, qty, spot, note);
        // Auto-retry only with single suggestion (fuzzy match found exactly one)
        if (!result.success && (result as any).suggestions?.length === 1) {
          const retryName = (result as any).suggestions[0];
          return await inventoryService.consumeItem(prisma, retryName, qty, spot, note);
        }
        return result;
      } catch (e: any) {
        return { success: false, message: `出库失败: ${e.message || "未知错误"}` };
      }
    },
  });
}
