import { generateText } from "ai";
import { getModel } from "@/agent/router";
import type { Intent } from "./types";

// ── L0: Regex patterns (bilingual: zh + en) ──

const CHAT_ONLY = /^(你好|hi|hello|hey|谢谢|thank|thanks|再见|bye|早上好|晚上好|下午好|晚安|ok|好的|嗯|哦|啊|哈哈|嘿嘿)[\s!！。.~～,，]*$/i;
const RENAME_ZH = /(?:叫你|改名|名字改成|以后叫你?)(.+)/;
const RENAME_EN = /(?:call\s+(?:you|me|yourself)\s+|rename\s+(?:to\s+)?|change\s+(?:your\s+)?name\s+to\s+)(.+)/i;

// Quantity: Arabic + Chinese numerals with measure words (bilingual)
const MW_ZH = /(?:个|瓶|包|盒|斤|公斤|箱|袋|杯|碗|盘|份|次|只|条|块|张|根)/;
const MW_EN = /(?:bottles?|packs?|boxes?|bags?|cups?|pieces?|cans?|jars?|cartons?|kg|liters?|gallons?)/;
const ARABIC_QTY = new RegExp(`(\\d+)\\s*(?:${MW_ZH.source}|${MW_EN.source})`);
const CN_QTY = new RegExp(`([一二两三四五六七八九十百千]+)\\s*${MW_ZH.source}`);
const EN_NUM_QTY = /(a|an|one|two|three|four|five|six|seven|eight|nine|ten|dozen|twenty|thirty)\s+(?:bottles?|packs?|boxes?|bags?|cups?|pieces?|cans?)/i;
const EN_NUM_MAP: Record<string, number> = { a:1, an:1, one:1, two:2, three:3, four:4, five:5, six:6, seven:7, eight:8, nine:9, ten:10, dozen:12, twenty:20, thirty:30 };

// Action detection (bilingual)
const CONSUME_ZH = /吃完|喝了|用了|扔了|丢了|没了|消灭|干掉|处理掉|吃完?了|喝完?了|用完?了|扔掉了|丢掉了|坏掉?了|过期|变质|发霉|取出|出库|消耗/;
const CONSUME_EN = /\b(ate|drank|used|finished|threw|discarded|removed|consumed|took|got\s*rid|thrown|tossed|finished\s*off|used\s*up|ran\s*out)\b/i;
const STOCKIN_ZH = /买了|入库|放进|收到|添加|新增|采购|进货/;
const STOCKIN_EN = /\b(bought|purchased|got|received|added|stocked|put|placed)\b/i;
const MOVE_ZH = /搬到|移到|挪到|移动到|搬运|搬了|换位置|放错|放错位置|位置不对|位置错了|放的位置|默认位置是什么|怎么在默认|帮我?移|帮我?搬|帮我?挪/;
const MOVE_EN = /\b(moved|relocated|transferred|shifted|put\s+\w+\s+(?:to|in|into))\b/i;
const RESTRUCTURE_ZH = /分品牌|拆分|分割|拆开|重组|分类|分一下|分开|分成/;
const RESTRUCTURE_EN = /\b(split|separate|break\s*down|categorize|reorganize|by\s+brand|classify|divide)\b/i;
const DELETE_ZH = /清空|删除|去掉|移除|清理掉/;
const DELETE_EN = /\b(delete|remove|clear|get\s*rid\s*of|wipe|empty)\b/i;
const QUERY_ZH = /盘点|查看|看看|还有|库存|有什么|还剩|剩多少|有没有|在哪|放哪|位置|怎么|多少/;
const QUERY_EN = /\b(check|look|what|how\s*many|how\s*much|where|list|show|do\s+(?:I|you|we)\s+have|inventory|search)\b/i;

// ── Chinese number parsing ──

const CN_DIGIT: Record<string, number> = {
  一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5,
  六: 6, 七: 7, 八: 8, 九: 9,
};

function parseChineseNumber(s: string): number {
  let total = 0;
  let current = 0;
  for (const ch of s) {
    if (ch === "十") { current = (current || 1) * 10; total += current; current = 0; }
    else if (ch === "百") { current = (current || 1) * 100; total += current; current = 0; }
    else if (ch === "千") { current = (current || 1) * 1000; total += current; current = 0; }
    else if (CN_DIGIT[ch] !== undefined) { current = CN_DIGIT[ch]; }
  }
  total += current;
  return total || 0;
}

// ── Extract action type ──

function isEnglish(msg: string): boolean {
  const head = msg.trim().slice(0, 30);
  // If first chars are Latin, treat as English
  return /^[a-zA-Z]/.test(head) && !/[一-鿿]/.test(head);
}

function getSignals(msg: string) {
  const en = isEnglish(msg);
  const CONSUME_SIGNAL = new RegExp(en ? CONSUME_EN : CONSUME_ZH);
  const STOCKIN_SIGNAL = new RegExp(en ? STOCKIN_EN : STOCKIN_ZH);
  const MOVE_SIGNAL = new RegExp(en ? MOVE_EN : MOVE_ZH);
  const RESTRUCTURE_SIGNAL = new RegExp(en ? RESTRUCTURE_EN : RESTRUCTURE_ZH);
  const DELETE_SIGNAL = new RegExp(en ? DELETE_EN : DELETE_ZH);
  const QUERY_SIGNAL = new RegExp(en ? QUERY_EN : QUERY_ZH);
  return { CONSUME_SIGNAL, STOCKIN_SIGNAL, MOVE_SIGNAL, RESTRUCTURE_SIGNAL, DELETE_SIGNAL, QUERY_SIGNAL, en };
}

// ── Keyword extraction ──

const VERB_CLEANUP_ZH = /仓库|清空|清空仓库|全部清空|分成|分品牌|拆分|分割|拆开|重组|分类|分一下|分开|吃了|喝了|用了|扔了|丢了|吃完|喝完|用完|扔掉|丢掉|消灭|干掉|处理掉|坏掉|坏[了掉]|过期|变质|发霉|取出|出库|消耗|买了|入库|放进|放到|放在|放入|收到|添加|新增|采购|进货|搬到|移到|挪到|移动|搬运|删除|去掉|移除|清理掉|盘点|查看|看看|库存/g;
const PARTICLE_ZH = /[的了把被刚才已经都还要想去来一下这个那个什么怎么还也会不操作搞做没][了吗呢吧啊呀]?/g;
const PUNCT_ZH = /[\s,，。！!？?、：:；;…\-—]+/g;

function extractKeywordZH(msg: string): string {
  return msg
    .replace(VERB_CLEANUP_ZH, "")
    .replace(ARABIC_QTY, "")
    .replace(CN_QTY, "")
    .replace(/[一二两三四五六七八九十百千]+\s*(?:个|瓶|包|盒|斤|公斤|箱|袋|杯|碗|盘|份|次|只|条|块|张|根)/g, "")
    .replace(PARTICLE_ZH, "")
    .replace(PUNCT_ZH, "")
    .trim();
}

function extractKeywordEN(msg: string): string {
  return msg
    // Remove quantity expressions
    .replace(/\d+\s*(?:bottles?|packs?|boxes?|bags?|cups?|pieces?|cans?|jars?|cartons?|kg|liters?|gallons?)\s*(?:of\s+)?/gi, "")
    .replace(/(?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|dozen|twenty|thirty)\s+(?:bottles?|packs?|boxes?|bags?|cups?|pieces?|cans?)\s*(?:of\s+)?/gi, "")
    // Remove action verbs
    .replace(/\b(bought|purchased|got|received|added|stocked|ate|drank|used|finished|threw|discarded|removed|consumed|took|moved|relocated|transferred|shifted|split|separate|break\s*down|reorganize|delete|remove|clear|put|placed)\b/gi, "")
    // Remove prepositions and articles
    .replace(/\b(to|in|into|from|the|a|an|of|and|also|then|now|please|for|me|my|our|by|with|all|some|any)\b/gi, "")
    // Remove punctuation
    .replace(/[.,!?;:'"()\-]+/g, "")
    .trim();
}

// ── Quantity extraction ──

function extractQty(msg: string): number | undefined {
  const en = isEnglish(msg);
  if (en) {
    const m = msg.match(/(\d+)\s*(?:bottles?|packs?|boxes?|bags?|cups?|pieces?|cans?|jars?|cartons?)/i);
    if (m) return parseInt(m[1], 10);
    const enNum = msg.match(EN_NUM_QTY);
    if (enNum) return EN_NUM_MAP[enNum[1].toLowerCase()] || undefined;
  }
  const arabic = msg.match(ARABIC_QTY);
  if (arabic) return parseInt(arabic[1], 10);
  const cn = msg.match(CN_QTY);
  if (cn) return parseChineseNumber(cn[1]);
  return undefined;
}

// ── Target extraction ──

function extractTarget(msg: string): string | undefined {
  const en = isEnglish(msg);
  if (en) {
    const m = msg.match(/(?:to|in|into)\s+([A-Za-z\s]+?)(?:[.,!?]|$)/i);
    if (m) return m[1].trim() || undefined;
  }
  const m = msg.match(/(?:到|至|去|往)\s*(.+?)(?:[\s,，。！!？?、：:]|$)/);
  if (m) return m[1].replace(/[了把被刚才已经都还要想去来这个那个]/g, "").trim() || undefined;
  return undefined;
}

// ── Multi-clause splitting (zh mostly) ──

const CLAUSE_BREAK = /[，,]\s*(?:又|还|也|再|然后|接着|还有|and\s+also|and\s+then|also\s+got|also\s+bought)/g;
const CLAUSE_MARKER = /[，,]\s*(?:又|还|也|再|然后|接着|还有|and\s+also|and\s+then)/;

function splitClauses(msg: string): string[] | null {
  if (!CLAUSE_MARKER.test(msg)) return null;
  const firstAction = msg.match(/^(买了|吃了|入库|放进|放到|放在|消耗|bought|got|purchased|ate|drank|put)\s*/i);
  const prefix = firstAction ? firstAction[1] : "";
  const parts = msg.split(CLAUSE_BREAK).map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  return parts.map((p, i) => {
    if (i === 0) return p;
    const signals = getSignals(p);
    const hasVerb = signals.STOCKIN_SIGNAL.test(p) || signals.CONSUME_SIGNAL.test(p) || signals.MOVE_SIGNAL.test(p);
    if (prefix && !hasVerb) return prefix + " " + p;
    return p;
  });
}

// ── L0: Regex classification ──

function regexClassify(msg: string): Intent | null {
  if (CHAT_ONLY.test(msg.trim())) return { type: "chat" };

  const renameMatch = msg.match(RENAME_ZH) || msg.match(RENAME_EN);
  if (renameMatch) return { type: "rename", newName: renameMatch[1].trim() };

  const { CONSUME_SIGNAL, STOCKIN_SIGNAL, MOVE_SIGNAL, RESTRUCTURE_SIGNAL, DELETE_SIGNAL, QUERY_SIGNAL, en } = getSignals(msg);

  const isConsume = CONSUME_SIGNAL.test(msg);
  const isStockIn = STOCKIN_SIGNAL.test(msg);
  const isMove = MOVE_SIGNAL.test(msg);
  const isRestructure = RESTRUCTURE_SIGNAL.test(msg);
  const isDelete = DELETE_SIGNAL.test(msg);
  const isQuery = QUERY_SIGNAL.test(msg);

  let keyword = en ? extractKeywordEN(msg) : extractKeywordZH(msg);
  const qty = extractQty(msg);

  // Downgrade to query if keyword is clearly not an item name
  if (/^(你|我|怎么|什么|吗|呢|吧|啊|操作|不会|搞|没|这|那|you|how|what|why|when|who|can|will|please|just)/i.test(keyword) || keyword.length > 15) {
    return { type: "query", keyword: "" };
  }

  // Priority: consume > restructure > move > stockIn > delete > query
  if (isConsume) {
    return { type: "mutate", action: "consume", keyword: keyword || msg, qty };
  }
  if (isRestructure) {
    return { type: "restructure", keyword: keyword || "可乐" };
  }
  if (isMove) {
    const target = extractTarget(msg);
    if (target) keyword = keyword.replace(new RegExp(target, "gi"), "").replace(/到$/g, "").trim();
    return { type: "mutate", action: "move", keyword: keyword || msg, qty, target };
  }
  if (isStockIn) {
    const target = extractTarget(msg);
    if (target) keyword = keyword.replace(new RegExp(target, "gi"), "").replace(/到$/g, "").trim();
    return { type: "mutate", action: "stockIn", keyword: keyword || msg, qty, target };
  }
  if (isDelete) {
    return { type: "mutate", action: "delete", keyword: keyword || msg };
  }
  if (isQuery) {
    return { type: "query", keyword: keyword || undefined };
  }

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
        `Options: query | consume | stockIn | move | delete | restructure | rename | chat`,
        ``,
        `consume = user removed/ate/drank/used/threw/discarded/finished something`,
        `stockIn = user bought/received/added/stocked something`,
        `move = user moved/relocated something`,
        `delete = user wants to remove an item type from the system`,
        `restructure = user wants to split/reorganize/categorize/break down an item into sub-items or brands`,
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
        return { type: "mutate", action: word === "consume" ? "consume" : "stockIn", keyword: isEnglish(msg) ? extractKeywordEN(msg) : extractKeywordZH(msg) || msg };
      case "move":
        return { type: "mutate", action: "move", keyword: isEnglish(msg) ? extractKeywordEN(msg) : extractKeywordZH(msg) || msg, target: extractTarget(msg) };
      case "delete":
        return { type: "mutate", action: "delete", keyword: isEnglish(msg) ? extractKeywordEN(msg) : extractKeywordZH(msg) || msg };
      case "restructure":
        return { type: "restructure", keyword: isEnglish(msg) ? extractKeywordEN(msg) : extractKeywordZH(msg) || "" };
      case "query":
        return { type: "query", keyword: isEnglish(msg) ? extractKeywordEN(msg) : extractKeywordZH(msg) || undefined };
      case "rename":
        return { type: "rename", newName: msg.replace(/[叫你改名名字改成以后]/g, "").replace(/(?:call\s+(?:you|me|yourself)\s+|rename\s+(?:to\s+)?|change\s+(?:your\s+)?name\s+to\s+)/i, "").trim() };
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

// ── Main entry: returns Intent[] ──

export async function classifyIntent(userMessage: string, language: string, modelId: string): Promise<Intent[]> {
  const clauses = splitClauses(userMessage);
  if (clauses && clauses.length > 1) {
    console.log(`[Intent] Multi-clause: ${clauses.length} clauses`);
    return clauses.map((c, i) => {
      const intent = regexClassify(c);
      console.log(`[Intent]   Clause ${i}: "${c.slice(0, 40)}" → ${intent?.type || "regex miss"}`);
      return intent || { type: "query" as const, keyword: c };
    });
  }

  const regexResult = regexClassify(userMessage);
  if (regexResult) {
    console.log(`[Intent] Regex → ${regexResult.type}${regexResult.type === "mutate" ? ` ${(regexResult as any).action} "${(regexResult as any).keyword}" qty=${(regexResult as any).qty}` : ""}`);
    return [regexResult];
  }

  console.log(`[Intent] Regex miss, falling back to generateText for: "${userMessage.slice(0, 80)}"`);
  const textResult = await textClassify(userMessage, modelId);
  console.log(`[Intent] Text → ${textResult.type}${textResult.type === "mutate" ? ` ${(textResult as any).action} "${(textResult as any).keyword}"` : ""}`);
  return [textResult];
}
