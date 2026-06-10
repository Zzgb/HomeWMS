import { tool } from "ai";
import { z } from "zod";
import type { PrismaClient } from "@/generated/prisma/client";
import { inventoryService } from "@/services/inventory.service";

function buildSpotNode(spot: Record<string, unknown>): Record<string, unknown> {
  const node: Record<string, unknown> = {
    name: spot.name,
    spotId: spot.id,
  };
  if (spot.desc) {
    node.desc = spot.desc;
  }
  const children = spot.children as Record<string, unknown>[] | undefined;
  if (children && children.length > 0) {
    node.children = children.map((child) => buildSpotNode(child));
  }
  return node;
}

export function makeGetSpotsTool(prisma: PrismaClient) {
  return tool({
    description:
      "Get the full location/storage tree, including nested sub-locations. Use this when you need to understand the warehouse layout, check available spots before stocking or moving items, or display the organization to the user.",
    inputSchema: z.object({}),
    execute: async () => {
      const roots = await inventoryService.getSpotTree(prisma);
      await prisma.log.create({
        data: { action: "query", note: `查看位置树, ${roots.length} 个根节点` },
      }).catch(() => {});

      if (!roots.length) {
        return {
          message: "No storage locations found.",
          tree: [],
        };
      }

      return {
        tree: roots.map((root: Record<string, unknown>) => buildSpotNode(root)),
      };
    },
  });
}
