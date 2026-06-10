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

  async getRecentSummaries(prisma: PrismaClient) {
    return prisma.summary.findMany({
      orderBy: { createdAt: "desc" },
      take: SUMMARY_COUNT,
    });
  },
};
