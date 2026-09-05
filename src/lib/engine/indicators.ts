// ============================================================
// المؤشرات الفنية — حسابات قياسية دقيقة (Wilder / قياسي)
// كل الدوال نقية (Pure): نفس المدخلات = نفس المخرجات
// ============================================================

import type { ADXData, ATRData, BollingerData, Candle, EMASet, MACDData, RSIData, StochData } from "./types";

// ---------- المتوسط المتحرك البسيط ----------
export function sma(values: number[], period: number): number[] {
  const out: number[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    out.push(i >= period - 1 ? sum / period : NaN);
  }
  return out;
}

// ---------- المتوسط الأسّي (EMA) — بذرة SMA ----------
export function ema(values: number[], period: number): number[] {
  const out: number[] = new Array(values.length).fill(NaN);
  if (values.length < period) return out;
  const alpha = 2 / (period + 1);
  let seed = 0;
  for (let i = 0; i < period; i++) seed += values[i];
  out[period - 1] = seed / period;
  for (let i = period; i < values.length; i++) {
    out[i] = alpha * values[i] + (1 - alpha) * out[i - 1];
  }
  return out;
}

// ---------- مجموع EMA المستخدمة في المحرك ----------
export function computeEMASet(closes: number[]): EMASet {
  return {
    ema9: ema(closes, 9),
    ema21: ema(closes, 21),
    ema50: ema(closes, 50),
    ema200: ema(closes, 200),
  };
}

// ---------- RSI بمعدل Wilder ----------
export function rsi(closes: number[], period = 14): number[] {
  const out: number[] = new Array(closes.length).fill(NaN);
  if (closes.length <= period) return out;

  let gainSum = 0;
  let lossSum = 0;
  for (let i = 1; i <= period; i++) {
    const ch = closes[i] - closes[i - 1];
    if (ch > 0) gainSum += ch;
    else lossSum -= ch;
  }
  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  for (let i = period + 1; i < closes.length; i++) {
    const ch = closes[i] - closes[i - 1];
    const g = ch > 0 ? ch : 0;
    const l = ch < 0 ? -ch : 0;
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

export function analyzeRSI(closes: number[]): RSIData {
  const values = rsi(closes, 14);
  const last = [...values].reverse().find((v) => !isNaN(v)) ?? 50;
  const valid = values.filter((v) => !isNaN(v));
  const n = Math.min(5, valid.length);
  const lastN = valid.slice(-n);
  const slope = n >= 2 ? (lastN[n - 1] - lastN[0]) / n : 0;

  let zone: RSIData["zone"] = "neutral";
  if (last < 30) zone = "oversold";
  else if (last < 40) zone = "oversold_mid";
  else if (last <= 60) zone = "neutral";
  else if (last <= 70) zone = "overbought_mid";
  else zone = "overbought";

  return { values, rsi: last, slope, zone };
}

// ---------- MACD (12, 26, 9) ----------
export function macd(closes: number[]): MACDData {
  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  const line: number[] = closes.map((_, i) =>
    !isNaN(ema12[i]) && !isNaN(ema26[i]) ? ema12[i] - ema26[i] : NaN
  );
  const validStart = line.findIndex((v) => !isNaN(v));
  const signal: number[] = new Array(closes.length).fill(NaN);
  if (validStart >= 0) {
    const compact = line.slice(validStart);
    const sig = ema(compact, 9);
    for (let i = 0; i < sig.length; i++) signal[validStart + i] = sig[i];
  }
  const histogram = line.map((v, i) =>
    !isNaN(v) && !isNaN(signal[i]) ? v - signal[i] : NaN
  );
  const hist = [...histogram].reverse().find((v) => !isNaN(v)) ?? 0;
  const validHist = histogram.filter((v) => !isNaN(v));
  const prev = validHist.length >= 2 ? validHist[validHist.length - 2] : 0;
  return {
    line,
    signal,
    histogram,
    hist,
    histRising: hist > prev,
  };
}

// ---------- بولينجر باندز (20, 2) ----------
export function bollinger(closes: number[]): BollingerData {
  const period = 20;
  const mult = 2;
  const midArr = sma(closes, period);
  const upper: number[] = new Array(closes.length).fill(NaN);
  const lower: number[] = new Array(closes.length).fill(NaN);
  const bandwidths: number[] = new Array(closes.length).fill(NaN);

  for (let i = period - 1; i < closes.length; i++) {
    const slice = closes.slice(i - period + 1, i + 1);
    const mean = midArr[i];
    let variance = 0;
    for (const v of slice) variance += (v - mean) ** 2;
    const sd = Math.sqrt(variance / period);
    upper[i] = mean + mult * sd;
    lower[i] = mean - mult * sd;
    bandwidths[i] = mean > 0 ? ((upper[i] - lower[i]) / mean) * 100 : NaN;
  }

  const lastIdx = closes.length - 1;
  const upperNow = upper[lastIdx];
  const midNow = midArr[lastIdx];
  const lowerNow = lower[lastIdx];
  const price = closes[lastIdx];
  const percentB =
    upperNow !== lowerNow ? (price - lowerNow) / (upperNow - lowerNow) : 0.5;

  const validBw = bandwidths.filter((v) => !isNaN(v));
  const lastBw = validBw[validBw.length - 1] ?? 0;
  const bwAvg =
    validBw.length > 50
      ? validBw.slice(-50).reduce((a, b) => a + b, 0) / 50
      : validBw.reduce((a, b) => a + b, 0) / Math.max(validBw.length, 1);

  return {
    upper,
    mid: midArr,
    lower,
    upperNow,
    midNow,
    lowerNow,
    percentB,
    bandwidth: lastBw,
    bandwidthAvg: bwAvg,
    squeeze: lastBw < bwAvg * 0.75,
  };
}

// ---------- ATR بمعدل Wilder ----------
export function atr(candles: Candle[], period = 14): ATRData {
  const trs: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    if (i === 0) {
      trs.push(candles[i].h - candles[i].l);
    } else {
      const prevClose = candles[i - 1].c;
      trs.push(
        Math.max(
          candles[i].h - candles[i].l,
          Math.abs(candles[i].h - prevClose),
          Math.abs(candles[i].l - prevClose)
        )
      );
    }
  }

  const values: number[] = new Array(candles.length).fill(NaN);
  if (candles.length <= period) {
    return {
      values,
      atr: trs.length ? trs[trs.length - 1] : 0,
      atrAvg: 0,
      expansionRatio: 1,
    };
  }
  let sum = 0;
  for (let i = 0; i < period; i++) sum += trs[i];
  values[period - 1] = sum / period;
  for (let i = period; i < candles.length; i++) {
    values[i] = (values[i - 1] * (period - 1) + trs[i]) / period;
  }
  const valid = values.filter((v) => !isNaN(v));
  const lastAtr = valid[valid.length - 1];
  const atrAvg =
    valid.length > 50
      ? valid.slice(-50).reduce((a, b) => a + b, 0) / 50
      : valid.reduce((a, b) => a + b, 0) / Math.max(valid.length, 1);

  return {
    values,
    atr: lastAtr,
    atrAvg,
    expansionRatio: atrAvg > 0 ? lastAtr / atrAvg : 1,
  };
}

// ---------- Stochastic (14, 3, 3) ----------
export function stochastic(candles: Candle[]): StochData {
  const kPeriod = 14;
  const slowing = 3;
  const closes = candles.map((c) => c.c);

  const rawK: number[] = new Array(candles.length).fill(NaN);
  for (let i = kPeriod - 1; i < candles.length; i++) {
    let hh = -Infinity;
    let ll = Infinity;
    for (let j = i - kPeriod + 1; j <= i; j++) {
      hh = Math.max(hh, candles[j].h);
      ll = Math.min(ll, candles[j].l);
    }
    rawK[i] = hh > ll ? ((closes[i] - ll) / (hh - ll)) * 100 : 50;
  }

  const validRaw = rawK.filter((v) => !isNaN(v));
  const kSlow = sma(validRaw, slowing).filter((v) => !isNaN(v));
  const dLine = sma(kSlow, 3).filter((v) => !isNaN(v));

  const k = kSlow.length ? kSlow[kSlow.length - 1] : 50;
  const d = dLine.length ? dLine[dLine.length - 1] : 50;
  const kPrev = kSlow.length >= 2 ? kSlow[kSlow.length - 2] : k;
  const dPrev = dLine.length >= 2 ? dLine[dLine.length - 2] : d;

  const zone: StochData["zone"] = k > 80 ? "overbought" : k < 20 ? "oversold" : "neutral";

  return {
    k,
    d,
    crossUp: kPrev <= dPrev && k > d,
    crossDown: kPrev >= dPrev && k < d,
    zone,
  };
}

// ---------- ADX (14) بمعدل Wilder ----------
export function adx(candles: Candle[], period = 14): ADXData {
  if (candles.length < period * 2 + 1) {
    return { adx: 0, plusDI: 0, minusDI: 0, trending: false };
  }

  const plusDM: number[] = [0];
  const minusDM: number[] = [0];
  const trs: number[] = [candles[0].h - candles[0].l];

  for (let i = 1; i < candles.length; i++) {
    const upMove = candles[i].h - candles[i - 1].h;
    const downMove = candles[i - 1].l - candles[i].l;
    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
    const prevClose = candles[i - 1].c;
    trs.push(
      Math.max(
        candles[i].h - candles[i].l,
        Math.abs(candles[i].h - prevClose),
        Math.abs(candles[i].l - prevClose)
      )
    );
  }

  // تمهيد Wilder
  const smooth = (arr: number[]): number[] => {
    const out: number[] = new Array(arr.length).fill(NaN);
    let sum = 0;
    for (let i = 0; i < period; i++) sum += arr[i];
    out[period - 1] = sum;
    for (let i = period; i < arr.length; i++) {
      out[i] = out[i - 1] - out[i - 1] / period + arr[i];
    }
    return out;
  };

  const smTR = smooth(trs);
  const smPDM = smooth(plusDM);
  const smMDM = smooth(minusDM);

  const dxs: number[] = [];
  let plusDI = 0;
  let minusDI = 0;
  for (let i = period - 1; i < candles.length; i++) {
    const tr = smTR[i];
    if (tr > 0 && !isNaN(tr)) {
      const pdi = (smPDM[i] / tr) * 100;
      const mdi = (smMDM[i] / tr) * 100;
      plusDI = pdi;
      minusDI = mdi;
      const sum = pdi + mdi;
      dxs.push(sum > 0 ? (Math.abs(pdi - mdi) / sum) * 100 : 0);
    }
  }

  let adxVal = 0;
  if (dxs.length >= period) {
    let sum = 0;
    for (let i = 0; i < period; i++) sum += dxs[i];
    adxVal = sum / period;
    for (let i = period; i < dxs.length; i++) {
      adxVal = (adxVal * (period - 1) + dxs[i]) / period;
    }
  }

  return { adx: adxVal, plusDI, minusDI, trending: adxVal >= 20 };
}

// ---------- VWAP مرتكز على بداية اليوم UTC ----------
export function vwapDaily(candles: Candle[]): number | null {
  if (!candles.length) return null;
  const last = candles[candles.length - 1];
  const day = Math.floor(last.t / 86400000) * 86400000;
  const todays = candles.filter((c) => c.t >= day);
  const window = todays.length >= 3 ? todays : candles.slice(-48);
  if (!window.length) return null;

  let cumPV = 0;
  let cumV = 0;
  for (const c of window) {
    const typical = (c.h + c.l + c.c) / 3;
    const vol = c.v > 0 ? c.v : 1;
    cumPV += typical * vol;
    cumV += vol;
  }
  return cumV > 0 ? cumPV / cumV : null;
}

// ---------- ميل الانحدار الخطي (اتجاه آخر n قيمة) ----------
export function linregSlope(values: number[], n: number): number {
  const vals = values.filter((v) => !isNaN(v)).slice(-n);
  const len = vals.length;
  if (len < 2) return 0;
  const meanX = (len - 1) / 2;
  const meanY = vals.reduce((a, b) => a + b, 0) / len;
  let num = 0;
  let den = 0;
  for (let i = 0; i < len; i++) {
    num += (i - meanX) * (vals[i] - meanY);
    den += (i - meanX) ** 2;
  }
  return den > 0 ? num / den : 0;
}

// ---------- تقاطع EMA ----------
export function emaCrossed(a: number[], b: number[]): "up" | "down" | "none" {
  const validA = a.filter((v) => !isNaN(v));
  const validB = b.filter((v) => !isNaN(v));
  if (validA.length < 2 || validB.length < 2) return "none";
  const aNow = validA[validA.length - 1];
  const aPrev = validA[validA.length - 2];
  const bNow = validB[validB.length - 1];
  const bPrev = validB[validB.length - 2];
  if (aPrev <= bPrev && aNow > bNow) return "up";
  if (aPrev >= bPrev && aNow < bNow) return "down";
  return "none";
}
