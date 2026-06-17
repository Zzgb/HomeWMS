import type { ModelMessage } from "ai";
import type { ContextInput, ContextOutput } from "./types";
import { detectConflicts } from "./conflict";
import { wrapContext } from "./compose";
import { SYSTEM_PROMPT } from "@/lib/prompts";
import { messageService } from "@/services/message.service";
import { DEFAULT_MEMORY_SIZE } from "@/lib/constants";
import type { PrismaClient } from "@/generated/prisma/client";

export async function assembleContext(
  prisma: PrismaClient,
  input: ContextInput
): Promise<ContextOutput> {
  const { toolResults, aiName, language, warehouseName, memorySize, contextMode } = input;

  // Build system prompt — prefer custom, fall back to default
  let system = input.systemPrompt || SYSTEM_PROMPT;
  const today = new Date().toISOString().slice(0, 10);

  if (aiName) {
    system =
      `## YOUR CURRENT NAME: ${aiName}\nThis value comes from the database. If the user asks to rename you, call setAiName.\n\n` +
      system;
  }
  system += `\n\nCurrent warehouse: ${warehouseName}`;
  system += `\n\nToday's date: ${today}. To check if an item is expired: if expiryDate string < "${today}", it IS expired.`;

  const LANG_MAP: Record<string, string> = {
    zh: "You MUST reply in Chinese (中文). All responses must be in Chinese.",
    en: "You MUST reply in English. All responses must be in English.",
  };
  system += `\n\n${LANG_MAP[language || "zh"] || LANG_MAP.zh}`;

  // Fetch context messages
  const contextMessages = await fetchContextMessages(prisma, contextMode, memorySize, input.summaries);

  // Detect conflicts
  const conflicts = detectConflicts(toolResults, contextMessages);

  // Inject conflict info as system message
  if (conflicts.length > 0) {
    const conflictLines = conflicts.map(
      (c) => `- ${c.itemName}: context says "${c.contextValue}" but DB has ${c.field}=${c.dbValue}`
    );
    contextMessages.unshift({
      role: "system",
      content: `⚠️ Context Conflicts Detected:\n${conflictLines.join("\n")}\n\n` +
        `The database is authoritative. Correct these in your response.`,
      id: undefined,
    } as any);
  }

  // Inject tool results as context
  if (toolResults.length > 0) {
    const successResults = toolResults.filter((r) => r.success);
    const failedResults = toolResults.filter((r) => !r.success);

    if (successResults.length > 0) {
      const summary = successResults
        .map((r) => `[${r.toolName}] ${JSON.stringify(r.result).slice(0, 1000)}`)
        .join("\n");
      contextMessages.unshift({
        role: "system",
        content: `✅ Verified DB Results (authoritative):\n${summary}`,
        id: undefined,
      } as any);
    }

    if (failedResults.length > 0) {
      const errors = failedResults
        .map((r) => `[${r.toolName}] ${(r.result as any)?.message || "Unknown error"}`)
        .join("\n");
      contextMessages.unshift({
        role: "system",
        content: `❌ Failed Operations:\n${errors}\n\nTell the user what went wrong. Use the available items from the failed result to suggest alternatives.`,
        id: undefined,
      } as any);
    }
  }

  // Wrap context
  const wrapped = wrapContext(contextMessages);

  // Build final messages: tool results + context
  const finalMessages: ModelMessage[] = [
    ...wrapped,
  ];

  // Add reply instruction
  const hasOnlyQuery = toolResults.length > 0 && toolResults.every((r) => r.toolName === "findItem" || r.toolName === "checkStock");
  const hasFailedMutation = toolResults.some(
    (r) => ["deleteItem", "consumeItem", "stockIn", "moveItem"].includes(r.toolName) && !r.success
  );

  if (hasFailedMutation) {
    finalMessages.push({
      role: "system",
      content:
        "❌ A mutation operation (delete/consume/stockIn/move) FAILED. " +
        "The database was NOT changed. Do NOT claim success or ✅. " +
        "Tell the user the operation FAILED and report the actual error.",
    });
  } else if (hasOnlyQuery) {
    finalMessages.push({
      role: "system",
      content:
        "⚠️ You CANNOT delete, modify, or move any items. You only have QUERY results. " +
        "ONLY report what the database shows. Do NOT claim you performed any operation. " +
        "If the user wants to delete/clear items, tell them which items exist and ask which to delete.",
    });
  } else if (toolResults.length > 0) {
    finalMessages.push({
      role: "system",
      content:
        "Use the verified DB results above. Generate a natural language response. " +
        "Do NOT fabricate data. If context conflicts, note the correction.",
    });
  } else {
    finalMessages.push({
      role: "system",
      content:
        "⚠️ No database tools were executed for this message. " +
        "You have NO verified data. Do NOT claim you checked, moved, or performed any action. " +
        "Only respond conversationally. If the user needs inventory changes, tell them to rephrase.",
    });
  }

  return { finalMessages, conflicts, system };
}

async function fetchContextMessages(
  prisma: PrismaClient,
  contextMode: string,
  memorySize: number,
  summaries: string[]
): Promise<ModelMessage[]> {
  const messages: ModelMessage[] = [];

  if (contextMode === "summary") {
    if (summaries.length > 0) {
      const summaryText = summaries
        .map((s, i) => `[Summary ${i + 1}] ${s}`)
        .join("\n\n");
      messages.push({
        role: "system",
        content: `## Recent warehouse activity summaries\n${summaryText}`,
      } as any);
    }
    return messages;
  }

  // recent or hybrid
  const limit = memorySize || DEFAULT_MEMORY_SIZE;
  try {
    const msgs = await messageService.getRecentMessages(prisma, limit);
    messages.push(
      ...msgs.map((msg) => ({
        role: msg.role as "user" | "assistant",
        content: msg.content,
      }))
    );
  } catch (e) {
    console.error("Failed to fetch messages:", e);
  }

  if (contextMode === "hybrid" && summaries.length > 0) {
    const summaryText = summaries
      .map((s, i) => `[Summary ${i + 1}] ${s}`)
      .join("\n\n");
    messages.unshift({
      role: "system",
      content: `## Recent warehouse activity summaries\n${summaryText}\n\nFull message history follows:`,
    } as any);
  }

  return messages;
}

