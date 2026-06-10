import { tool } from "ai";
import { z } from "zod";
import type { PrismaClient } from "@/generated/prisma/client";
import { inventoryService } from "@/services/inventory.service";

export function makeMoveItemTool(prisma: PrismaClient) {
  return tool({
    description:
      "Move a quantity of an item from one location to another. The source location must have sufficient stock. The target location is created automatically if it does not exist. Use this when reorganizing inventory, relocating items, or transferring stock between spots.",
    inputSchema: z.object({
      itemName: z
        .string()
        .min(1)
        .describe("The name of the item to move."),
      fromSpot: z
        .string()
        .min(1)
        .describe("The source location name from which items will be taken."),
      toSpot: z
        .string()
        .min(1)
        .describe("The destination location name where items will be placed."),
      qty: z
        .number()
        .int()
        .positive()
        .describe("The quantity to move (must be a positive integer)."),
    }),
    execute: async ({ itemName, fromSpot, toSpot, qty }) => {
      try {
        return await inventoryService.moveItem(prisma, itemName, fromSpot, toSpot, qty);
      } catch (e: any) {
        return { success: false, message: `移动失败: ${e.message || "未知错误"}` };
      }
    },
  });
}
