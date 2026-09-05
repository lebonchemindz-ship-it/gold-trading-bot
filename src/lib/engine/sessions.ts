// ============================================================
// الجلسات — بدقة التوقيت الصيفي/الشتوي (DST) عبر Intl
// حساب الساعات المحلية لكل مركز مالي من زمن UTC مباشرة:
// سيدني/طوكيو/لندن/نيويورك — فيكون الفتح والإغلاق صحيحاً دائماً
// السوق (OTC مثل XAU/USD): يفتح الأحد 17:00 نيويورك ويغلق الجمعة 17:00
// مع استراحة صيانة يومية 17:00-18:00 ET
// التداخل الذهبي لندن/نيويورك = أعلى سيولة وحركة اتجاهية
// ============================================================

import type { SessionInfo } from "./types";

// ---- ذاكرة مؤقتة لمنسقات Intl (أداء) ----
const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmtFor(tz: string): Intl.DateTimeFormat {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
      hourCycle: "h23",
    });
    fmtCache.set(tz, f);
  }
  return f;
}

export interface LocalParts {
  h: number; // الساعة المحلية العشرية 0..24
  weekday: string; // Mon/Tue/...
}

/** الساعة المحلية واليوم في منطقة زمنية معينة — حتمية 100% */
export function localParts(d: Date, tz: string): LocalParts {
  const parts = fmtFor(tz).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const hh = parseInt(get("hour"), 10);
  const mm = parseInt(get("minute"), 10);
  return { h: (isNaN(hh) ? 0 : hh) + (isNaN(mm) ? 0 : mm) / 60, weekday: get("weekday") };
}

// تعريف الجلسات بالتوقيت المحلي لكل مدينة (مقاييس الفوركس المعتمدة)
export const SESSION_DEFS = [
  { key: "sydney", nameAr: "سيدني", tz: "Australia/Sydney", open: 8, close: 17 },
  { key: "tokyo", nameAr: "طوكيو", tz: "Asia/Tokyo", open: 9, close: 18 },
  { key: "london", nameAr: "لندن", tz: "Europe/London", open: 8, close: 17 },
  { key: "newyork", nameAr: "نيويورك", tz: "America/New_York", open: 8, close: 17 },
] as const;

/** هل السوق مغلق لعطلة نهاية الأسبوع؟ (بساعة نيويورك — دقيق مع DST) */
export function isMarketWeekend(d: Date): boolean {
  const ny = localParts(d, "America/New_York");
  return (
    ny.weekday === "Sat" ||
    ny.weekday === "Sun" ||
    (ny.weekday === "Fri" && ny.h >= 17) ||
    (ny.weekday === "Sun" && ny.h < 17)
  );
}

/** استراحة الصيانة اليومية 17:00-18:00 ET (الاثنين-الخميس) */
export function isMaintenanceBreak(d: Date): boolean {
  const ny = localParts(d, "America/New_York");
  return (
    ny.h >= 17 &&
    ny.h < 18 &&
    (ny.weekday === "Mon" || ny.weekday === "Tue" || ny.weekday === "Wed" || ny.weekday === "Thu")
  );
}

export function getSessionInfo(now: Date = new Date()): SessionInfo {
  const ny = localParts(now, "America/New_York");

  // نهاية الأسبوع بساعة نيويورك: الجمعة 17:00 → الأحد 17:00
  const weekend = isMarketWeekend(now);
  if (weekend) {
    return {
      active: [],
      quality: 0,
      label: "السوق مغلق (عطلة نهاية الأسبوع) — يفتح الأحد 17:00 بتوقيت نيويورك",
      londonOpen: false,
      nyOpen: false,
      overlap: false,
    };
  }

  const active: string[] = [];
  let londonOpen = false;
  let nyOpen = false;

  for (const s of SESSION_DEFS) {
    const lp = localParts(now, s.tz);
    // تجاهل لحظة الاستراحة اليومية للسوق OTC
    const inBreak = s.key === "newyork" && isMaintenanceBreak(now);
    const open = lp.h >= s.open && lp.h < s.close && !inBreak;
    if (open) {
      active.push(s.nameAr);
      if (s.key === "london") londonOpen = true;
      if (s.key === "newyork") nyOpen = true;
    }
  }

  const overlap = londonOpen && nyOpen;

  let quality = 20;
  let label = "خارج الجلسات الرئيسية — سيولة منخفضة";

  if (overlap) {
    quality = 100;
    label = "تداخل لندن ونيويورك — ذروة السيولة والحركة الاتجاهية (أفضل وقت للتداول)";
  } else if (nyOpen) {
    quality = 75;
    label = "جلسة نيويورك — تأثير الأخبار والبيانات الأمريكية مرتفع";
  } else if (londonOpen) {
    quality = 85;
    label = "جلسة لندن — أعلى حجم تداول أوروبي وحركات كسر النطاق الآسيوي";
  } else if (active.includes("طوكيو")) {
    quality = 40;
    label = "جلسة آسيوية — تراكم وتذبذب ضيق (نطاق بناء السيولة)";
  } else if (active.includes("سيدني")) {
    quality = 25;
    label = "جلسة سيدني — سيولة رقيقة جداً";
  } else if (isMaintenanceBreak(now)) {
    quality = 0;
    label = "استراحة الصيانة اليومية للسوق (17:00-18:00 بتوقيت نيويورك)";
  }

  // تحذير فترة صدور البيانات الأمريكية 13:30 UTC (أخبار عالية التأثير)
  const utcH = now.getUTCHours() + now.getUTCMinutes() / 60;
  if (utcH >= 13.4 && utcH <= 13.6 && !weekend) {
    label += " ⚠ فترة صدور البيانات الأمريكية (13:30 UTC) — تقلب مفاجئ محتمل";
  }

  return { active, quality, label, londonOpen, nyOpen, overlap };
}
