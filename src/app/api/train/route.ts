import { NextResponse } from "next/server";
import { runSelfTraining } from "@/lib/engine/selftrainer";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const epochsParam = url.searchParams.get("epochs") ?? "4";
    const epochs = Number(epochsParam);

    const result = await runSelfTraining(Number.isFinite(epochs) ? epochs : 4);

    return NextResponse.json(
      {
        success: true,
        data: result,
        weightsParam: result.weightsParam,
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "خطأ غير معروف";
    console.error("[/api/train] Error:", message);
    return NextResponse.json(
      { success: false, error: `فشل التدريب الذاتي: ${message}` },
      { status: 500 }
    );
  }
}
