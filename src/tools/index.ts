import type { PrismaClient } from "@/generated/prisma/client";
import { makeListStoresTool } from "./listStores";
import { makeFindItemTool } from "./findItem";
import { makeGetSpotsTool } from "./getSpots";
import { makeCreateItemTool } from "./createItem";
import { makeStockInTool } from "./stockIn";
import { makeConsumeItemTool } from "./consumeItem";
import { makeMoveItemTool } from "./moveItem";
import { makeCheckStockTool } from "./checkStock";
import { makeSetAiNameTool } from "./setAiName";
import { makeDeleteItemTool } from "./deleteItem";
import { makeSplitItemTool } from "./splitItem";
import { makeUpdateStockTool } from "./updateStock";

/**
 * Creates the full set of inventory-management tool definitions
 * wired to a specific warehouse's PrismaClient. Call this once per
 * API route / warehouse context.
 */
export function createToolDefinitions(prisma: PrismaClient) {
  return {
    listStores: makeListStoresTool(),
    findItem: makeFindItemTool(prisma),
    getSpots: makeGetSpotsTool(prisma),
    createItem: makeCreateItemTool(prisma),
    stockIn: makeStockInTool(prisma),
    consumeItem: makeConsumeItemTool(prisma),
    moveItem: makeMoveItemTool(prisma),
    splitItem: makeSplitItemTool(prisma),
    checkStock: makeCheckStockTool(prisma),
    setAiName: makeSetAiNameTool(prisma),
    deleteItem: makeDeleteItemTool(prisma),
    updateStock: makeUpdateStockTool(prisma),
  };
}
