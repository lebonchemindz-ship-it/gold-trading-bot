"use client";

// ============================================================
// لوحة الأخبار والأحداث — أحداث اليوم الاقتصادية + عناوين الذهب
// تُحدَّث عند الضغط على زر التحديث الرئيسي (كما طلب المستخدم)
// ============================================================

import { motion } from "framer-motion";
import { Newspaper, CalendarDays, Flame, Clock3, ExternalLink, Zap, History } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface CalendarEventUI {
  time: number;
  title: string;
  impact: "High" | "Medium" | "Low";
  currency: string;
  forecast: string | null;
  previous: string | null;
}

export interface HeadlineUI {
  title: string;
  link: string;
  source: string;
  time: number;
  relevant: boolean;
  score: number;
}

export interface NewsData {
  generatedAt: string;
  todayLabel: string;
  today: { upcoming: CalendarEventUI[]; past: CalendarEventUI[] };
  weekHigh: CalendarEventUI[];
  headlines: HeadlineUI[];
  sources: string[];
  sessionLabel: string;
}

const IMPACT_STYLE: Record<string, { label: string; cls: string; dot: string }> = {
  High: { label: "عالي", cls: "text-rose-300 border-rose-500/40 bg-rose-500/10", dot: "bg-rose-400" },
  Medium: { label: "متوسط", cls: "text-amber-300 border-amber-500/40 bg-amber-500/10", dot: "bg-amber-400" },
  Low: { label: "منخفض", cls: "text-zinc-400 border-zinc-700 bg-zinc-800/50", dot: "bg-zinc-500" },
};

function impactUI(impact: string) {
  return IMPACT_STYLE[impact] ?? IMPACT_STYLE.Low;
}

function timeStr(t: number): string {
  return new Date(t).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" });
}

function relTime(t: number): string {
  const diff = Date.now() - t;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "الآن";
  if (mins < 60) return `قبل ${mins} دقيقة`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `قبل ${h} ساعة`;
  return `قبل ${Math.floor(h / 24)} يوم`;
}

function untilStr(t: number): string {
  const diff = t - Date.now();
  const mins = Math.round(diff / 60000);
  if (mins < 60) return `بعد ${mins} دقيقة`;
  return `بعد ${Math.floor(mins / 60)} ساعة`;
}

function EventRow({ ev }: { ev: CalendarEventUI }) {
  const imp = impactUI(ev.impact);
  return (
    <li className="flex items-center justify-between gap-3 bg-zinc-900/60 border border-zinc-800 rounded-lg px-3 py-2.5">
      <div className="flex items-center gap-2.5 min-w-0">
        <span className={cn("w-2 h-2 rounded-full shrink-0", imp.dot)} />
        <div className="min-w-0">
          <span className="text-xs text-zinc-200 block truncate" dir="auto">
            {ev.title}
          </span>
          <span className="text-[10px] text-zinc-300">
            {ev.forecast ? `توقع: ${ev.forecast}` : "بلا توقع"}
            {ev.previous ? ` · سابق: ${ev.previous}` : ""}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded-full border", imp.cls)}>
          {imp.label}
        </span>
        <span className="text-[10px] text-amber-300/90 tabular-nums" dir="ltr">
          {timeStr(ev.time)}
        </span>
      </div>
    </li>
  );
}

export function NewsPanel({ data }: { data: NewsData }) {
  const { today, weekHigh, headlines } = data;
  const nextHigh = today.upcoming.find((e) => e.impact === "High");
  const highCount = today.upcoming.filter((e) => e.impact === "High").length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-zinc-800 bg-[#101013] p-4"
    >
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h2 className="text-sm font-bold text-zinc-200 flex items-center gap-2">
          <Newspaper className="w-4 h-4 text-amber-400" />
          أخبار وأحداث اليوم — {data.todayLabel}
        </h2>
        {nextHigh ? (
          <Badge variant="outline" className="text-[10px] border-rose-500/40 bg-rose-500/10 text-rose-300 gap-1">
            <Flame className="w-3 h-3" />
            {nextHigh.title.slice(0, 30)}… {untilStr(nextHigh.time)}
          </Badge>
        ) : highCount === 0 ? (
          <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-400/80 gap-1">
            <Zap className="w-3 h-3" />
            لا أحداث عالية التأثير متبقية اليوم
          </Badge>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* أحداث اليوم */}
        <div>
          <h3 className="text-[11px] font-bold text-zinc-400 mb-2 flex items-center gap-1.5">
            <CalendarDays className="w-3.5 h-3.5 text-amber-400/80" />
            التقويم الاقتصادي اليوم (USD) — {today.upcoming.length} قادم · {today.past.length} منقضٍ
          </h3>
          {today.upcoming.length > 0 ? (
            <ul className="flex flex-col gap-1.5">
              {today.upcoming.slice(0, 6).map((ev, i) => (
                <EventRow key={`up-${i}`} ev={ev} />
              ))}
            </ul>
          ) : (
            <p className="text-[11px] text-zinc-300 bg-zinc-900/40 border border-zinc-800 rounded-lg px-3 py-3">
              لا أحداث اقتصادية أمريكية متبقية اليوم — السوق يحركه العامل الفني وعناوين الأخبار.
            </p>
          )}
          {today.past.length > 0 && (
            <details className="mt-2 group">
              <summary className="text-[10px] text-zinc-300 cursor-pointer flex items-center gap-1.5 select-none">
                <History className="w-3 h-3" />
                أحداث اليوم المنقضية ({today.past.length})
              </summary>
              <ul className="flex flex-col gap-1.5 mt-2 opacity-80">
                {today.past.slice(0, 8).map((ev, i) => (
                  <EventRow key={`past-${i}`} ev={ev} />
                ))}
              </ul>
            </details>
          )}

          {weekHigh.length > 0 && (
            <details className="mt-2">
              <summary className="text-[10px] text-zinc-300 cursor-pointer select-none flex items-center gap-1.5">
                <Clock3 className="w-3 h-3" />
                أهم أحداث بقية الأسبوع ({weekHigh.length})
              </summary>
              <ul className="flex flex-col gap-1.5 mt-2">
                {weekHigh.map((ev, i) => (
                  <li
                    key={`wk-${i}`}
                    className="flex items-center justify-between gap-2 text-[11px] bg-zinc-900/40 border border-zinc-800/60 rounded-lg px-3 py-1.5"
                  >
                    <span className="text-zinc-400 truncate" dir="auto">
                      {ev.title}
                    </span>
                    <span className="text-[10px] text-zinc-300 tabular-nums shrink-0" dir="ltr">
                      {new Date(ev.time).toLocaleDateString("ar-EG", { weekday: "short", day: "numeric" })}{" "}
                      {timeStr(ev.time)}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>

        {/* عناوين الأخبار */}
        <div>
          <h3 className="text-[11px] font-bold text-zinc-400 mb-2 flex items-center gap-1.5">
            <Flame className="w-3.5 h-3.5 text-amber-400/80" />
            آخر عناوين الذهب والاقتصاد
            <span className="text-[9px] text-zinc-300 font-normal">(بالإنجليزية من مصادر عالمية)</span>
          </h3>
          {headlines.length > 0 ? (
            <ul className="flex flex-col gap-1.5 max-h-[380px] overflow-y-auto pl-1">
              {headlines.map((h, i) => (
                <li key={`h-${i}`}>
                  <a
                    href={h.link || "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(
                      "block bg-zinc-900/60 border rounded-lg px-3 py-2 hover:border-amber-500/40 transition-colors",
                      h.relevant ? "border-zinc-700" : "border-zinc-800/60"
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className={cn("text-[11px] leading-relaxed", h.relevant ? "text-zinc-200" : "text-zinc-400")} dir="ltr">
                        {h.title}
                      </span>
                      <ExternalLink className="w-3 h-3 text-zinc-400 shrink-0 mt-0.5" />
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[9px] text-amber-400/80 font-bold">{h.source}</span>
                      {h.relevant && (
                        <span className="text-[8px] text-amber-300/70 border border-amber-500/25 rounded px-1">
                          متصل بالذهب
                        </span>
                      )}
                      <span className="text-[9px] text-zinc-300 mr-auto">{relTime(h.time)}</span>
                    </div>
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[11px] text-zinc-300 bg-zinc-900/40 border border-zinc-800 rounded-lg px-3 py-3">
              تعذر جلب العناوين حالياً من مصادر RSS — اضغط تحديث للمحاولة مجدداً.
            </p>
          )}
        </div>
      </div>
    </motion.div>
  );
}
