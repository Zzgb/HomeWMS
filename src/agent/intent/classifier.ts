import { generateObject } from "ai";
import { z } from "zod";
import { getModel } from "@/agent/router";
import type { Intent } from "./types";

const intentSchema = z.object({
  type: z.enum(["query", "mutate", "rename", "chat"]),
  action: z.enum(["consume", "stockIn", "move", "delete"]).optional(),
  keyword: z.string().optional(),
  qty: z.number().int().positive().optional(),
  target: z.string().optional(),
  newName: z.string().optional(),
});

const INTENT_PROMPT = `You are an intent classifier for a warehouse management system.
Analyze the user's message and output a structured intent.

Classification rules:
- "query": User wants to check/view/list inventory. Extract keyword if mentioned.
  Examples: "看看有什么" → query, "鸡蛋还有吗" → query(keyword="鸡蛋"), "盘点" → query
- "mutate": User wants to ADD or REMOVE or MOVE items. Determine action + keyword + qty (if specified).
  consume = 喝/吃/用/扔/取出/消耗/出库/没了/吃完了/用完了/坏了/过期
  stockIn = 入库/买了/放进/收到/入库了
  move = 移动/搬/换位置
  delete = 删除/去掉/移除(指物品类型,不是消耗)
  Examples: "吃了鸡蛋" → mutate(consume, keyword="鸡蛋"), "买了3个苹果" → mutate(stockIn, keyword="苹果", qty=3), "把牛奶搬到厨房" → mutate(move, keyword="牛奶", target="厨房")
- "rename": User wants to change the AI assistant's name.
  Example: "我叫你小明吧" → rename("小明")
- "chat": Clear casual conversation, greeting, thanks. No inventory operation involved.
  Examples: "你好", "谢谢", "今天天气怎么样"

IMPORTANT:
- Extract qty ONLY when the user explicitly states a number (e.g., "3个", "2瓶", "5斤").
- If no number stated, do NOT set qty — leave it undefined.
- Keyword should be the item name the user mentioned, in the language they used.
- When in doubt, default to "query" rather than "chat".`;

// Quick pre-check: if the message clearly contains inventory-related content,
// we can skip the LLM call entirely for query-type intents.
const INVENTORY_KEYWORDS = /盘点|查看|看看|还有|库存|有什么|还剩|剩多少|有没有|在哪|放哪|位置/;
const CONSUME_KEYWORDS = /吃了|喝了|用了|扔了|没了|吃完了|用完了|喝完了|坏了|过期|烂了|变质|发霉|丢掉|扔掉|消耗|取出|出库/;
const STOCKIN_KEYWORDS = /入库|买了|放进|收到|添加|新增/;
const MOVE_KEYWORDS = /移动|搬|换位置|挪/;
const DELETE_KEYWORDS = /删除|去掉|移除/;
const CHAT_ONLY = /^(你好|hi|hello|hey|谢谢|thank|再见|bye|早上好|晚上好|下午好|晚安)[\s!！。.]*$/i;

function quickPreCheck(userMessage: string): Intent | null {
  const msg = userMessage.trim();

  // Pure greeting → chat (confident, no LLM needed)
  if (CHAT_ONLY.test(msg)) {
    return { type: "chat" };
  }

  // Rename pattern
  const renameMatch = msg.match(/(?:叫你|改名|名字改成|以后叫你|叫你?)(.+)/);
  if (renameMatch) {
    return { type: "rename", newName: renameMatch[1].trim() };
  }

  // Contains inventory keywords → needs LLM for fine-grained classification
  const hasInventory =
    INVENTORY_KEYWORDS.test(msg) ||
    CONSUME_KEYWORDS.test(msg) ||
    STOCKIN_KEYWORDS.test(msg) ||
    MOVE_KEYWORDS.test(msg) ||
    DELETE_KEYWORDS.test(msg);

  // If no inventory signal at all, might be chat. But still go through LLM to be sure.
  // Return null = use LLM
  return null;
}

export async function classifyIntent(userMessage: string, language: string, modelId: string): Promise<Intent> {
  // Quick heuristic pre-check
  const quick = quickPreCheck(userMessage);
  if (quick) {
    console.log(`[Intent] Quick classified: ${quick.type}`);
    return quick;
  }

  try {
    const model = getModel(modelId);
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
        return { type: "query" };
    }
  } catch (error) {
    console.error("[Intent] Classification failed:", error);
    // SAFE DEFAULT: treat as query (findItem with empty keyword = list all)
    // Never skip tools on failure — findItem is read-only, always safe
    return { type: "query" };
  }
}
