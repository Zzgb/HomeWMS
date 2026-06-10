import { tool } from "ai";
import { z } from "zod";
import type { PrismaClient } from "@/generated/prisma/client";
import { inventoryService } from "@/services/inventory.service";

export function makeUpdateStockTool(prisma: PrismaClient) {
  return tool({
    description:
      "Update a stock record's quantity, status, storage location, or expiry date. Identify the stock by item name and spot name (case-insensitive). Leave fields undefined to keep them unchanged. Setting qty to 0 deletes the stock record.",
    inputSchema: z.object({
      itemName: z
        .string()
        .min(1)
        .describe("The item name (case-insensitive)."),
      spotName: z
        .string()
        .min(1)
        .describe("The current storage location name of the stock to update."),
      qty: z
        .number()
        .int()
        .nonnegative()
        .optional()
        .describe("New quantity (0 to delete the stock). Leave undefined to keep unchanged."),
      status: z
        .enum(["normal", "damaged", "expired"])
        .optional()
        .describe("New status. Leave undefined to keep unchanged."),
      newSpotName: z
        .string()
        .optional()
        .describe("Move stock to this new location name (case-insensitive). Leave undefined to keep current spot."),
      expiryDate: z
        .string()
        .optional()
        .describe("New expiry date in YYYY-MM-DD format, or null to clear. Leave undefined to keep unchanged."),
    }),
    execute: async ({ itemName, spotName, qty, status, newSpotName, expiryDate }) => {
      try {
        // Find the stock record by item name + spot name
        const stock = await prisma.stock.findFirst({
          where: {
            item: { name: { equals: itemName, mode: "insensitive" } },
            spot: { name: { equals: spotName, mode: "insensitive" } },
          },
          include: { item: true, spot: true },
        });
        if (!stock) {
          return {
            success: false,
            message: `Stock not found: "${itemName}" at "${spotName}".`,
          };
        }

        // Resolve new spot name to ID if provided
        let spotId: string | undefined;
        if (newSpotName) {
          const newSpot = await prisma.spot.findFirst({
            where: { name: { equals: newSpotName, mode: "insensitive" } },
          });
          if (!newSpot) {
            return {
              success: false,
              message: `Target location "${newSpotName}" not found.`,
            };
          }
          spotId = newSpot.id;
        }

        return await inventoryService.updateStock(prisma, stock.id, {
          qty,
          status,
          spotId,
          expiryDate,
        });
      } catch (e: any) {
        return { success: false, message: `更新库存失败: ${e.message || "未知错误"}` };
      }
    },
  });
}
