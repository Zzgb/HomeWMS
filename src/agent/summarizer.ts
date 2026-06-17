import { generateText } from "ai";
import { getModel } from "@/agent/router";
import { SUMMARIZER_PROMPT } from "@/lib/prompts";
import { messageService } from "@/services/message.service";
import { DEFAULT_SUMMARY_THRESHOLD } from "@/lib/constants";
import type { PrismaClient } from "@/generated/prisma/client";

export interface SummaryConfig {
  enabled?: boolean;
  threshold?: number;
}

export async function generateSummary(
  prisma: PrismaClient,
  dbMessages: { createdAt: Date; content: string }[],
  modelId?: string
): Promise<string | null> {
  if (dbMessages.length === 0) return null;

  const lines = dbMessages.map((msg) => {
    const timestamp = msg.createdAt instanceof Date ? msg.createdAt.toISOString() : String(msg.createdAt);
    return `[${timestamp}] Assistant: ${msg.content}`;
  });

  const model = getModel(modelId || "deepseek/deepseek-v4-flash");
  const result = await generateText({
    model,
    system: SUMMARIZER_PROMPT,
    prompt: lines.join("\n\n"),
  });

  return result.text;
}

export async function maybeSummarize(prisma: PrismaClient, config?: SummaryConfig): Promise<void> {
  if (config?.enabled === false) return;

  const threshold = config?.threshold || DEFAULT_SUMMARY_THRESHOLD;

  try {
    const count = await messageService.countSinceLastSummary(prisma);
    if (count < threshold) return;

    const dbMessages = await messageService.getDbOperationMessages(prisma);
    if (dbMessages.length === 0) return;

    const text = await generateSummary(prisma, dbMessages);
    if (text) {
      await messageService.saveSummary(prisma, text);
    }
  } catch (error) {
    console.error("Summarization failed:", error);
  }
}
