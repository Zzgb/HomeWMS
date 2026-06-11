import { generateText } from "ai";
import { getModel } from "@/agent/router";
import type { Intent } from "@/agent/intent/types";
import type { CallStep } from "./types";

export async function buildPlan(intent: Intent): Promise<CallStep[]> {
  switch (intent.type) {
    case "query":
      return [
        {
          toolName: "findItem",
          argsBuilder: () => ({ keyword: intent.keyword || "" }),
        },
      ];

    case "mutate": {
      const { action, keyword, qty, target } = intent;

      const findStep: CallStep = {
        toolName: "findItem",
        argsBuilder: () => ({ keyword }),
      };

      const pickName = (prev: any[]) => {
        const result = prev[0]?.result;
        if (result?.found === false) return keyword;
        const items = result?.items;
        if (items?.length) {
          const match = items.find(
            (i: any) => i.name.toLowerCase() === keyword.toLowerCase()
          );
          return match?.name || items[0].name;
        }
        return keyword;
      };

      const pickSpot = (prev: any[]) => {
        const result = prev[0]?.result;
        if (result?.found === false) return "默认位置";
        const items = result?.items;
        if (items?.length) {
          const match = items.find(
            (i: any) => i.name.toLowerCase() === keyword.toLowerCase()
          ) || items[0];
          return match?.stocks?.[0]?.spot || "默认位置";
        }
        return "默认位置";
      };

      switch (action) {
        case "consume":
          return [
            findStep,
            {
              toolName: "consumeItem",
              argsBuilder: (prev) => ({
                itemName: pickName(prev),
                qty: qty || 1,
                spot: pickSpot(prev),
              }),
            },
          ];
        case "stockIn":
          return [
            findStep,
            {
              toolName: "stockIn",
              argsBuilder: (prev) => ({
                itemName: pickName(prev),
                qty: qty || 1,
                spot: target || pickSpot(prev),
              }),
            },
          ];
        case "move":
          return [
            findStep,
            {
              toolName: "moveItem",
              argsBuilder: (prev) => ({
                itemName: pickName(prev),
                fromSpot: pickSpot(prev),
                toSpot: target || "默认位置",
              }),
            },
          ];
        case "delete":
          return [
            findStep,
            {
              toolName: "deleteItem",
              argsBuilder: (prev) => {
                const result: any = prev[0]?.result;
                // keyword is empty or findItem didn't match → delete all
                if (!keyword || result?.found === false) return { itemName: "" };
                return { itemName: pickName(prev) };
              },
            },
          ];
      }
    }

    case "restructure": {
      const sourceKeyword = intent.keyword || "";

      // If no splits specified, ask LLM to propose brands/sub-items
      let resolvedSplits = intent.splits;
      if (!resolvedSplits || resolvedSplits.length === 0) {
        resolvedSplits = await resolveSplitsViaLLM(sourceKeyword);
      }

      const findStep: CallStep = {
        toolName: "findItem",
        argsBuilder: () => ({ keyword: sourceKeyword }),
      };

      return [
        findStep,
        {
          toolName: "splitItem",
          argsBuilder: (prev: any[]) => {
            const result = prev[0]?.result;
            const items = result?.items;
            const sourceItem = items?.find(
              (i: any) => i.name.toLowerCase() === sourceKeyword.toLowerCase()
            );
            const sourceName = sourceItem?.name || items?.[0]?.name || sourceKeyword;

            // Allocate source stock evenly among split targets
            const stocks = sourceItem?.stocks || [];
            const totalQty: number = stocks.reduce((sum: number, s: any) => sum + (s.qty || 0), 0);
            const splitCount = (resolvedSplits || []).length || 1;
            const baseQty = Math.floor(totalQty / splitCount);
            const remainder = totalQty % splitCount;

            const allocatedSplits = (resolvedSplits || []).map((s, i) => ({
              newName: s.newName,
              qty: baseQty + (i < remainder ? 1 : 0),
            }));

            return {
              sourceItem: sourceName,
              splits: allocatedSplits,
            };
          },
        },
      ];
    }

    case "rename":
      return [
        {
          toolName: "setAiName",
          argsBuilder: () => ({ name: intent.newName }),
        },
      ];

    case "chat":
      return [];
  }
}

// ── LLM-based split resolution ──

async function resolveSplitsViaLLM(
  sourceKeyword: string
): Promise<{ newName: string; qty: number }[] | undefined> {
  if (!sourceKeyword) return undefined;

  try {
    const model = getModel("deepseek/deepseek-v4-flash");
    const { text } = await generateText({
      model,
      temperature: 0,
      prompt: [
        `The user wants to split/categorize the item "${sourceKeyword}" into sub-items or brands.`,
        `Propose a reasonable split into 2-5 sub-items. Use your knowledge of common brands/variants.`,
        ``,
        `Output format (one per line):`,
        `ITEM: <sub-item-name>`,
        ``,
        `Example for "可乐":`,
        `ITEM: 无糖可口可乐`,
        `ITEM: 无糖百事可乐`,
        `ITEM: 有糖百事可乐`,
        ``,
        `Example for "牛奶":`,
        `ITEM: 全脂牛奶`,
        `ITEM: 脱脂牛奶`,
        ``,
        `Now split "${sourceKeyword}":`,
      ].join("\n"),
    });

    const lines = text
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.startsWith("ITEM:"));

    if (lines.length === 0) {
      console.log(`[Matcher] LLM split resolution returned no items for "${sourceKeyword}"`);
      return undefined;
    }

    const splits = lines.map((l) => ({
      newName: l.replace(/^ITEM:\s*/i, "").trim(),
      qty: 0, // qty=0 means "propose split, but let splitItem allocate from source"
    }));

    console.log(`[Matcher] LLM resolved "${sourceKeyword}" → ${splits.map((s) => s.newName).join(", ")}`);
    return splits;
  } catch (e) {
    console.error("[Matcher] LLM split resolution failed:", e);
    return undefined;
  }
}
