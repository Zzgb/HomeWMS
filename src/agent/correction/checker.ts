import { generateText } from "ai";
import { getModel } from "@/agent/router";

export interface CorrectionResult {
  needsCorrection: boolean;
  reason: string;
  /** e.g. "move ITEM: 无糖百事可乐 TARGET: 冰箱 QTY: 10" */
  correctedAction?: string;
}

/**
 * L5 correction check: LLM text check + hard DB verification.
 * DB verification is the authoritative source — it catches cases
 * where the LLM confidently hallucinated correct-looking results.
 */
export async function checkCorrection(
  userMessage: string,
  intents: any[],
  toolResults: any[],
  responseText: string,
  modelId: string,
  prisma: any
): Promise<CorrectionResult> {
  // ── Fabrication detection: only trigger when response claims SUCCESS but tools FAILED or didn't run ──
  const claimedSuccess =
    /(已清空|已删除|删除成功|出库成功|入库成功|移动成功|✅\s*成功|操作成功|已完成|successfully\s+(deleted|removed|cleared))/i.test(responseText);
  const queryOnly = toolResults.every((r) => r.toolName === "findItem" || r.toolName === "checkStock");
  const mutationFailed = toolResults.some(
    (r) => ["deleteItem", "consumeItem", "stockIn", "moveItem"].includes(r.toolName) && !r.success
  );

  if (claimedSuccess && (queryOnly || mutationFailed)) {
    const detail = mutationFailed
      ? "mutation tool FAILED but response claimed success"
      : "only findItem ran but response claimed success";
    console.log(`[Agent:L5] FABRICATION DETECTED: ${detail}`);
    return {
      needsCorrection: true,
      reason: `FABRICATION: ${detail}`,
      correctedAction: undefined,
    };
  }

  // ── DB verification: hard check actual vs claimed ──
  const dbErrors: string[] = [];

  try {
    dbErrors.push(...(await verifyDB(userMessage, responseText, toolResults, prisma)));
  } catch (e) {
    console.error("[Agent:L5] DB verification error:", e);
  }

  if (dbErrors.length > 0) {
    const reason = `DB verification failed: ${dbErrors.join("; ")}`;
    console.log(`[Agent:L5] DB check FAILED: ${reason}`);
    const correctedAction = buildCorrectedAction(userMessage, intents, dbErrors);
    return { needsCorrection: true, reason, correctedAction };
  }

  // ── LLM text check: semantic mismatch detection ──
  const toolSummary =
    toolResults.length > 0
      ? toolResults.map((r) => `${r.toolName}=${r.success ? "success" : "failed"}`).join(", ")
      : "none";

  const prompt = [
    `Check if the system correctly handled the user's request:`,
    ``,
    `User message: "${userMessage}"`,
    `Intents: ${JSON.stringify(intents)}`,
    `Tools executed: ${toolSummary}`,
    `Response: "${responseText.slice(0, 600)}"`,
    ``,
    `Did the system correctly fulfill the user's request?`,
    ``,
    `Reply YES or NO. If NO, add a second line: ACTION: <move|stockIn|consume|delete|query> ITEM: <name> TARGET: <location>`,
    ``,
    `Examples where answer is NO:`,
    `- User said "放到冰箱" but item went to default location`,
    `- User implied a move/relocate but system only queried`,
    `- User specified a location that was ignored`,
    ``,
    `Examples where answer is YES:`,
    `- System correctly reported item location`,
    `- System correctly performed the requested mutation`,
    `- Casual conversation with no inventory action expected`,
  ].join("\n");

  try {
    const model = getModel(modelId);
    const { text } = await generateText({
      model,
      prompt,
      temperature: 0,
    });

    const trimmed = text.trim();
    const needsCorrection = trimmed.toUpperCase().startsWith("NO");

    let correctedAction: string | undefined;
    if (needsCorrection) {
      const actionMatch = trimmed.match(/ACTION:\s*(.+)/i);
      if (actionMatch) correctedAction = actionMatch[1].trim();
    }

    console.log(`[Agent:L5] LLM check: ${needsCorrection ? "NEEDS CORRECTION" : "OK"}`);
    if (needsCorrection) {
      console.log(`[Agent:L5] Reason: ${trimmed.slice(0, 200)}`);
      console.log(`[Agent:L5] Corrected action: ${correctedAction || "none extracted"}`);
    }

    return { needsCorrection, reason: trimmed, correctedAction };
  } catch (error) {
    console.error("[Agent:L5] LLM check failed:", error);
    return { needsCorrection: false, reason: "L5 check error" };
  }
}

// ── DB verification ──

async function verifyDB(
  userMessage: string,
  responseText: string,
  toolResults: any[],
  prisma: any
): Promise<string[]> {
  const errors: string[] = [];

  // Extract items mentioned in the user message
  const itemNames = extractItemNames(userMessage);
  if (itemNames.length === 0) return errors;

  for (const name of itemNames) {
    try {
      const item = await prisma.item.findFirst({
        where: { name: { contains: name, mode: "insensitive" } },
        include: { stocks: { include: { spot: true } } },
      });

      if (!item) {
        // Item doesn't exist yet — check if it was supposed to be created
        const mutations = toolResults.filter((r) =>
          ["stockIn", "createItem"].includes(r.toolName) && r.success
        );
        const created = mutations.some((r) =>
          (r.args as any)?.itemName?.toLowerCase().includes(name.toLowerCase())
        );
        if (!created) {
          errors.push(`"${name}" not found in DB and was not created`);
        }
        continue;
      }

      const totalQty = item.stocks.reduce((sum: number, s: any) => sum + s.qty, 0);

      // Check if response claims a specific quantity that doesn't match DB
      const claimedQty = extractClaimedQty(responseText, name);
      if (claimedQty !== null && claimedQty !== totalQty) {
        errors.push(`"${name}" DB qty=${totalQty} but L4 claimed ${claimedQty}`);
      }

      // Check spot: if user mentioned a specific location, verify it
      const userSpot = extractTargetFromMessage(userMessage);
      if (userSpot && item.stocks.length > 0) {
        const dbSpots = item.stocks.map((s: any) => s.spot.name);
        const spotMatch = dbSpots.some((s: string) =>
          s.toLowerCase().includes(userSpot.toLowerCase()) ||
          userSpot.toLowerCase().includes(s.toLowerCase())
        );
        if (!spotMatch) {
          errors.push(
            `"${name}" user wanted "${userSpot}" but DB spots: ${dbSpots.join(", ")}`
          );
        }
      }
    } catch (e) {
      console.error(`[Agent:L5] DB check error for "${name}":`, e);
    }
  }

  return errors;
}

// ── Helpers ──

/** Extract item names from user message (between action word and quantity/target) */
function extractItemNames(msg: string): string[] {
  const names: string[] = [];
  // Find patterns like "买了十瓶X" or "X放到"
  const pattern = /(?:买了|吃了|入库|放进|放到|放在|用了|消耗)(?:\s*[一二两三四五六七八九十百千\d]+\s*[个瓶包盒斤公斤箱袋杯碗盘份次只条块张根])?\s*(.+?)(?:[，,\s]*(?:又|还|也|再|然后|接着|还有|放到|放在|$))/g;
  let m;
  while ((m = pattern.exec(msg)) !== null) {
    const raw = m[1].replace(/[了到放的位置在哪]$/g, "").trim();
    if (raw && raw.length < 30) names.push(raw);
  }
  // Fallback: if pattern didn't match, try extracting between qty and target
  if (names.length === 0) {
    const fallback = msg.match(/(?:瓶|个|包|盒|斤|箱)\s*(.+?)(?:[，,\s]*(?:放到|放在|到|$))/);
    if (fallback) {
      const cleaned = fallback[1].replace(/[了]$/g, "").trim();
      if (cleaned && cleaned.length < 30) names.push(cleaned);
    }
  }
  return names;
}

/** Extract quantity claimed in response for a specific item */
function extractClaimedQty(responseText: string, itemName: string): number | null {
  // Look for patterns like "无糖可口可乐 × 10瓶" or "无糖可口可乐：10瓶"
  const escaped = itemName.replace(/[.*+?^${}()|[\]\\]/g, "");
  const pattern = new RegExp(
    `${escaped}[\\s\\S]{0,30}?(?:×|x|\\*)?\\s*(\\d+)\\s*(?:瓶|个|包|盒|斤|份)`,
    "i"
  );
  const m = responseText.match(pattern);
  if (m) return parseInt(m[1], 10);
  return null;
}

/** Extract target location from user message */
function extractTargetFromMessage(msg: string): string | undefined {
  const m = msg.match(/(?:到|至|去|往)\s*(.+?)(?:[\s,，。！!？?、：:]|$)/);
  if (m) {
    return m[1].replace(/[了把被刚才已经都还要想去来这个那个]/g, "").trim() || undefined;
  }
  return undefined;
}

/** Build corrected action string(s) from DB errors. One action per missing item. */
function buildCorrectedAction(
  userMessage: string,
  intents: any[],
  dbErrors: string[]
): string | undefined {
  if (dbErrors.length === 0) return undefined;

  const target = extractTargetFromMessage(userMessage);
  const firstIntent = intents[0];
  const isStockIn = firstIntent?.type === "mutate" && firstIntent.action === "stockIn";

  // Extract all item names from DB errors
  const itemNames: string[] = [];
  for (const err of dbErrors) {
    const m = err.match(/"(.+?)"/);
    if (m && !itemNames.includes(m[1])) itemNames.push(m[1]);
  }

  if (itemNames.length === 0) return undefined;

  // Build action per item, separated by newlines
  return itemNames
    .map((name) => {
      if (isStockIn) {
        return target
          ? `stockIn ITEM: ${name} TARGET: ${target}`
          : `stockIn ITEM: ${name}`;
      }
      return target
        ? `move ITEM: ${name} TARGET: ${target}`
        : `query ITEM: ${name}`;
    })
    .join("\n");
}
