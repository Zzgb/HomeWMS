import { tool } from "ai";
import { z } from "zod";
import type { PrismaClient } from "@/generated/prisma/client";
import { inventoryService } from "@/services/inventory.service";

export function makeCreateItemTool(prisma: PrismaClient) {
  return tool({
    description:
      "Create a new item/catalog entry. Use this to register an item type before adding stock, or when a user wants to define a new product that the warehouse can track. Does NOT add any initial quantity — use the stock-in tool separately for that.",
    inputSchema: z.object({
      name: z
        .string()
        .min(1)
        .describe("The name of the new item to create."),
      desc: z
        .string()
        .optional()
        .describe("Optional description or notes about the item."),
      category: z
        .string()
        .optional()
        .describe("Optional category to group this item under (e.g., 'tools', 'food', 'electronics')."),
    }),
    execute: async ({ name, desc, category }) => {
      try {
        return await inventoryService.createItem(prisma, name, desc, category);
      } catch (e: any) {
        return { success: false, message: `Create item failed: ${e.message || "Unknown error"}` };
      }
    },
  });
}
