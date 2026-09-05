// ============================================================
// الجلسات — التوقيت العالمي UTC
// السيولة والأداء الأفضل في تداخل لندن/نيويورك 13:00-17:00 GMT
// (نتائج البحث المعمق: أقوى الحركات الاتجاهية تحدث في التداخل)
// ============================================================

import type { SessionInfo } from "./types";

export function getSessionInfo(now: Date = new Date()): SessionInfo {
  const h = now.getUTCHours() + now.getUTCMinutes() / 60; // ساعة UTC عشرية
  const day = now.getUTCDay(); // 0=الأحد

  const isWeekend = day === 6 || (day === 0 && h < 21) || (day === 5 && h >= 21);
  if (isWeekend) {
    return {
      active: [],
      quality: 0,
      label: "السوق مغلق (عطلة نهاية الأسبوع)",
      londonOpen: false,
      nyOpen: false,
      overlap: false,
    };
  }

  const active: string[] = [];
  // سيدني: 21:00 - 06:00 UTC
  if (h >= 21 || h < 6) active.push("سيدني");
  // طوكيو: 00:00 - 09:00 UTC
  if (h >= 0 && h < 9) active.push("طوكيو");
  // لندن: 07:00 - 16:30 UTC
  const londonOpen = h >= 7 && h < 16.5;
  if (londonOpen) active.push("لندن");
  // نيويورك: 12:30 - 21:00 UTC
  const nyOpen = h >= 12.5 && h < 21;
  if (nyOpen) active.push("نيويورك");

  // التداخل الذهبي: 13:00 - 16:30 UTC
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
  }

  // تحذير فترة الأخبار الأمريكية 13:30 UTC (البيانات الاقتصادية الرئيسية)
  if (h >= 13.4 && h <= 13.6) {
    label += " ⚠ فترة صدور البيانات الأمريكية (13:30 UTC) — تقلب مفاجئ محتمل";
  }

  return { active, quality, label, londonOpen, nyOpen, overlap };
}
