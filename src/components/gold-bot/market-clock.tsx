"use client";

// ============================================================
// ساعة السوق الحية — حالة فتح/غلق XAU/USD + الجلسات الأربع
// بدقة التوقيت الصيفي (DST) عبر Intl على جهاز المستخدم
// السوق: الأحد 17:00 نيويورك → الجمعة 17:00 نيويورك
// مع استراحة صيانة يومية 17:00-18:00 ET
// ============================================================

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Clock, Globe2, Power, Coffee } from "lucide-react";
import { cn } from "@/lib/utils";

const TZ = {
  sydney: "Australia/Sydney",
  tokyo: "Asia/Tokyo",
  london: "Europe/London",
  newyork: "America/New_York",
};

const SESSIONS = [
  { key: "sydney", nameAr: "سيدني", tz: TZ.sydney, open: 8, close: 17, quality: 25, desc: "سيولة رقيقة" },
  { key: "tokyo", nameAr: "طوكيو", tz: TZ.tokyo, open: 9, close: 18, quality: 40, desc: "بناء النطاق الآسيوي" },
  { key: "london", nameAr: "لندن", tz: TZ.london, open: 8, close: 17, quality: 85, desc: "أعلى حجم أوروبي" },
  { key: "newyork", nameAr: "نيويورك", tz: TZ.newyork, open: 8, close: 17, quality: 75, desc: "الأخبار الأمريكية" },
] as const;

const WEEK_AR = [
  { en: "Sun", ar: "الأحد", short: "أحد" },
  { en: "Mon", ar: "الاثنين", short: "إثن" },
  { en: "Tue", ar: "الثلاثاء", short: "ثلا" },
  { en: "Wed", ar: "الأربعاء", short: "أرب" },
  { en: "Thu", ar: "الخميس", short: "خمي" },
  { en: "Fri", ar: "الجمعة", short: "جمع" },
  { en: "Sat", ar: "السبت", short: "سبت" },
];

interface Parts {
  h: number;
  m: number;
  s: number;
  weekday: string;
}

function partsIn(d: Date, tz: string): Parts {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "short",
      hourCycle: "h23",
    }).formatToParts(d);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    return {
      h: parseInt(get("hour"), 10) % 24,
      m: parseInt(get("minute"), 10),
      s: parseInt(get("second"), 10),
      weekday: get("weekday"),
    };
  } catch {
    const u = {
      h: d.getUTCHours(),
      m: d.getUTCMinutes(),
      s: d.getUTCSeconds(),
      weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getUTCDay()],
    };
    return u;
  }
}

function fmtCountdown(totalSec: number): string {
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = Math.floor(totalSec % 60);
  if (d > 0) return `${d}ي ${h}س ${m}د`;
  if (h > 0) return `${h}س ${m}د ${s}ث`;
  if (m > 0) return `${m}د ${s}ث`;
  return `${s}ث`;
}

// ---------- حالة السوق الرئيسة ----------
function marketStatus(now: Date) {
  const ny = partsIn(now, TZ.newyork);
  const dec = ny.h + ny.m / 60 + ny.s / 3600;

  const isSat = ny.weekday === "Sat";
  const isSun = ny.weekday === "Sun";
  const friClosed = ny.weekday === "Fri" && dec >= 17;
  const sunBefore = isSun && dec < 17;

  // استراحة الصيانة اليومية 17:00-18:00 ET (إثن-خميس)
  const inBreak =
    (ny.weekday === "Mon" || ny.weekday === "Tue" || ny.weekday === "Wed" || ny.weekday === "Thu") &&
    dec >= 17 &&
    dec < 18;

  // ثواني حتى لحظة معينة اليوم (ET)
  const secsUntilToday = (target: number) => (target - dec) * 3600;
  // ثواني حتى يوم + ساعة لاحقة
  const dayIdx = (w: string) => WEEK_AR.findIndex((x) => x.en === w);
  const secsUntilNext = (targetDay: number, targetHour: number) => {
    const cur = dayIdx(ny.weekday);
    let days = (targetDay - cur + 7) % 7;
    let secs = days * 86400 + secsUntilToday(targetHour);
    if (secs < 0) secs += 7 * 86400;
    return secs;
  };

  if (isSat || friClosed) {
    return {
      open: false,
      break_: false,
      countdown: secsUntilNext(0, 17), // الأحد 17:00 ET
      label: "السوق مغلق — عطلة نهاية الأسبوع",
      sub: "يفتح الأحد 17:00 بتوقيت نيويورك",
    };
  }
  if (sunBefore) {
    return {
      open: false,
      break_: false,
      countdown: secsUntilToday(17),
      label: "السوق مغلق — بانتظار افتتاح الأحد",
      sub: "افتتاح هذا الأسبوع بعد",
    };
  }
  if (inBreak) {
    return {
      open: false,
      break_: true,
      countdown: secsUntilToday(18),
      label: "استراحة الصيانة اليومية",
      sub: "يعود التداول الساعة 18:00 بتوقيت نيويورك — بعد",
    };
  }
  // مفتوح — العدّاد حتى الإغلاق القادم
  if (ny.weekday === "Fri") {
    return {
      open: true,
      break_: false,
      countdown: secsUntilToday(17),
      label: "السوق مفتوح — إغلاق أسبوعي اليوم",
      sub: "يغلق الجمعة 17:00 بتوقيت نيويورك — بعد",
    };
  }
  if (dec >= 18) {
    return {
      open: true,
      break_: false,
      countdown: 86400 - secsUntilToday(18) + secsUntilToday(17),
      label: "السوق مفتوح — جلسة آسيوية جديدة",
      sub: "استراحة الغد 17:00 ET — بعد",
    };
  }
  return {
    open: true,
    break_: false,
    countdown: secsUntilToday(17),
    label: "السوق مفتوح الآن",
    sub: "استراحة الغد 17:00 بتوقيت نيويورك — بعد",
  };
}

export function MarketClock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const tick = () => setNow(new Date());
    const raf = requestAnimationFrame(tick);
    const t = setInterval(tick, 1000);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(t);
    };
  }, []);

  const status = useMemo(() => (now ? marketStatus(now) : null), [now]);

  if (!now || !status) {
    return <div className="h-32 rounded-xl bg-zinc-900/50 animate-pulse" />;
  }

  const utcParts = partsIn(now, "UTC");
  const utcTime = `${String(utcParts.h).padStart(2, "0")}:${String(utcParts.m).padStart(2, "0")}:${String(utcParts.s).padStart(2, "0")}`;

  const ny = partsIn(now, TZ.newyork);
  const todayEn = ny.weekday;
  const overlap = SESSIONS.find((s) => s.key === "london") && SESSIONS.find((s) => s.key === "newyork");
  void overlap;

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-zinc-800 bg-[#101013] overflow-hidden"
    >
      {/* الشريط الرئيسي: الحالة + العدّاد */}
      <div className="p-4 flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-zinc-800/70">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "w-11 h-11 rounded-xl flex items-center justify-center shrink-0",
              status.open
                ? "bg-emerald-500/15 border border-emerald-500/40"
                : status.break_
                  ? "bg-amber-500/15 border border-amber-500/40"
                  : "bg-rose-500/15 border border-rose-500/40"
            )}
          >
            {status.open ? (
              <Power className="w-5 h-5 text-emerald-400" />
            ) : status.break_ ? (
              <Coffee className="w-5 h-5 text-amber-400" />
            ) : (
              <Power className="w-5 h-5 text-rose-400" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "text-sm font-black",
                  status.open ? "text-emerald-400" : status.break_ ? "text-amber-400" : "text-rose-400"
                )}
              >
                {status.label}
              </span>
              {status.open && (
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" aria-hidden />
              )}
            </div>
            <div className="text-[11px] text-zinc-500 flex items-center gap-1.5 flex-wrap">
              <span>{status.sub}</span>
              <span className="text-amber-300 font-bold tabular-nums" dir="ltr">
                {fmtCountdown(status.countdown)}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4 mr-auto text-[11px] text-zinc-400">
          <span className="flex items-center gap-1.5">
            <Globe2 className="w-3.5 h-3.5 text-zinc-600" />
            <span className="text-zinc-600">توقيت غرينتش</span>
            <span className="tabular-nums font-bold text-zinc-300" dir="ltr">
              {utcTime}
            </span>
          </span>
          <span className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-zinc-600" />
            <span className="text-zinc-600">نيويورك</span>
            <span className="tabular-nums font-bold text-zinc-300" dir="ltr">
              {String(ny.h).padStart(2, "0")}:{String(ny.m).padStart(2, "0")}
            </span>
          </span>
        </div>
      </div>

      {/* بطاقات الجلسات */}
      <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-y lg:divide-y-0 divide-zinc-800/70" dir="rtl">
        {SESSIONS.map((s) => {
          const lp = partsIn(now, s.tz);
          const dec = lp.h + lp.m / 60 + lp.s / 3600;
          const inMaintenance = s.key === "newyork" && status.break_;
          const activeSession = dec >= s.open && dec < s.close && status.open && !inMaintenance;
          const progress = activeSession ? ((dec - s.open) / (s.close - s.open)) * 100 : 0;
          const minsToOpen = activeSession
            ? null
            : dec < s.open
              ? Math.round((s.open - dec) * 60)
              : Math.round((24 - dec + s.open) * 60);

          return (
            <div key={s.key} className={cn("p-3.5 relative", activeSession && "bg-amber-500/[0.04]")}>
              <div className="flex items-center justify-between mb-1.5">
                <span className={cn("text-xs font-bold", activeSession ? "text-amber-300" : "text-zinc-400")}>
                  {s.nameAr}
                </span>
                <span
                  className={cn(
                    "text-[9px] font-bold px-1.5 py-0.5 rounded-full border tabular-nums",
                    activeSession
                      ? "text-emerald-400 border-emerald-500/40 bg-emerald-500/10"
                      : "text-zinc-500 border-zinc-700"
                  )}
                >
                  {activeSession ? "نشطة" : `يفتح خلال ${minsToOpen != null && minsToOpen > 2880 ? `${Math.floor(minsToOpen / 1440)}ي` : `${minsToOpen ?? "?"}د`}`}
                </span>
              </div>
              <div className="text-[10px] text-zinc-600 mb-2">
                {s.desc} · {String(s.open).padStart(2, "0")}:00-{String(s.close).padStart(2, "0")}:00 محلي
              </div>
              {/* شريط التقدم */}
              <div className="h-1.5 rounded-full bg-zinc-800/80 overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-1000",
                    activeSession ? "bg-gradient-to-l from-amber-500 to-yellow-400" : "bg-zinc-700"
                  )}
                  style={{ width: `${activeSession ? Math.min(progress, 100) : 0}%` }}
                />
              </div>
              <div className="mt-1.5 text-[10px] text-zinc-500 tabular-nums" dir="ltr">
                {String(lp.h).padStart(2, "0")}:{String(lp.m).padStart(2, "0")} محلي
              </div>
            </div>
          );
        })}
      </div>

      {/* شريط أيام الأسبوع */}
      <div className="p-3 border-t border-zinc-800/70">
        <div className="grid grid-cols-7 gap-1.5">
          {WEEK_AR.map((d) => {
            const isToday = d.en === todayEn;
            // أيام التداول: من الأحد 17:00 (جزئياً) حتى الجمعة 17:00
            const tradingDay = d.en !== "Sat" && !(d.en === "Sun" && ny.h < 17) && !(d.en === "Fri" && ny.h >= 17);
            return (
              <div
                key={d.en}
                className={cn(
                  "rounded-lg px-1 py-1.5 text-center border",
                  isToday
                    ? "border-amber-500/50 bg-amber-500/10"
                    : tradingDay
                      ? "border-zinc-800 bg-zinc-900/50"
                      : "border-zinc-800/50 bg-zinc-900/20 opacity-50"
                )}
              >
                <div className={cn("text-[10px] font-bold", isToday ? "text-amber-300" : "text-zinc-400")}>
                  {d.ar}
                </div>
                <div className="text-[8px] text-zinc-600 mt-0.5">
                  {d.en === "Sat" ? "مغلق" : d.en === "Sun" ? "17:00+" : d.en === "Fri" ? "حتى 17:00" : "24 ساعة"}
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-2 text-[10px] text-zinc-600 leading-relaxed">
          أيام تداول الذهب: من مساء الأحد حتى مساء الجمعة (بتوقيت نيويورك) مع استراحة صيانة يومية من 17:00 إلى
          18:00 — التوقيت أعلاه محسوب بدقة التوقيت الصيفي/الشتوي تلقائياً.
        </div>
      </div>
    </motion.section>
  );
}
