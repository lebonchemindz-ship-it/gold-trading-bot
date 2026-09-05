import { NextResponse } from "next/server";
import { runBacktest } from "@/lib/engine/backtest";
import { weightsToParam } from "@/lib/engine/learning";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const tfParam = url.searchParams.get("tf") ?? "1h";
    const tf = tfParam === "15m" ? "15m" : "1h";

    const result = await runBacktest(tf);

    return NextResponse.json(
      {
        success: true,
        data: result,
        // سلسلة الأوزان لتمريرها إلى /api/signal
        weightsParam: weightsToParam(result.weights.learnedLive),
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "خطأ غير معروف";
    console.error("[/api/backtest] Error:", message);
    return NextResponse.json(
      { success: false, error: `فشل التدريب: ${message}` },
      { status: 500 }
    );
  }
}
