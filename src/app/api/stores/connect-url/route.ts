import { NextRequest, NextResponse } from "next/server";
import { registerFromUrl } from "@/lib/connections";

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json();
    if (!url) {
      return NextResponse.json({ error: "url is required" }, { status: 400 });
    }

    const result = await registerFromUrl(url);
    if (!result.success) {
      return NextResponse.json({ error: result.error || "Connection failed" }, { status: 400 });
    }

    return NextResponse.json({ success: true, storeId: result.id });
  } catch (error) {
    console.error("POST /api/stores/connect-url error:", error);
    return NextResponse.json({ error: "Failed to connect" }, { status: 500 });
  }
}
