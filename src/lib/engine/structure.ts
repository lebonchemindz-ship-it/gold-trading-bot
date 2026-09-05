// ============================================================
// هيكل السوق: القمم/القيعان، الدعم/المقاومة، البيفوت، فيبوناتشي،
// النطاق الآسيوي، الأرقام المستديرة، كنس السيولة
// ============================================================

import type { AsianRange, Candle, FibLevels, PivotLevels, SRLevel, Swing } from "./types";

// ---------- كشف القمم والقيعان (Fractal k=2) ----------
export function findSwings(candles: Candle[], k = 2): Swing[] {
  const swings: Swing[] = [];
  for (let i = k; i < candles.length - k; i++) {
    let isHigh = true;
    let isLow = true;
    for (let j = i - k; j <= i + k; j++) {
      if (j === i) continue;
      if (candles[j].h >= candles[i].h) isHigh = false;
      if (candles[j].l <= candles[i].l) isLow = false;
    }
    if (isHigh) {
      swings.push({ index: i, price: candles[i].h, type: "high", t: candles[i].t });
    }
    if (isLow) {
      swings.push({ index: i, price: candles[i].l, type: "low", t: candles[i].t });
    }
  }
  return swings;
}

// ---------- تجميع المستويات المتقاربة إلى مناطق دعم/مقاومة ----------
export function computeSRLevels(
  swings: Swing[],
  price: number,
  atrValue: number,
  candles: Candle[]
): { supports: SRLevel[]; resistances: SRLevel[] } {
  const tolerance = Math.max(atrValue * 0.5, price * 0.0004);

  // المستويات المرشحة: القمم/القيعان + إغلاقات اليومين السابقين
  const candidates: { price: number; weight: number; label: string }[] = swings.slice(-60).map((s) => ({
    price: s.price,
    weight: 1,
    label: s.type === "high" ? "قمة سوينغ" : "قاع سوينغ",
  }));

  // إضافة مستويات اليوم السابق
  const daily = aggregateDaily(candles);
  if (daily.length >= 2) {
    const prev = daily[daily.length - 2];
    const prev2 = daily[daily.length >= 3 ? daily.length - 3 : daily.length - 2];
    candidates.push({ price: prev.h, weight: 1.5, label: "قمة أمس" });
    candidates.push({ price: prev.l, weight: 1.5, label: "قاع أمس" });
    candidates.push({ price: prev.c, weight: 1, label: "إغلاق أمس" });
    candidates.push({ price: prev2.h, weight: 1.2, label: "قمة أمس الأول" });
    candidates.push({ price: prev2.l, weight: 1.2, label: "قاع أمس الأول" });
  }

  const sorted = [...candidates].sort((a, b) => a.price - b.price);
  const clusters: { price: number; weight: number; touches: number; label: string }[] = [];

  for (const c of sorted) {
    const last = clusters[clusters.length - 1];
    if (last && Math.abs(c.price - last.price) <= tolerance) {
      // دمج في الكلاستر
      const totalW = last.weight + c.weight;
      last.price = (last.price * last.weight + c.price * c.weight) / totalW;
      last.weight = totalW;
      last.touches += 1;
      if (c.label.includes("أمس")) last.label = c.label;
    } else {
      clusters.push({ price: c.price, weight: c.weight, touches: 1, label: c.label });
    }
  }

  const maxTouch = Math.max(...clusters.map((c) => c.touches), 1);
  const toSR = (c: (typeof clusters)[number], type: "support" | "resistance"): SRLevel => ({
    price: round2(c.price),
    type,
    touches: c.touches,
    strength: Math.min(100, Math.round((c.touches / maxTouch) * 60 + c.weight * 15)),
    label: c.label,
  });

  const supports = clusters
    .filter((c) => c.price < price)
    .slice(-4)
    .reverse()
    .map((c) => toSR(c, "support"));

  const resistances = clusters
    .filter((c) => c.price > price)
    .slice(0, 4)
    .map((c) => toSR(c, "resistance"));

  return { supports, resistances };
}

// ---------- مستويات البيفوت الكلاسيكية من اليوم السابق ----------
export function pivotPoints(candles: Candle[]): PivotLevels | null {
  const daily = aggregateDaily(candles);
  if (daily.length < 2) return null;
  const prev = daily[daily.length - 2];
  const h = prev.h;
  const l = prev.l;
  const c = prev.c;
  const pp = (h + l + c) / 3;
  return {
    pp: round2(pp),
    r1: round2(2 * pp - l),
    s1: round2(2 * pp - h),
    r2: round2(pp + (h - l)),
    s2: round2(pp - (h - l)),
    r3: round2(h + 2 * (pp - l)),
    s3: round2(l - 2 * (h - pp)),
  };
}

// ---------- مستويات فيبوناتشي لآخر موجة كبيرة ----------
export function fibonacciLevels(candles: Candle[], atrValue: number): FibLevels | null {
  if (candles.length < 30) return null;
  const window = candles.slice(-120);
  let hi = -Infinity;
  let lo = Infinity;
  let hiIdx = 0;
  let loIdx = 0;
  window.forEach((c, i) => {
    if (c.h > hi) {
      hi = c.h;
      hiIdx = i;
    }
    if (c.l < lo) {
      lo = c.l;
      loIdx = i;
    }
  });

  // الموجة يجب أن تكون ذات حجم معتبر (3× ATR على الأقل)
  if (hi - lo < atrValue * 3) return null;

  const direction: "up" | "down" = hiIdx > loIdx ? "up" : "down";
  const ratios = [0.236, 0.382, 0.5, 0.618, 0.786];
  const levels = ratios.map((r) => ({
    ratio: r,
    price: round2(direction === "up" ? hi - (hi - lo) * r : lo + (hi - lo) * r),
  }));

  const goldenLevel = levels.find((l) => l.ratio === 0.618) ?? null;
  return { from: round2(lo), to: round2(hi), direction, levels, golden: goldenLevel };
}

// ---------- تجميع الشموع إلى أيام UTC ----------
export function aggregateDaily(candles: Candle[]): Candle[] {
  const map = new Map<number, Candle>();
  for (const c of candles) {
    const day = Math.floor(c.t / 86400000) * 86400000;
    const existing = map.get(day);
    if (!existing) {
      map.set(day, { ...c, t: day });
    } else {
      existing.h = Math.max(existing.h, c.h);
      existing.l = Math.min(existing.l, c.l);
      existing.c = c.c;
      existing.v += c.v;
    }
  }
  return [...map.values()].sort((a, b) => a.t - b.t);
}

// ---------- النطاق الآسيوي (00:00 - 07:00 UTC) + كنس السيولة ----------
export function computeAsianRange(candles15m: Candle[]): AsianRange | null {
  if (!candles15m.length) return null;
  const now = new Date(candles15m[candles15m.length - 1].t);
  const todayKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`;
  const dayStart = Math.floor(candles15m[candles15m.length - 1].t / 86400000) * 86400000;
  const asianEnd = dayStart + 7 * 3600000;

  const todayAsian = candles15m.filter((c) => c.t >= dayStart && c.t < asianEnd);
  const complete = todayAsian.length > 0 && candles15m[candles15m.length - 1].t >= asianEnd;

  let session = todayAsian;
  if (todayAsian.length < 4) {
    // النطاق الآسيوي لم يتشكل بعد — استخدم نطاق أمس
    const yStart = dayStart - 86400000;
    session = candles15m.filter((c) => c.t >= yStart && c.t < yStart + 7 * 3600000);
    if (session.length < 4) return null;
  }

  let high = -Infinity;
  let low = Infinity;
  for (const c of session) {
    high = Math.max(high, c.h);
    low = Math.min(low, c.l);
  }

  // كشف كنس السيولة في آخر 12 شمعة (3 ساعات)
  const last12 = candles15m.slice(-12);
  let swept: AsianRange["swept"] = "none";
  for (const c of last12) {
    if (c.h > high && c.c < high) swept = "high";
    if (c.l < low && c.c > low) swept = "low";
  }

  return {
    date: todayKey,
    high: round2(high),
    low: round2(low),
    width: round2(high - low),
    complete,
    swept,
  };
}

// ---------- الأرقام المستديرة المهمة للذهب (مجمعات سيولة) ----------
export function roundLevels(price: number): { level: number; distance: number; tier: string }[] {
  const tiers: { step: number; tier: string }[] = [
    { step: 100, tier: "مستوى رئيسي (100$)" },
    { step: 50, tier: "مستوى متوسط (50$)" },
    { step: 25, tier: "مستوى فرعي (25$)" },
  ];
  const result: { level: number; distance: number; tier: string }[] = [];
  for (const { step, tier } of tiers) {
    const below = Math.floor(price / step) * step;
    const above = below + step;
    for (const lvl of [below, above]) {
      const distance = round2(Math.abs(price - lvl));
      result.push({ level: lvl, distance, tier });
    }
  }
  // أقرب 3 مستويات
  return result.sort((a, b) => a.distance - b.distance).slice(0, 3);
}

// ---------- أقرب مستوى دعم/مقاومة بمقياس ATR ----------
export function nearestLevels(
  price: number,
  supports: SRLevel[],
  resistances: SRLevel[],
  atrValue: number
): { nearestSupport: SRLevel | null; nearestResistance: SRLevel | null; distS: number; distR: number } {
  const nearestSupport = supports.length ? supports[0] : null;
  const nearestResistance = resistances.length ? resistances[0] : null;
  const distS = nearestSupport ? (price - nearestSupport.price) / Math.max(atrValue, 0.01) : 99;
  const distR = nearestResistance ? (nearestResistance.price - price) / Math.max(atrValue, 0.01) : 99;
  return { nearestSupport, nearestResistance, distS, distR };
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
