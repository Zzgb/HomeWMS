import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { saveApprovedRegex } from "@/lib/connections";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ storeId: string }> }
) {
  try {
    const { storeId } = await params;
    const body = await request.json();
    const { logId, action, pattern, actionType } = body;

    if (!logId || !action) {
      return NextResponse.json(
        { error: "logId and action are required" },
        { status: 400 }
      );
    }

    if (!["approve", "reject"].includes(action)) {
      return NextResponse.json(
        { error: "action must be 'approve' or 'reject'" },
        { status: 400 }
      );
    }

    const prisma = getPrisma(storeId);
    if (!prisma) {
      console.error(`[regex/approve] Warehouse not found: ${storeId}`);
      return NextResponse.json(
        { error: "Warehouse not found" },
        { status: 404 }
      );
    }

    if (action === "approve") {
      if (!pattern) {
        return NextResponse.json(
          { error: "pattern is required for approval" },
          { status: 400 }
        );
      }

      const resolvedAction = actionType || "query";

      // Save approved regex to StoreMeta — don't silently catch
      try {
        await saveApprovedRegex(prisma, pattern, resolvedAction);
      } catch (e: any) {
        console.error(`[regex/approve] saveApprovedRegex failed:`, e.message || e);
        return NextResponse.json(
          { error: `Failed to save regex rule: ${e.message || "unknown error"}` },
          { status: 500 }
        );
      }

      // Update log entry status
      try {
        const log = await (prisma as any).log.findUnique({ where: { id: logId } });
        if (log) {
          const note = log.note ? JSON.parse(log.note) : {};
          note.status = "approved";
          note.approvedAt = new Date().toISOString();
          await (prisma as any).log.update({
            where: { id: logId },
            data: { note: JSON.stringify(note) },
          });
        }
      } catch (e: any) {
        console.error(`[regex/approve] log update failed:`, e.message || e);
        // Non-fatal — rule was saved, just couldn't update log
      }
    } else {
      // Reject: update log entry status
      try {
        const log = await (prisma as any).log.findUnique({ where: { id: logId } });
        if (log) {
          const note = log.note ? JSON.parse(log.note) : {};
          note.status = "rejected";
          note.rejectedAt = new Date().toISOString();
          await (prisma as any).log.update({
            where: { id: logId },
            data: { note: JSON.stringify(note) },
          });
        }
      } catch (e: any) {
        console.error(`[regex/approve] log reject update failed:`, e.message || e);
        return NextResponse.json(
          { error: `Failed to update log: ${e.message || "unknown error"}` },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("POST /api/settings/[storeId]/regex/approve error:", error?.message || error);
    return NextResponse.json(
      { error: `Failed: ${error?.message || "internal error"}` },
      { status: 500 }
    );
  }
}
