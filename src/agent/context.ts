import type { ModelMessage } from "ai";
import type { PrismaClient } from "@/generated/prisma/client";
import { SYSTEM_PROMPT } from "@/lib/prompts";
import { messageService } from "@/services/message.service";
import { DEFAULT_MEMORY_SIZE } from "@/lib/constants";

export async function assembleContext(
  prisma: PrismaClient,
  warehouseName: string,
  memorySize?: number,
  aiName?: string,
  storeId?: string,
  contextMode?: string,
  summaryCount?: number,
  language?: string
): Promise<{
  system: string;
  messages: ModelMessage[];
}> {
  // Build system prompt
  let basePrompt = SYSTEM_PROMPT;
  if (storeId) {
    try {
      const { getWarehouseConfig } = await import("@/lib/connections");
      const cfg = getWarehouseConfig(storeId);
      if (cfg?.customPrompt) basePrompt = cfg.customPrompt;
    } catch {}
  }

  let system = basePrompt;
  const today = new Date().toISOString().slice(0, 10);

  if (aiName) {
    system = `## YOUR CURRENT NAME: ${aiName}\nThis value comes from the database. If the user asks to rename you, call setAiName.\n\n` + system;
  }
  system += `\n\nCurrent warehouse: ${warehouseName}`;
  system += `\n\nToday's date: ${today}. To check if an item is expired: if expiryDate string < "${today}", it IS expired (compare as strings, YYYY-MM-DD format sorts correctly).`;

  // Language instruction
  const LANG_MAP: Record<string, string> = {
    zh: "You MUST reply in Chinese (中文). All responses must be in Chinese.",
    en: "You MUST reply in English. All responses must be in English.",
    ja: "You MUST reply in Japanese (日本語). All responses must be in Japanese.",
  };
  system += `\n\n${LANG_MAP[language || "zh"] || LANG_MAP.zh}`;

  // Fetch context based on mode
  const contextMessages: any[] = [];

  if (contextMode === "summary") {
    // Summary-only: use only compressed summaries as context
    try {
      const summaries = await messageService.getRecentSummaries(prisma, summaryCount);
      if (summaries.length > 0) {
        summaries.reverse();
        const summaryText = summaries.map((s, i) =>
          `[Summary ${i + 1}] ${s.content}`
        ).join("\n\n");
        contextMessages.push({
          role: "system",
          content: `## Recent warehouse activity summaries\n${summaryText}\n\nThese summaries describe past warehouse operations. Use them as context.`,
        });
      }
    } catch (e) {
      console.error("Failed to fetch summaries:", e);
    }
  } else {
    // recent or hybrid: fetch recent messages
    const limit = memorySize || DEFAULT_MEMORY_SIZE;
    try {
      const msgs = await messageService.getRecentMessages(prisma, limit);
      contextMessages.push(...msgs);
    } catch (e) {
      console.error("Failed to fetch messages:", e);
    }

    // hybrid: also inject summaries at the head
    if (contextMode === "hybrid") {
      try {
        const summaries = await messageService.getRecentSummaries(prisma, summaryCount);
        if (summaries.length > 0) {
          summaries.reverse();
          const summaryText = summaries.map((s, i) =>
            `[Summary ${i + 1}] ${s.content}`
          ).join("\n\n");
          contextMessages.unshift({
            role: "system",
            content: `## Recent warehouse activity summaries\n${summaryText}\n\nUse these summaries to understand past operations. The full message history follows.`,
          });
        }
      } catch (e) {
        console.error("Failed to fetch summaries:", e);
      }
    }
  }

  // Convert to ModelMessage format (preserve id for dedup)
  const messages: ModelMessage[] = contextMessages.map((msg) => ({
    role: msg.role as "user" | "assistant" | "system",
    content: msg.content,
    id: msg.id,
  } as ModelMessage & { id?: string }));

  return { system, messages };
}
