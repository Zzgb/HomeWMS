import { tool } from "ai";
import { z } from "zod";
import type { PrismaClient } from "@/generated/prisma/client";
import { inventoryService } from "@/services/inventory.service";

export function makeDeleteItemTool(prisma: PrismaClient) {
  return tool({
    description:
      "Delete an item and ALL its stock records from the warehouse. This is irreversible — all quantities at all locations will be removed. Provide the item name (case-insensitive).",
    inputSchema: z.object({
      itemName: z
        .string()
        .min(1)
        .describe("The name of the item to delete (case-insensitive)."),
    }),
    execute: async ({ itemName }) => {
      try {
        const item = await prisma.item.findFirst({
          where: { name: { equals: itemName, mode: "insensitive" } },
        });
        if (!item) {
          return { success: false, message: `Item "${itemName}" not found.` };
        }
        return await inventoryService.deleteItem(prisma, item.id);
      } catch (e: any) {
        return { success: false, message: `删除失败: ${e.message || "未知错误"}` };
      }
    },
  });
}
