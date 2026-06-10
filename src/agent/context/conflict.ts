import type { ModelMessage } from "ai";
import type { ToolResult } from "@/agent/orchestrator/types";
import type { Conflict } from "./types";

export function detectConflicts(
  toolResults: ToolResult[],
  contextMessages: ModelMessage[]
): Conflict[] {
  const conflicts: Conflict[] = [];

  for (const tr of toolResults) {
    if (!tr.success) continue;

    const result = tr.result as any;
    const items = result?.items || (result?.item ? [result.item] : []);

    for (const item of items) {
      const itemName = item.name;
      if (!itemName) continue;

      for (const stock of item.stocks || []) {
        const dbQty = stock.qty;
        const dbStatus = stock.status;

        // Scan context messages for conflicting claims about this item
        for (let i = 0; i < contextMessages.length; i++) {
          const msg = contextMessages[i];
          const content = typeof msg.content === "string" ? msg.content : "";
          if (!content.includes(itemName)) continue;

          // Quantity conflict: context claims a different number
          const qtyPatterns = [
            new RegExp(`${escapeRegExp(itemName)}\\s*[×xX]\\s*(\\d+)`),
            new RegExp(`${escapeRegExp(itemName)}\\s*(?:还有|剩|有)\\s*(\\d+)`),
            new RegExp(`(\\d+)\\s*(?:个|瓶|包|盒|斤|公斤)?\\s*${escapeRegExp(itemName)}`),
          ];

          for (const pattern of qtyPatterns) {
            const match = content.match(pattern);
            if (match) {
              const claimedQty = parseInt(match[1], 10);
              if (claimedQty !== dbQty) {
                conflicts.push({
                  itemName,
                  field: "qty",
                  dbValue: dbQty,
                  contextValue: match[0],
                  contextSource: i,
                });
                break;
              }
            }
          }

          // Status conflict
          if ((dbStatus === "expired" || dbStatus === "damaged") && content.includes("正常")) {
            conflicts.push({
              itemName,
              field: "status",
              dbValue: dbStatus,
              contextValue: "正常",
              contextSource: i,
            });
          }
        }
      }
    }
  }

  return conflicts;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
