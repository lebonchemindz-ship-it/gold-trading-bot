import { NextResponse } from "next/server";
import { runSelfTraining } from "@/lib/engine/selftrainer";
import { getPersistedTraining, isTrained } from "@/lib/engine/learning";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const statusMode = url.searchParams.get("status");

    // وضع التحقق: هل البوت مدرب؟ — يقرأ الحالة المحفوظة دون إعادة تدريب
    if (statusMode === "1") {
      const model = getPersistedTraining();
      const trained = isTrained();
      return NextResponse.json(
        {
          success: true,
          trained,
          persisted: !!model,
          data: model?.result ?? null,
          weightsParam: model?.result.weightsParam ?? null,
          persistedAt: model?.persistedAt ?? null,
          note: model?.note ?? null,
        },
        { headers: { "Cache-Control": "no-store, max-age=0" } }
      );
    }

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
