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

export async function maybeSummarize(prisma: PrismaClient, config?: SummaryConfig): Promise<void> {
  if (config?.enabled === false) return;

  const threshold = config?.threshold || DEFAULT_SUMMARY_THRESHOLD;

  try {
    const count = await messageService.countSinceLastSummary(prisma);
    if (count < threshold) return;

    const dbMessages = await messageService.getDbOperationMessages(prisma);
    if (dbMessages.length === 0) return;

    const lines = dbMessages.map((msg) => {
      const timestamp = msg.createdAt.toISOString();
      return `[${timestamp}] Assistant: ${msg.content}`;
    });

    const model = getModel("deepseek/deepseek-v4-flash");
    const result = await generateText({
      model,
      system: SUMMARIZER_PROMPT,
      prompt: lines.join("\n\n"),
    });

    await messageService.saveSummary(prisma, result.text);
  } catch (error) {
    console.error("Summarization failed:", error);
  }
}
