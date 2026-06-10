import { tool } from "ai";
import { z } from "zod";
import type { PrismaClient } from "@/generated/prisma/client";

export function makeSetAiNameTool(prisma: PrismaClient) {
  return tool({
    description:
      "Change the AI assistant's display name. Call this when the user explicitly asks to rename you, e.g. '你改名为大橘' or '以后叫你小助手'. The new name will take effect from this message onward.",
    inputSchema: z.object({
      name: z
        .string()
        .min(1)
        .max(20)
        .describe("The new display name for the AI assistant."),
    }),
    execute: async ({ name }) => {
      // Insert a system message marking the rename point.
      // Messages before this keep their original aiName; messages after use the new name.
      await prisma.message.create({
        data: { role: "system", content: `name:${name}`, aiName: name },
      });
      // Log the rename
      await prisma.log.create({
        data: { action: "rename", note: `AI 改名为: ${name}` },
      }).catch(() => {});
      return { success: true, name };
    },
  });
}
