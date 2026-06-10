import type { PrismaClient } from "@/generated/prisma/client";

export interface LogFilters {
  action?: string;
  itemId?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export const logService = {
  async queryLogs(prisma: PrismaClient, filters: LogFilters) {
    const { action, itemId, from, to, page = 1, pageSize = 50 } = filters;

    const where: Record<string, unknown> = {};
    if (action) where.action = action;
    if (itemId) where.itemId = itemId;
    if (from || to) {
      where.createdAt = {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(to) } : {}),
      };
    }

    const [logs, total] = await Promise.all([
      prisma.log.findMany({
        where,
        include: { item: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.log.count({ where }),
    ]);

    return { data: logs, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  },
};
