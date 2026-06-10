import { tool } from "ai";
import { z } from "zod";
import type { PrismaClient } from "@/generated/prisma/client";
import { inventoryService } from "@/services/inventory.service";

export function makeStockInTool(prisma: PrismaClient) {
  return tool({
    description:
      "Add (stock in) a quantity of an item to a specific location. If the item or location does not exist, they will be created automatically. Use this when receiving new goods, restocking, or recording that items have arrived at a particular spot. Returns the total quantity after the operation.",
    inputSchema: z.object({
      itemName: z
        .string()
        .min(1)
        .describe("The name of the item to stock in. Created automatically if it does not exist."),
      qty: z
        .number()
        .int()
        .positive()
        .describe("The quantity to add (must be a positive integer)."),
      spot: z
        .string()
        .min(1)
        .describe("The storage location name where the items will be placed."),
      note: z
        .string()
        .optional()
        .describe("Optional note about this stock-in operation (e.g., supplier name, batch number)."),
      expiryDate: z
        .string()
        .optional()
        .describe("Optional expiry/best-before date in ISO format (YYYY-MM-DD)."),
      category: z
        .string()
        .optional()
        .describe("AI-inferred category for the item, e.g. 食品/工具/电子/日用品/药品/其他."),
      status: z
        .enum(["normal", "damaged", "expired"])
        .optional()
        .default("normal")
        .describe("Item condition. Use 'damaged' for broken/spoiled items, 'expired' for known-expired items. Default is 'normal'."),
    }),
    execute: async ({ itemName, qty, spot, note, expiryDate, category, status }) => {
      try {
        return await inventoryService.stockIn(prisma, itemName, qty, spot, note, expiryDate, category, status);
      } catch (e: any) {
        return { success: false, message: `入库失败: ${e.message || "未知错误"}` };
      }
    },
  });
}
