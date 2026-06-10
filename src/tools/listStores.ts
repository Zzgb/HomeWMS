import { tool } from "ai";
import { z } from "zod";
import { storeService } from "@/services/store.service";

export function makeListStoresTool() {
  return tool({
    description:
      "List all available warehouses/stores. Use this when you need to find which stores exist, or when a user asks about available warehouses.",
    inputSchema: z.object({}),
    execute: async () => {
      const stores = await storeService.listStores();
      return {
        stores: stores.map((s) => ({ id: s.id, name: s.name, connected: s.connected })),
      };
    },
  });
}
