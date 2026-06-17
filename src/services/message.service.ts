import type { PrismaClient } from "@/generated/prisma/client";
import { SUMMARY_COUNT } from "@/lib/constants";

export const messageService = {
  async saveMessage(
    prisma: PrismaClient,
    role: string,
    content: string,
    toolCalls?: unknown,
    tokenCount?: number,
    aiName?: string
  ) {
    return prisma.message.create({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: { role, content, toolCalls: toolCalls as any, tokenCount, aiName },
    });
  },

  async getRecentMessages(prisma: PrismaClient, limit: number) {
    const messages = await prisma.message.findMany({
      where: { role: { not: "system" } },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return messages.reverse();
  },

  async countSinceLastSummary(prisma: PrismaClient) {
    const lastSummary = await prisma.summary.findFirst({
      orderBy: { createdAt: "desc" },
    });

    return prisma.message.count({
      where: {
        ...(lastSummary
          ? { createdAt: { gt: lastSummary.createdAt } }
          : {}),
      },
    });
  },

  async getDbOperationMessages(prisma: PrismaClient, since?: Date) {
    return prisma.message.findMany({
      where: {
        role: "assistant",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        toolCalls: { not: null } as any,
        ...(since ? { createdAt: { gt: since } } : {}),
      },
      orderBy: { createdAt: "asc" },
    });
  },

  async saveSummary(prisma: PrismaClient, content: string) {
    return prisma.summary.create({
      data: { content },
    });
  },

  async getRecentSummaries(prisma: PrismaClient, limit?: number) {
    return prisma.summary.findMany({
      orderBy: { createdAt: "desc" },
      take: limit || SUMMARY_COUNT,
    });
  },

  async deleteAll(prisma: PrismaClient): Promise<{ deleted: number; aiName: string }> {
    // Preserve the last known AI name before deleting
    const lastAiMsg = await prisma.message.findFirst({
      where: { aiName: { not: null } },
      orderBy: { createdAt: "desc" },
      select: { aiName: true },
    });
    const aiName = lastAiMsg?.aiName || "小鞠";

    const result = await prisma.message.deleteMany();
    // Re-insert aiName record so name change isn't lost
    if (result.count > 0) {
      await prisma.message.create({
        data: { role: "assistant", content: `聊天记录已清空 (${new Date().toISOString().slice(0, 10)})`, aiName },
      });
    }
    return { deleted: result.count, aiName };
  },

  async compressAndDelete(prisma: PrismaClient, modelId?: string): Promise<{ deleted: number; aiName: string }> {
    // Generate summary before deleting
    const dbMessages = await this.getDbOperationMessages(prisma);
    if (dbMessages.length > 0) {
      const { generateSummary } = await import("@/agent/summarizer");
      try {
        const summary = await generateSummary(prisma, dbMessages, modelId);
        if (summary) {
          await this.saveSummary(prisma, summary);
        }
      } catch {
        // Summary generation failed, proceed with delete anyway
      }
    }

    return this.deleteAll(prisma);
  },
};
