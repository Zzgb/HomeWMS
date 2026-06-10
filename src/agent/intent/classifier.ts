import { generateText } from "ai";
import { getModel } from "@/agent/router";
import type { Intent } from "./types";

// ── L0: Regex patterns ──

const CHAT_ONLY = /^(你好|hi|hello|hey|谢谢|thank|thanks|再见|bye|早上好|晚上好|下午好|晚安|ok|好的|嗯|哦|啊|哈哈|嘿嘿)[\s!！。.~～,，]*$/i;
const RENAME = /(?:叫你|改名|名字改成|以后叫你?)(.+)/;
const QTY_PATTERN = /(\d+)\s*(?:个|瓶|包|盒|斤|公斤|箱|袋|杯|碗|盘|份|次|只|条|块|张|根)/;

// Action detection (type only, not keyword extraction)
const CONSUME_SIGNAL = /吃完|喝了|用了|扔了|丢了|没了|消灭|干掉|处理掉|吃完?了|喝完?了|用完?了|扔掉了|丢掉了|坏掉?了|过期|变质|发霉|取出|出库|消耗/;
const STOCKIN_SIGNAL = /买了|入库|放进|收到|添加|新增|采购|进货/;
const MOVE_SIGNAL = /搬到|移到|挪到|移动到|搬运|搬了|换位置/;
const DELETE_SIGNAL = /删除|去掉|移除|清理掉/;
const QUERY_SIGNAL = /盘点|查看|看看|还有|库存|有什么|还剩|剩多少|有没有|在哪|放哪|位置|怎么|多少/;

// ── Keyword extraction ──

function extractKeyword(msg: string): string {
  let kw = msg
    // Remove action verbs
    .replace(/吃了|喝了|用了|扔了|丢了|吃完|喝完|用完|扔掉|丢掉|消灭|干掉|处理掉|坏掉|坏[了掉]|过期|变质|发霉|取出|出库|消耗|买了|入库|放进|收到|添加|新增|采购|进货|搬到|移到|挪到|移动|搬运|删除|去掉|移除|清理掉|盘点|查看|看看|库存/g, "")
    // Remove numbers + measure words
    .replace(/\d+\s*[个瓶包盒斤公斤箱袋杯碗盘份次只条块张根]?/g, "")
    // Remove common particles
    .replace(/[了的把被刚才已经都还要想去来一下这个那个什么怎么还][了吗呢吧啊呀]?/g, "")
    // Remove punctuation
    .replace(/[\s,，。！!？?、：:；;…\-—]+/g, "")
    .trim();
  return kw;
}

function extractQty(msg: string): number | undefined {
  const m = msg.match(QTY_PATTERN);
  return m ? parseInt(m[1], 10) : undefined;
}

function extractTarget(msg: string): string | undefined {
  // Target for move: the location after 到/至/去/往
  const m = msg.match(/(?:到|至|去|往)\s*(.+?)(?:[\s,，。！!？?、：:]|$)/);
  if (m) {
    const t = m[1].replace(/[了把被刚才已经都还要想去来这个那个]/g, "").trim();
    return t || undefined;
  }
  return undefined;
}

// ── L0: Regex classification ──

function regexClassify(msg: string): Intent | null {
  // Pure greeting → chat
  if (CHAT_ONLY.test(msg.trim())) {
    return { type: "chat" };
  }

  // Rename
  const renameMatch = msg.match(RENAME);
  if (renameMatch) {
    return { type: "rename", newName: renameMatch[1].trim() };
  }

  // Determine action type — first match wins (consume > stockIn > move > delete > query)
  const isConsume = CONSUME_SIGNAL.test(msg);
  const isStockIn = STOCKIN_SIGNAL.test(msg);
  const isMove = MOVE_SIGNAL.test(msg);
  const isDelete = DELETE_SIGNAL.test(msg);
  const isQuery = QUERY_SIGNAL.test(msg);

  const keyword = extractKeyword(msg);
  const qty = extractQty(msg);

  if (isConsume) {
    return { type: "mutate", action: "consume", keyword: keyword || msg, qty };
  }
  if (isStockIn) {
    return { type: "mutate", action: "stockIn", keyword: keyword || msg, qty };
  }
  if (isMove) {
    const target = extractTarget(msg);
    return { type: "mutate", action: "move", keyword: keyword || msg, qty, target };
  }
  if (isDelete) {
    return { type: "mutate", action: "delete", keyword: keyword || msg };
  }
  if (isQuery) {
    return { type: "query", keyword: keyword || undefined };
  }

  // No regex match → need LLM
  return null;
}

// ── L1: generateText fallback ──

async function textClassify(msg: string, modelId: string): Promise<Intent> {
  try {
    const model = getModel(modelId);
    const { text } = await generateText({
      model,
      temperature: 0,
      prompt: [
        `Classify this warehouse message into ONE word:`,
        `"${msg}"`,
        ``,
        `Options: query | consume | stockIn | move | delete | rename | chat`,
        ``,
        `consume = user removed/ate/drank/used/threw/discarded/finished something`,
        `stockIn = user bought/received/added/stocked something`,
        `move = user moved/relocated something`,
        `delete = user wants to remove an item type from the system`,
        `query = user wants to check inventory / see what's available`,
        `rename = user wants to change the AI assistant's name`,
        `chat = casual conversation, greeting, thanks, not inventory related`,
        ``,
        `Reply with ONLY one word from the options above.`,
      ].join("\n"),
    });

    const word = text.trim().toLowerCase();

    switch (word) {
      case "consume":
      case "stockin":
        return { type: "mutate", action: word === "consume" ? "consume" : "stockIn", keyword: extractKeyword(msg) || msg };
      case "move":
        return { type: "mutate", action: "move", keyword: extractKeyword(msg) || msg, target: extractTarget(msg) };
      case "delete":
        return { type: "mutate", action: "delete", keyword: extractKeyword(msg) || msg };
      case "query":
        return { type: "query", keyword: extractKeyword(msg) || undefined };
      case "rename":
        return { type: "rename", newName: msg.replace(/[叫你改名名字改成以后]/g, "").trim() };
      case "chat":
        return { type: "chat" };
      default:
        console.warn(`[Intent] Unexpected text classification: "${word}", defaulting to query`);
        return { type: "query" };
    }
  } catch (error) {
    console.error("[Intent] Text classification failed:", error);
    return { type: "query" };
  }
}

// ── Main entry ──

export async function classifyIntent(userMessage: string, language: string, modelId: string): Promise<Intent> {
  // L0: Regex (fast, no API call, covers 90%+ cases)
  const regexResult = regexClassify(userMessage);
  if (regexResult) {
    console.log(`[Intent] Regex → ${regexResult.type}${regexResult.type === "mutate" ? ` ${(regexResult as any).action} "${(regexResult as any).keyword}"` : ""}`);
    return regexResult;
  }

  // L1: generateText fallback (covers ambiguous/edge cases)
  console.log(`[Intent] Regex miss, falling back to generateText for: "${userMessage.slice(0, 80)}"`);
  const textResult = await textClassify(userMessage, modelId);
  console.log(`[Intent] Text → ${textResult.type}${textResult.type === "mutate" ? ` ${(textResult as any).action} "${(textResult as any).keyword}"` : ""}`);
  return textResult;
}
