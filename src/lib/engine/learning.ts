// ============================================================
// وحدة التعلّم الذاتي — تخزين أوزان الأعمدة المشتقة من الباك-تيست
// البوت يجرب استراتيجياته على شموع تاريخية (بدون نظرة مستقبلية)
// ثم يعدّل أوزان الأعمدة وفق الأداء الفعلي المحقق (Wilson bound)
// التخزين في ذاكرة الخادم (وحدة واحدة) + يمكن تمرير الأوزان من العميل
// ============================================================

import type { TrainingStats } from "./types";

// المفاتيح السبعة للأعمدة — مطابقة تماماً لـ scoring.ts
export const PILLAR_KEYS = [
  "trend",
  "momentum",
  "location",
  "priceAction",
  "macro",
  "session",
  "volatility",
] as const;

export type PillarKey = (typeof PILLAR_KEYS)[number];

// الأوزان الأساسية (من البحث المعمق + الكورس) — مطابقة لـ scoring.ts
export const BASE_PILLAR_WEIGHTS: Record<PillarKey, number> = {
  trend: 24,
  momentum: 20,
  location: 14,
  priceAction: 10,
  macro: 10,
  session: 12,
  volatility: 10,
};

export interface LearnedState {
  weights: Record<string, number>; // مجموع 100
  stats: TrainingStats;
  tf: string;
  ts: number;
}

// ذاكرة الخادم — تعيش طوال عمر العملية (على Vercel: حتى إعادة التدوير)
let state: LearnedState | null = null;

export function setLearnedState(next: LearnedState) {
  state = next;
}

export function getLearnedState(): LearnedState | null {
  return state;
}

// ---------- التحقق من صحة أوزان قادمة من العميل ----------
export function parseWeightsParam(raw: string | null): Record<string, number> | null {
  if (!raw) return null;
  try {
    const out: Record<string, number> = {};
    for (const pair of raw.split(",")) {
      const [k, v] = pair.split(":");
      if (!k || v == null) continue;
      const key = k.trim();
      if (!(PILLAR_KEYS as readonly string[]).includes(key)) continue;
      const num = Number(v);
      if (isNaN(num) || num < 3 || num > 45) continue; // حراسة ضد القيم الشاذة
      out[key] = num;
    }
    // نحتاج الأعمدة السبعة جميعها (نكمل الناقص بالأساسي)
    for (const k of PILLAR_KEYS) {
      if (out[k] == null) out[k] = BASE_PILLAR_WEIGHTS[k];
    }
    // إعادة التطبيع إلى مجموع 100
    const sum = PILLAR_KEYS.reduce((a, k) => a + out[k], 0);
    if (sum <= 0) return null;
    for (const k of PILLAR_KEYS) out[k] = Math.round((out[k] / sum) * 1000) / 10;
    // تصحيح فرق التقريب على أكبر عمود
    const sum2 = PILLAR_KEYS.reduce((a, k) => a + out[k], 0);
    out.trend = Math.round((out.trend + (100 - sum2)) * 10) / 10;
    return out;
  } catch {
    return null;
  }
}

// ---------- توليد سلسلة استعلام من الأوزان ----------
export function weightsToParam(weights: Record<string, number>): string {
  return PILLAR_KEYS.map((k) => `${k}:${Math.round(weights[k] * 10) / 10}`).join(",");
}
