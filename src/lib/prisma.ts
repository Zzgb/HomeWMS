import { getWarehouseClient } from "@/lib/connections";
import type { PrismaClient } from "@/generated/prisma/client";

/** Get the PrismaClient for the currently active warehouse */
export function getPrisma(warehouseId: string): PrismaClient | null {
  return getWarehouseClient(warehouseId);
}

// Re-export the type for convenience
export type { PrismaClient };
