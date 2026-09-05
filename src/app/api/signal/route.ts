import { NextResponse } from "next/server";
import { generateSignal } from "@/lib/engine/signal";
import type { TradeMode } from "@/lib/engine/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const modeParam = url.searchParams.get("mode") ?? "scalping";
    const mode: TradeMode = modeParam === "day" ? "day" : "scalping";

    const signal = await generateSignal(mode);
    return NextResponse.json(
      { success: true, data: signal },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "خطأ غير معروف";
    console.error("[/api/signal] Error:", message);
    return NextResponse.json(
      { success: false, error: `فشل توليد التحليل: ${message}` },
      { status: 500 }
    );
  }
}
