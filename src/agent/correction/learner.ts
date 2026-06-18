import { generateText } from "ai";
import { getModel } from "@/agent/router";

/**
 * Record a correction case for later regex learning.
 * Stores raw case data in the Log table with action="correction".
 */
export async function recordCorrection(
  prisma: any,
  userMessage: string,
  intents: any[],
  correction: { reason: string; correctedAction?: string }
) {
  try {
    await prisma.log.create({
      data: {
        action: "correction",
        note: JSON.stringify({
          userMessage: userMessage.slice(0, 300),
          intents: intents.map((i) => ({ type: i.type, ...(i as any) })),
          reason: correction.reason.slice(0, 500),
          correctedAction: correction.correctedAction,
        }),
      },
    });
    console.log(`[Learner] Recorded correction case`);
  } catch (e) {
    console.error("[Learner] Failed to record correction:", e);
  }
}

/**
 * Check if we have ≥3 unprocessed correction cases.
 * If so, ask LLM to generate a candidate regex pattern.
 * Stores candidate in Log table with action="regex_candidate".
 */
export async function maybeLearn(prisma: any, modelId: string) {
  try {
    // Count unprocessed correction cases
    const count = await prisma.log.count({
      where: {
        action: "correction",
        createdAt: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // last 7 days
        },
      },
    });

    if (count < 3) {
      console.log(`[Learner] ${count}/3 correction cases, not yet threshold`);
      return;
    }

    // Check if we already generated a candidate for these cases
    const lastCandidate = await prisma.log.findFirst({
      where: { action: "regex_candidate" },
      orderBy: { createdAt: "desc" },
    });
    if (lastCandidate) {
      const lastCorrection = await prisma.log.findFirst({
        where: { action: "correction" },
        orderBy: { createdAt: "desc" },
      });
      if (
        lastCandidate &&
        lastCorrection &&
        new Date(lastCandidate.createdAt) > new Date(lastCorrection.createdAt)
      ) {
        console.log(`[Learner] Already have candidate newer than latest correction, skipping`);
        return;
      }
    }

    // Fetch correction cases
    const cases = await prisma.log.findMany({
      where: { action: "correction" },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    const messages = cases.map((c: any) => {
      try {
        const parsed = JSON.parse(c.note || "{}");
        return `"${parsed.userMessage || ""}"`;
      } catch {
        return "";
      }
    }).filter(Boolean);

    if (messages.length < 3) return;

    console.log(`[Learner] Generating regex candidate from ${messages.length} cases: ${messages.join(" | ")}`);

    // Ask LLM to generate a regex pattern — keep prompt minimal for DeepSeek Flash reliability
    const model = getModel(modelId);
    let text = "";
    try {
      const result = await generateText({
        model,
        temperature: 0,
        prompt: [
          `Find the COMMON PATTERN in these misclassified messages. Extract KEYWORDS only, not full strings.`,
          `Messages:`,
          messages.slice(0, 5).map((m: string, i: number) => `${i + 1}. ${m}`).join("\n"),
          ``,
          `Output ONE line: PATTERN: /regex/ ACTION: delete|stockIn|move|consume|restructure|query`,
          `Use alternation |, keep under 50 chars. Examples:`,
          `PATTERN: /清空|删除|去掉/ ACTION: delete`,
          `PATTERN: /split\\s+by|separate|break\\s*down/ ACTION: restructure`,
        ].join("\n"),
      });
      text = result.text;
      console.log(`[Learner] LLM response: ${text.slice(0, 200)}`);
    } catch (genErr) {
      console.error("[Learner] generateText failed for regex candidate:", genErr);
      return;
    }

    const patternMatch = text.match(/PATTERN:\s*(.+)/i);
    if (!patternMatch) {
      console.log(`[Learner] No valid PATTERN in response, raw: ${text.slice(0, 200)}`);
      return;
    }

    const candidate = patternMatch[1].trim();
    const actionMatch = text.match(/ACTION:\s*(\w+)/i);
    const actionType = actionMatch ? actionMatch[1].trim() : "";
    console.log(`[Learner] Generated candidate: ${candidate} → ${actionType || "unknown"}`);

    // Save candidate
    try {
      await prisma.log.create({
        data: {
          action: "regex_candidate",
          note: JSON.stringify({
            candidate,
            actionType,
            sourceCases: messages,
            generatedAt: new Date().toISOString(),
            status: "pending_approval",
          }),
        },
      });
      console.log(`[Learner] Candidate saved, pending user approval`);
    } catch (saveErr) {
      console.error("[Learner] Failed to save regex candidate:", saveErr);
    }
  } catch (e) {
    console.error("[Learner] maybeLearn failed:", e);
  }
}
