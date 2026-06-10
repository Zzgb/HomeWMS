import type { Intent } from "@/agent/intent/types";
import type { CallStep } from "./types";

export function buildPlan(intent: Intent): CallStep[] {
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

      // Pick item name from findItem result, or fall back to user's keyword
      const pickName = (prev: any[]) => {
        const items = prev[0]?.result?.items;
        if (items?.length) {
          const match = items.find(
            (i: any) => i.name.toLowerCase() === keyword.toLowerCase()
          );
          return match?.name || items[0].name;
        }
        return keyword;
      };

      // Pick spot from findItem result
      const pickSpot = (prev: any[]) => {
        const items = prev[0]?.result?.items;
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
              argsBuilder: (prev) => ({
                itemName: pickName(prev),
              }),
            },
          ];
      }
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
