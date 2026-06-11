import { tool } from "ai";
import { z } from "zod";
import type { PrismaClient } from "@/generated/prisma/client";
import { inventoryService } from "@/services/inventory.service";

export function makeSplitItemTool(prisma: PrismaClient) {
  return tool({
    description:
      "Split a source item's stock into one or more new items. For each split: consumes qty from source, then stocks into a new item. Useful for splitting a merged/category item into brand-specific items (e.g. '可乐' → '无糖可口可乐' + '无糖百事可乐'). Source item must exist. New items are auto-created.",
    inputSchema: z.object({
      sourceItem: z
        .string()
        .min(1)
        .describe("Name of the source item to split from (case-insensitive)."),
      splits: z
        .array(
          z.object({
            newName: z.string().min(1).describe("Name of the new item to create."),
            qty: z.number().int().nonnegative().describe("Quantity to move from source to this new item. 0 = create item only."),
          })
        )
        .min(1)
        .describe("Array of target items with quantities."),
    }),
    execute: async ({ sourceItem, splits }) => {
      try {
        // Find source item
        const source = await prisma.item.findFirst({
          where: { name: { equals: sourceItem, mode: "insensitive" } },
          include: { stocks: { include: { spot: true } } },
        });

        if (!source) {
          return { success: false, message: `Source item "${sourceItem}" not found.` };
        }

        const results: string[] = [];
        let remainingSplits = [...splits];

        // Process splits, consuming from existing stocks
        for (const stock of source.stocks) {
          if (remainingSplits.length === 0) break;

          const nextSplits: typeof splits = [];
          for (const split of remainingSplits) {
            // qty=0: create item only, no consumption needed
            if (split.qty === 0) {
              try {
                await inventoryService.stockIn(prisma, split.newName, 0, stock.spot.name, `Split from "${source.name}" (placeholder)`);
                results.push(`${split.newName}: created (0 qty)`);
              } catch {
                results.push(`${split.newName}: create failed`);
              }
              continue;
            }

            if (stock.qty <= 0) {
              nextSplits.push(split);
              continue;
            }

            const takeQty = Math.min(split.qty, stock.qty);
            if (takeQty <= 0) {
              nextSplits.push(split);
              continue;
            }

            // Consume from source
            const consumeResult = await inventoryService.consumeItem(
              prisma, source.name, takeQty, stock.spot.name, `Split to "${split.newName}"`
            );

            if (!consumeResult.success) {
              return {
                success: false,
                message: `Failed to consume ${takeQty} of "${source.name}" from ${stock.spot.name}: ${consumeResult.message}`,
                results,
              };
            }

            // Stock in to new item
            const stockResult = await inventoryService.stockIn(
              prisma, split.newName, takeQty, stock.spot.name, `Split from "${source.name}"`
            );

            if (!stockResult.success) {
              return {
                success: false,
                message: `Failed to stock in ${takeQty} of "${split.newName}": ${stockResult.message}`,
                results,
              };
            }

            results.push(`${split.newName}: +${takeQty} at ${stock.spot.name}`);
            stock.qty -= takeQty;

            const remaining = split.qty - takeQty;
            if (remaining > 0) {
              nextSplits.push({ ...split, qty: remaining });
            }
          }
          remainingSplits = nextSplits;
        }

        // Check if any splits couldn't be fulfilled
        const unfulfilled = remainingSplits.filter((s) => s.qty > 0);
        if (unfulfilled.length > 0) {
          const detail = unfulfilled.map((s) => `"${s.newName}" short ${s.qty}`).join(", ");
          return {
            success: true,
            partial: true,
            message: `Split complete but insufficient stock: ${detail}. Completed: ${results.join("; ")}`,
            results,
          };
        }

        const remainingQty = source.stocks.reduce((sum, s) => sum + Math.max(0, s.qty), 0);
        return {
          success: true,
          message: `Split "${source.name}" into: ${results.join("; ")}${remainingQty > 0 ? `. Remaining: ${remainingQty}` : ""}`,
          results,
          remainingQty,
        };
      } catch (e: any) {
        return { success: false, message: `Split failed: ${e.message || "Unknown error"}` };
      }
    },
  });
}
