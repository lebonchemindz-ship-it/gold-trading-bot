import { NextResponse } from "next/server";
import { fetchTicker } from "@/lib/engine/market";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const ticker = await fetchTicker();
    return NextResponse.json(
      { success: true, data: ticker },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "خطأ غير معروف";
    console.error("[/api/price] Error:", message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
