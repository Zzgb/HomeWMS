import { generateObject } from "ai";
import { z } from "zod";
import { getModel } from "@/agent/router";
import type { Intent } from "./types";

const intentSchema = z.object({
  type: z.enum(["query", "mutate", "rename", "chat", "unknown"]),
  action: z.enum(["consume", "stockIn", "move", "delete"]).optional(),
  keyword: z.string().optional(),
  qty: z.number().int().positive().optional(),
  target: z.string().optional(),
  newName: z.string().optional(),
  reason: z.string().optional(),
});

const INTENT_PROMPT = `You are an intent classifier for a warehouse management system.
Analyze the user's message and output a structured intent.

Classification rules:
- "query": User wants to check/view/list inventory. Extract keyword if mentioned.
  Examples: "看看有什么" → query, "鸡蛋还有吗" → query(keyword="鸡蛋"), "盘点" → query
- "mutate": User wants to ADD or REMOVE or MOVE items. Determine action + keyword + qty (if specified).
  consume = 喝/吃/用/扔/取出/消耗/出库/没了/吃完了/用完了/坏了
  stockIn = 入库/买了/放进/收到/入库了
  move = 移动/搬/换位置
  delete = 删除/去掉/移除(指物品类型,不是消耗)
  Examples: "吃了鸡蛋" → mutate(consume, keyword="鸡蛋"), "买了3个苹果" → mutate(stockIn, keyword="苹果", qty=3), "把牛奶搬到厨房" → mutate(move, keyword="牛奶", target="厨房")
- "rename": User wants to change the AI assistant's name.
  Example: "我叫你小明吧" → rename("小明")
- "chat": Casual conversation, greeting, thanks. No inventory operation.
  Examples: "你好", "谢谢", "今天天气怎么样"
- "unknown": Cannot determine intent. Provide reason.
  Example: "帮我写代码" → unknown("not warehouse related")

IMPORTANT:
- Extract qty ONLY when the user explicitly states a number (e.g., "3个", "2瓶", "5斤").
- If no number stated, do NOT set qty — leave it undefined.
- Keyword should be the item name the user mentioned, in the language they used.
- Default to "chat" for casual talk. Default to "query" for item-related questions.`;

export async function classifyIntent(userMessage: string, language: string, modelId: string): Promise<Intent> {
  const model = getModel(modelId);

  try {
    const { object } = await generateObject({
      model,
      schema: intentSchema,
      prompt: `User message: "${userMessage}"\nUser language: ${language}`,
      system: INTENT_PROMPT,
      temperature: 0,
    });

    switch (object.type) {
      case "query":
        return { type: "query", keyword: object.keyword };
      case "mutate":
        return {
          type: "mutate",
          action: object.action as "consume" | "stockIn" | "move" | "delete",
          keyword: object.keyword || "",
          qty: object.qty,
          target: object.target,
        };
      case "rename":
        return { type: "rename", newName: object.newName || "" };
      case "chat":
        return { type: "chat" };
      default:
        return { type: "unknown", reason: object.reason || "Unable to classify" };
    }
  } catch (error) {
    console.error("[Intent] Classification failed:", error);
    return { type: "unknown", reason: "Classification model error" };
  }
}
