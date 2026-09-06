// ============================================================
// وحدة التعلّم الذاتي — تخزين أوزان الأعمدة المشتقة من الباك-تيست
// البوت يجرب استراتيجياته على شموع تاريخية (بدون نظرة مستقبلية)
// ثم يعدّل أوزان الأعمدة وفق الأداء الفعلي المحقق (Wilson bound)
// طبقتان للتخزين:
//   1) ذاكرة الخادم (سريعة — عمرها عمر العملية)
//   2) نموذج مدرب مُدمج في المستودع (trained-model.json) — يُحمّل
//      عند الإقلاع ويصمد عبر إعادة التشغيل والنشر على Vercel
// ============================================================

import { promises as fsp } from "fs";
import path from "path";
import persistedModel from "./trained-model.json";
import type { TrainingStats, TrainTimelineEntryLike } from "./types";

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

// الشكل المُدمج للنموذج المدرب (نتيجة تدريب كاملة + وصفات وصفية)
interface PersistedModel {
  version: number;
  persistedAt: string;
  note?: string;
  result: {
    tf: string;
    epochsRun: number;
    requestedEpochs: number;
    converged: boolean;
    generatedAt: string;
    dataSource: string;
    window: { from: string; to: string; candles: number; months: number };
    blindStats: Record<string, number>;
    holdout: Record<string, unknown>;
    epochLog: unknown[];
    equity: number[];
    timeline: TrainTimelineEntryLike[];
    strategies: unknown[];
    lessons: unknown[];
    months: unknown[];
    selfKnowledge: Record<string, unknown>;
    trainingLevel: { score: number; label: string; epochsDone: number };
    weights: Record<string, number>;
    weightsParam: string;
  };
}

// ---------- تحويل النموذج المُدمج إلى حالة تعلم ----------
function modelToState(m: PersistedModel): LearnedState {
  const r = m.result;
  const b = r.blindStats;
  return {
    weights: r.weights,
    stats: {
      winRate: typeof b.winRate === "number" && b.winRate <= 1 ? b.winRate : (b.winRate ?? 0) / 100,
      trades: b.trades ?? 0,
      profitFactor: b.profitFactor ?? 0,
      expectancyR: b.expectancyR ?? 0,
      maxDrawdownR: b.maxDrawdownR ?? 0,
      tf: r.tf,
      from: r.window?.from ?? "",
      to: r.window?.to ?? "",
      updatedAt: m.persistedAt,
    },
    tf: r.tf,
    ts: new Date(m.persistedAt).getTime() || 0,
  };
}

// ذاكرة الخادم — تعيش طوال عمر العملية
let state: LearnedState | null = null;

// النموذج المُدمج (يُدمج وقت البناء — يعمل على Vercel أيضاً)
const persisted = persistedModel as unknown as PersistedModel;

export function setLearnedState(next: LearnedState) {
  state = next;
}

/** حالة التعلم الفعالة: الذاكرة أولاً ثم النموذج المدرب المُدمج */
export function getLearnedState(): LearnedState | null {
  if (state) return state;
  if (persisted?.result?.weights && persisted.result.tf) {
    return modelToState(persisted);
  }
  return null;
}

/** النتيجة الكاملة للتدريب المحفوظ (لعرضها في الواجهة دون إعادة تدريب) */
export function getPersistedTraining(): PersistedModel | null {
  if (!persisted?.result?.weights) return null;
  return persisted;
}

/** هل البوت مدرب حالياً (ذاكرة أو نموذج مُدمج)؟ */
export function isTrained(): boolean {
  return getLearnedState() != null;
}

// ---------- حفظ النتيجة الكاملة على القرص (أفضل جهد) ----------
// يعمل محلياً فقط — على Vercel نظام الملفات للقراءة فقط فيُتجاهل بصمت،
// ويبقى النموذج المُدمج (trained-model.json) هو مصدر الحقيقة في الإنتاج.
const MODEL_PATH = path.join(process.cwd(), "src/lib/engine/trained-model.json");

export async function persistTrainingResult(result: unknown): Promise<boolean> {
  try {
    const model = {
      version: 1,
      persistedAt: new Date().toISOString(),
      note: "نموذج مدرب مسبقاً — تنبؤ أعمى ← تحقق ← تفسير ذاتي على 6 أشهر (Walk-Forward). يُحمّل تلقائياً عند إقلاع الخادم.",
      result,
    };
    await fsp.writeFile(MODEL_PATH, JSON.stringify(model), "utf-8");
    return true;
  } catch {
    return false; // للقراءة فقط (مثل Vercel) — لا مشكلة
  }
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
