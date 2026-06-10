import { tool, generateText } from "ai";
import { z } from "zod";
import type { PrismaClient } from "@/generated/prisma/client";
import { inventoryService } from "@/services/inventory.service";
import { getModel } from "@/agent/router";

export function makeFindItemTool(prisma: PrismaClient) {
  return tool({
    description:
      "MANDATORY first step for ANY inventory operation. Search items by name or use empty keyword to list all. ALWAYS call this before consumeItem/moveItem/deleteItem/updateStock to get exact DB names. Returns stocks with quantities, locations, status, expiry.",
    inputSchema: z.object({
      keyword: z
        .string()
        .default("")
        .describe("Item name to search (case-insensitive). Use empty string to list all items."),
    }),
    execute: async ({ keyword }) => {
      const k = keyword?.trim() || "";
      let items = await inventoryService.findItems(prisma, k);

      // No results from contains search — fetch all and use LLM to find best match
      if (items.length === 0 && k) {
        const allItems = await inventoryService.findItems(prisma, "");

        if (allItems.length === 0) {
          await prisma.log.create({
            data: { action: "query", note: `搜索: "${k}", 仓库为空` },
          }).catch(() => {});
          return { found: false, keyword: k, message: "仓库中还没有物品", items: [] };
        }

        // Use LLM to map keyword (possibly Chinese) to the correct DB name
        const resolved = await resolveKeyword(k, allItems);
        if (resolved) {
          items = allItems.filter((i) => i.name.toLowerCase() === resolved.toLowerCase());
        }

        // LLM resolution failed — keyword doesn't match any item. Return failure with available items.
        if (items.length === 0) {
          const now = new Date();
          return {
            found: false,
            success: false,
            keyword: k,
            message: `❌ "${k}" 不在仓库中。当前物品: ${allItems.map(i => i.name).join(", ")}`,
            items: allItems.map((item) => ({
              name: item.name,
              category: item.category,
              stocks: item.stocks.map((s) => {
                const isExpiredByDate = s.status === "normal" && s.expiryDate && s.expiryDate < now;
                return {
                  spot: s.spot.name,
                  qty: s.qty,
                  status: isExpiredByDate ? "expired" : s.status,
                  expiryDate: s.expiryDate?.toISOString().slice(0, 10) ?? null,
                };
              }),
            })),
          };
        }
      }

      // Log the query
      const matchType = items.length === 1 && k && items[0].name.toLowerCase().includes(k.toLowerCase()) ? "精确" : "模糊";
      await prisma.log.create({
        data: {
          action: "query",
          note: k ? `搜索: "${k}", ${matchType}匹配 ${items.length} 个结果` : "查看全部库存",
        },
      }).catch(() => {});

      if (!items.length) {
        return { found: false, keyword: k, message: "仓库中还没有物品", items: [] };
      }

      const now = new Date();
      const matched = items.some((i) => i.name.toLowerCase().includes(k.toLowerCase()));

      return {
        found: true,
        keyword: k,
        total: items.length,
        note: !matched && k ? `"${k}" matched ${items.length} item(s) via semantic search.` : undefined,
        items: items.map((item) => ({
          name: item.name,
          category: item.category,
          stocks: item.stocks.map((s) => {
            const isExpiredByDate = s.status === "normal" && s.expiryDate && s.expiryDate < now;
            return {
              spot: s.spot.name,
              qty: s.qty,
              status: isExpiredByDate ? "expired" : s.status,
              expiryDate: s.expiryDate?.toISOString().slice(0, 10) ?? null,
            };
          }),
        })),
      };
    },
  });
}

async function resolveKeyword(keyword: string, allItems: any[]): Promise<string | null> {
  const names = allItems.map((i: any) => i.name);

  // Exact match (case-insensitive)
  const exact = names.find((n: string) => n.toLowerCase() === keyword.toLowerCase());
  if (exact) return exact;

  // Contains match
  const contains = names.find((n: string) =>
    n.toLowerCase().includes(keyword.toLowerCase()) ||
    keyword.toLowerCase().includes(n.toLowerCase())
  );
  if (contains) return contains;

  // LLM match: map Chinese/Japanese keyword to English DB name
  try {
    const model = getModel("deepseek/deepseek-v4-flash");
    const { text } = await generateText({
      model,
      prompt: [
        `Match the keyword to the most likely item name.`,
        `Keyword: "${keyword}"`,
        `Items: ${names.join(" | ")}`,
        ``,
        `Rules:`,
        `- If the keyword is a Chinese/Japanese word for an item (e.g. "鸡蛋" = Eggs, "牛奶" = Milk, "大米" = Rice), output the matching English name.`,
        `- If no item matches, output exactly: NONE`,
        `- Output ONLY the item name or NONE. No other text.`,
      ].join("\n"),
      temperature: 0,
    });

    const resolved = text.trim();
    const match = names.find((n: string) => n.toLowerCase() === resolved.toLowerCase());
    if (match) {
      console.log(`[findItem] Resolved "${keyword}" → "${match}"`);
      return match;
    }
    console.log(`[findItem] LLM returned "${resolved}" but not in names list`);
    return null;
  } catch (error) {
    console.error("[findItem] Name resolution failed:", error);
    return null;
  }
}
