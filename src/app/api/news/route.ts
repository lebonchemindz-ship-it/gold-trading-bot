import { NextResponse } from "next/server";
import { eventsOfToday, fetchCalendarWeek, fetchHeadlines } from "@/lib/engine/news";
import { getSessionInfo } from "@/lib/engine/sessions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const [calendar, headlines] = await Promise.all([fetchCalendarWeek(), fetchHeadlines()]);
    const now = new Date();
    const today = eventsOfToday(calendar, now);

    // أحداث اليوم: قادمة أولاً ثم المنقضية (الأحدث أولاً داخل كل مجموعة)
    const upcomingToday = today.filter((e) => e.time > now.getTime());
    const pastToday = today.filter((e) => e.time <= now.getTime()).reverse();

    // أهم أحداث الأسبوع القادمة (عالي التأثير فقط)
    const weekHigh = calendar
      .filter((e) => e.impact === "High" && e.time > now.getTime())
      .slice(0, 6);

    const session = getSessionInfo(now);

    return NextResponse.json(
      {
        success: true,
        data: {
          generatedAt: now.toISOString(),
          todayLabel: now.toLocaleDateString("ar-EG", { weekday: "long", day: "numeric", month: "long" }),
          today: { upcoming: upcomingToday, past: pastToday },
          weekHigh,
          headlines,
          sources: ["ForexFactory Calendar", "Google News (ذهب)", "ForexLive", "Investing.com", "CNBC", "WSJ"],
          sessionLabel: session.label,
        },
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "خطأ غير معروف";
    console.error("[/api/news] Error:", message);
    return NextResponse.json({ success: false, error: `فشل جلب الأخبار: ${message}` }, { status: 500 });
  }
}
