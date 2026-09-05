// ============================================================
// أنماط الشموع اليابانية — كشف حتمي للأنماط في آخر الشموع
// ============================================================

import type { Candle } from "./types";

export interface CandlePattern {
  name: string;
  direction: "bull" | "bear";
  strength: number; // 0..100
  barIndex: number; // فهرس الشمعة
}

export function detectPatterns(candles: Candle[], atrValue: number): CandlePattern[] {
  const patterns: CandlePattern[] = [];
  const n = candles.length;
  if (n < 3) return patterns;
  const atrVal = atrValue > 0 ? atrValue : 1;

  // فحص آخر 3 شموع
  for (let i = n - 3; i < n; i++) {
    if (i < 1) continue;
    const c = candles[i];
    const p = candles[i - 1];
    const body = Math.abs(c.c - c.o);
    const range = c.h - c.l;
    const upperWick = c.h - Math.max(c.c, c.o);
    const lowerWick = Math.min(c.c, c.o) - c.l;
    const bodyPct = range > 0 ? body / range : 0;

    // ===== الابتلاع الصاعد Bullish Engulfing =====
    if (
      p.c < p.o && // سابقة هابطة
      c.c > c.o && // الحالية صاعدة
      c.c >= p.o &&
      c.o <= p.c &&
      body > Math.abs(p.c - p.o)
    ) {
      patterns.push({
        name: "ابتلاع صاعد (Bullish Engulfing)",
        direction: "bull",
        strength: 70,
        barIndex: i,
      });
    }

    // ===== الابتلاع الهابط Bearish Engulfing =====
    if (
      p.c > p.o &&
      c.c < c.o &&
      c.o >= p.c &&
      c.c <= p.o &&
      body > Math.abs(p.c - p.o)
    ) {
      patterns.push({
        name: "ابتلاع هابط (Bearish Engulfing)",
        direction: "bear",
        strength: 70,
        barIndex: i,
      });
    }

    // ===== المطرقة Hammer =====
    if (
      lowerWick > body * 2 &&
      upperWick < body * 0.8 &&
      bodyPct < 0.4 &&
      c.c > c.o
    ) {
      patterns.push({
        name: "شمعة مطرقة (Hammer)",
        direction: "bull",
        strength: 60,
        barIndex: i,
      });
    }

    // ===== الشهاب/النجم الهابط Shooting Star =====
    if (
      upperWick > body * 2 &&
      lowerWick < body * 0.8 &&
      bodyPct < 0.4 &&
      c.c < c.o
    ) {
      patterns.push({
        name: "شمعة شهاب (Shooting Star)",
        direction: "bear",
        strength: 60,
        barIndex: i,
      });
    }

    // ===== الدوجي Doji =====
    if (range > atrVal * 0.3 && bodyPct < 0.1) {
      patterns.push({
        name: "دوجي محايد (تردد)",
        direction: c.c >= candles[i - 1].c ? "bull" : "bear",
        strength: 15,
        barIndex: i,
      });
    }

    // ===== شمعة زخم قوية Strong Momentum Candle =====
    if (body > atrVal * 1.2 && c.c > c.o) {
      patterns.push({
        name: "شمعة زخم صاعدة قوية",
        direction: "bull",
        strength: 55,
        barIndex: i,
      });
    }
    if (body > atrVal * 1.2 && c.c < c.o) {
      patterns.push({
        name: "شمعة زخم هابطة قوية",
        direction: "bear",
        strength: 55,
        barIndex: i,
      });
    }
  }

  return patterns;
}
