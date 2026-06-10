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
  storeId?: string
): Promise<{
  system: string;
  messages: ModelMessage[];
}> {
  const limit = memorySize || DEFAULT_MEMORY_SIZE;

  // Fetch recent messages (latest N, returned in chronological order)
  let recentMessages: any[] = [];
  try {
    recentMessages = await messageService.getRecentMessages(prisma, limit);
  } catch (e) {
    console.error("Failed to fetch messages:", e);
  }

  // Allow warehouse-level custom prompt override
  let basePrompt = SYSTEM_PROMPT;
  if (storeId) {
    try {
      const { getWarehouseConfig } = await import("@/lib/connections");
      const cfg = getWarehouseConfig(storeId);
      if (cfg?.customPrompt) basePrompt = cfg.customPrompt;
    } catch {}
  }

  // Build system prompt
  let system = basePrompt;
  const today = new Date().toISOString().slice(0, 10);

  if (aiName) {
    system = `## YOUR CURRENT NAME: ${aiName}\nThis value comes from the database. If the user asks to rename you, call setAiName.\n\n` + system;
  }
  system += `\n\nCurrent warehouse: ${warehouseName}`;
  system += `\nToday's date: ${today} (use this to determine if expiry dates are in the past)`;

  // Convert to ModelMessage format
  const messages: ModelMessage[] = recentMessages.map((msg) => ({
    role: msg.role as "user" | "assistant" | "system",
    content: msg.content,
  }));

  return { system, messages };
}
