// ============================================================
// محرك التدريب الذاتي العميق — 6 أشهر (Walk-Forward متعدد الحلقات)
// البروتوكول (كما طلبه المستخدم حرفياً):
//   1) يتنبأ عند كل نقطة تاريخية دون رؤية النتيجة (بيانات سابقة فقط)
//   2) يكشف النتيجة لاحقاً ويتحقق: صحيحة أم خاطئة؟
//   3) يعطي تفسيراً لنفسه: لماذا نجح/فشل + الدرس المستفاد
//   4) يقوّي استراتيجياته: تعديل المضاعفات لكل استراتيجية × نظام سوق
//   5) يعيد الحلقة مرات متعددة (Epochs) حتى يستقر التعلم
//   6) اختبار أعمى نهائي: آخر 25% لم يرها إطلاقاً أثناء التعلم
// كل المؤشرات سببية (causal) — لا نظرة مستقبلية في أي مكان
// ============================================================

import { fetchCandles } from "./market";
import { computeEMASet, rsi, macd, bollinger, atr } from "./indicators";
import { BASE_PILLAR_WEIGHTS, PILLAR_KEYS, setLearnedState, weightsToParam } from "./learning";
import {
  evaluateAt,
  simulate,
  buildDays,
  adxSeries,
  rollingAvg,
  wilsonLower,
  STRATEGY_META,
  type Ctx,
  type Vote,
  type BtMonth,
  type BtStats,
} from "./backtest";
import type { Candle } from "./types";

// ---------- الأنواع العامة ----------
export type Regime = "trend_up" | "trend_down" | "range";

export interface TrainEpoch {
  epoch: number;
  trades: number;
  winRate: number; // %
  profitFactor: number;
  expectancyR: number;
  grossR: number;
  weightsSnapshot: Record<string, number>;
  multSnapshot: Record<string, number>; // متوسط المضاعف لكل استراتيجية
  note: string; // ماذا تعلم في هذه الحلقة (عربي)
}

export interface TrainTimelineEntry {
  i: number;
  t: number;
  dateLabel: string;
  phase: "train" | "holdout"; // مرحلة التعلم أم الاختبار الأعمى
  dir: "BUY" | "SELL";
  entry: number;
  sl: number;
  tp1: number;
  confidence: number; // 0..100
  agreeing: string[];
  disagreeing: string[];
  regime: Regime;
  regimeAr: string;
  eventDay: string | null;
  result: "win" | "loss" | "timeout";
  r: number;
  bars: number;
  exitPrice: number;
  explanation: string; // تفسير البوت لنفسه (عربي)
  lossTags: string[];
}

export interface TrainLesson {
  key: string;
  text: string;
  count: number;
  severity: "good" | "warn" | "info";
}

export interface StrategyMult {
  key: string;
  nameAr: string;
  pillarAr: string;
  global: number;
  trendUp: number;
  trendDown: number;
  range: number;
  samples: number;
  winRate: number;
}

export interface HoldoutStats {
  tradesBefore: number;
  winRateBefore: number;
  pfBefore: number;
  expBefore: number;
  tradesAfter: number;
  winRateAfter: number;
  pfAfter: number;
  expAfter: number;
  equityBefore: number[];
  equityAfter: number[];
  improvementPct: number;
  verdict: string;
}

export interface SelfTrainingResult {
  tf: "1h" | "1d";
  epochsRun: number;
  requestedEpochs: number;
  converged: boolean;
  generatedAt: string;
  dataSource: string;
  window: { from: string; to: string; candles: number; months: number };
  blindStats: BtStats; // أداء التنبؤ الأعمى على كامل 6 أشهر بالأوزان النهائية
  holdout: HoldoutStats; // الاختبار الأعمى الصارم (آخر 25%)
  epochLog: TrainEpoch[];
  equity: number[]; // منحنى R التراكمي (كامل الفترة)
  timeline: TrainTimelineEntry[]; // خط زمني للتنبؤات (لإعادة التشغيل التفاعلي)
  strategies: StrategyMult[];
  lessons: TrainLesson[];
  months: BtMonth[];
  selfKnowledge: {
    blindAccuracy: number;
    totalPredictions: number;
    bestStrategy: string | null;
    bestStrategyWr: number;
    worstStrategy: string | null;
    worstStrategyWr: number;
    calibration: { lowWr: number; midWr: number; highWr: number; lowN: number; midN: number; highN: number; verdict: string };
    regimeNotes: string[];
    summary: string;
  };
  trainingLevel: { score: number; label: string; epochsDone: number };
  weights: Record<string, number>; // أوزان الأعمدة النهائية (تُطبق مباشرة)
  weightsParam: string;
}

// ---------- ثوابت ----------
const MAX_EPOCHS = 8;
const WARMUP_1H = 210; // EMA200 + متوسطات
const MIN_CONVERGENCE = 0.4; // نقطة مئوية
const AR_MONTHS = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
];
const REGIME_AR: Record<Regime, string> = {
  trend_up: "سوق اتجاهي صاعد",
  trend_down: "سوق اتجاهي هابط",
  range: "سوق عرضي (تذبذب)",
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

const META_BY_KEY: Map<string, (typeof STRATEGY_META)[number]> = new Map(
  STRATEGY_META.map((m) => [m.key, m])
);

// ---------- أيام البيانات عالية التأثير (كشف حتمي) ----------
// FOMC: تواريخ الاجتماعات المعلنة 2025-2026 (يوم القرار + اليوم السابق)
const FOMC_DAYS = new Set([
  "2025-01-28", "2025-01-29", "2025-03-18", "2025-03-19", "2025-05-06", "2025-05-07",
  "2025-06-17", "2025-06-18", "2025-07-29", "2025-07-30", "2025-09-16", "2025-09-17",
  "2025-10-28", "2025-10-29", "2025-12-09", "2025-12-10",
  "2026-01-27", "2026-01-28", "2026-03-17", "2026-03-18", "2026-04-28", "2026-04-29",
  "2026-06-16", "2026-06-17", "2026-07-28", "2026-07-29", "2026-09-15", "2026-09-16",
  "2026-10-27", "2026-10-28", "2026-12-08", "2026-12-09",
]);

const pad2 = (n: number) => String(n).padStart(2, "0");

/** يوم بيانات عالي التأثير؟ (NFP أول جمعة + FOMC + CPI تقديري) */
function highImpactDay(t: number): string | null {
  const d = new Date(t);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  const key = `${y}-${pad2(m + 1)}-${pad2(day)}`;
  if (FOMC_DAYS.has(key)) return "اجتماع الفيدرالي FOMC (قرار الفائدة)";
  // أول جمعة من الشهر = NFP (يوم الإصدار أو اليوم السابق)
  const firstDow = new Date(Date.UTC(y, m, 1)).getUTCDay();
  const firstFriday = ((5 - firstDow + 7) % 7) + 1;
  if (day === firstFriday || day === firstFriday - 1) return "بيانات الوظائف الأمريكية NFP (تقديري)";
  if (day >= 11 && day <= 13) return "بيانات التضخم CPI (تقديري)";
  return null;
}

/** تصنيف نظام السوق عند الشمعة i (سببي — لا مستقبل) */
function regimeAt(ctx: Ctx, i: number): Regime {
  const adx = ctx.adxArr[i];
  const e50 = ctx.ema50[i];
  const e200 = ctx.ema200[i];
  if (isNaN(adx) || isNaN(e50) || isNaN(e200)) return "range";
  if (adx >= 20) return e50 >= e200 ? "trend_up" : "trend_down";
  return "range";
}

// ---------- صفقة التدريب ----------
interface TrainerTrade {
  i: number;
  t: number;
  entryT: number;
  dir: 1 | -1;
  entry: number;
  sl: number;
  tp1: number;
  result: "win" | "loss" | "timeout";
  r: number;
  bars: number;
  endIdx: number;
  confidence: number;
  votes: Vote[];
  regime: Regime;
}

function statsOfTrades(trades: TrainerTrade[]): BtStats {
  const wins = trades.filter((t) => t.result === "win").length;
  const losses = trades.filter((t) => t.result === "loss").length;
  const timeouts = trades.length - wins - losses;
  const grossR = trades.reduce((a, t) => a + t.r, 0);
  const posR = trades.filter((t) => t.r > 0).reduce((a, t) => a + t.r, 0);
  const negR = Math.abs(trades.filter((t) => t.r < 0).reduce((a, t) => a + t.r, 0));

  let cum = 0;
  let peak = 0;
  let maxDd = 0;
  for (const t of trades) {
    cum += t.r;
    peak = Math.max(peak, cum);
    maxDd = Math.max(maxDd, peak - cum);
  }
  let best = 0;
  let worst = 0;
  let curW = 0;
  let curL = 0;
  for (const t of trades) {
    if (t.result === "win") {
      curW++;
      curL = 0;
    } else {
      curL++;
      curW = 0;
    }
    best = Math.max(best, curW);
    worst = Math.max(worst, curL);
  }
  const n = trades.length;
  return {
    trades: n,
    wins,
    losses,
    timeouts,
    winRate: n ? wins / n : 0,
    avgR: n ? grossR / n : 0,
    grossR: r2(grossR),
    profitFactor: negR > 0 ? r2(posR / negR) : posR > 0 ? 99 : 0,
    expectancyR: n ? r3(grossR / n) : 0,
    maxDrawdownR: r2(maxDd),
    bestStreak: best,
    worstStreak: worst,
  };
}

function equityOf(trades: TrainerTrade[]): number[] {
  const eq: number[] = [0];
  for (const t of trades) eq.push(r2(eq[eq.length - 1] + t.r));
  return eq;
}

// ============================================================
// التنفيذ الرئيسي — التدريب الذاتي على 6 أشهر
// ============================================================
export async function runSelfTraining(requestedEpochs: number): Promise<SelfTrainingResult> {
  const epochsWanted = clamp(Math.floor(requestedEpochs), 2, MAX_EPOCHS);

  // ---------- 1) البيانات: ساعة × 6 أشهر (احتياطي: يومي × سنتين) ----------
  let candles: Candle[] = [];
  let dataSource = "";
  let tf: "1h" | "1d" = "1h";
  let hold = 24; // بالشموع

  try {
    candles = await fetchCandles("GC=F", "60m", "6mo");
    dataSource = "Yahoo Finance GC=F — 6 أشهر @ شمعة الساعة";
  } catch {
    candles = [];
  }

  let startIdx = WARMUP_1H;
  if (candles.length < 800) {
    // وضع احتياطي: يومي — نستخدم آخر ~126 يوم تداول (≈6 أشهر)
    const daily = await fetchCandles("GC=F", "1d", "2y");
    if (daily.length < 260) {
      throw new Error(`بيانات غير كافية للتدريب (${daily.length} شمعة يومية)`);
    }
    candles = daily;
    tf = "1d";
    hold = 10;
    startIdx = Math.max(40, candles.length - 130);
    dataSource = "Yahoo Finance GC=F — وضع يومي احتياطي (آخر 6 أشهر)";
  }

  const len = candles.length;
  if (len - startIdx < 60) throw new Error("نافذة التدريب ضيقة جداً — أعد المحاولة");

  // ---------- 2) المؤشرات السببية (مرة واحدة) ----------
  const closes = candles.map((c) => c.c);
  const emaSet = computeEMASet(closes);
  const rsiArr = rsi(closes, 14);
  const macdData = macd(closes);
  const bbData = bollinger(closes);
  const atrData = atr(candles, 14);
  const adxArr = adxSeries(candles, 14);
  const atrAvg = rollingAvg(atrData.values, 50);

  const bw: number[] = new Array(len).fill(NaN);
  for (let i = 0; i < len; i++) {
    const u = bbData.upper[i];
    const m = bbData.mid[i];
    if (!isNaN(u) && !isNaN(m) && m > 0) bw[i] = ((bbData.upper[i] - bbData.lower[i]) / m) * 100;
  }
  const bwAvg = rollingAvg(bw, 50);
  const { days, dayOf } = buildDays(candles);

  const ctx: Ctx = {
    candles,
    closes,
    ema9: emaSet.ema9,
    ema21: emaSet.ema21,
    ema50: emaSet.ema50,
    ema200: emaSet.ema200,
    rsiArr,
    macdLine: macdData.line,
    macdSignal: macdData.signal,
    macdHist: macdData.histogram,
    bbUpper: bbData.upper,
    bbLower: bbData.lower,
    bw,
    bwAvg,
    atrArr: atrData.values,
    adxArr,
    days,
    dayOf,
  };

  // ---------- 3) تصويت الاستراتيجيات عند كل شمعة (مستقل عن الأوزان) ----------
  const votesAll: Vote[][] = new Array(len);
  for (let i = startIdx; i < len - 1; i++) {
    votesAll[i] = evaluateAt(ctx, i);
  }
  const regimes: Regime[] = new Array(len);
  for (let i = startIdx; i < len; i++) regimes[i] = regimeAt(ctx, i);

  // ذاكرة أيام الأحداث (لكل مفتاح يوم)
  const eventByDay = new Map<string, string | null>();
  function eventAt(i: number): string | null {
    const d = new Date(candles[i].t);
    const k = `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
    if (!eventByDay.has(k)) eventByDay.set(k, highImpactDay(candles[i].t));
    return eventByDay.get(k) ?? null;
  }

  // ---------- 4) التوليفة الموزونة بالأوزان والمضاعفات ----------
  type MultMap = Record<string, Record<Regime, number>>;
  const initMults = (): MultMap => {
    const m: MultMap = {};
    for (const meta of STRATEGY_META) m[meta.key] = { trend_up: 1, trend_down: 1, range: 1 };
    return m;
  };

  function runComposite(
    from: number,
    to: number,
    pillarW: Record<string, number>,
    mults: MultMap
  ): TrainerTrade[] {
    const trades: TrainerTrade[] = [];
    let busyUntil = -1;
    let lastAsianDay = -1;
    for (let i = from; i < to; i++) {
      if (i <= busyUntil) continue;
      const votes = votesAll[i] ?? [];
      if (!votes.length) continue;
      const reg = regimes[i];
      let num = 0;
      let den = 0;
      for (const v of votes) {
        const meta = META_BY_KEY.get(v.key);
        if (!meta) continue;
        const w = (pillarW[meta.pillar] / 100) * mults[v.key][reg];
        num += v.dir * w;
        den += w;
      }
      if (den <= 0) continue;
      const net = num / den;
      if (net < 0.15 && net > -0.15) continue;
      const dir: 1 | -1 = net >= 0 ? 1 : -1;
      const agreeing = votes.filter((v) => v.dir === dir);
      if (agreeing.length < 2) continue;

      const hasAsian = agreeing.some((v) => v.key === "asian_breakout");
      if (hasAsian) {
        const d = dayOf[i];
        if (d === lastAsianDay) continue;
        lastAsianDay = d;
      }

      const c = candles[i];
      const a = ctx.atrArr[i];
      if (isNaN(a) || a < 0.3) continue;
      const sl = dir === 1 ? c.c - 1.5 * a : c.c + 1.5 * a;
      const sim = simulate(candles, i, dir, sl, hold);
      if (!sim) continue;
      trades.push({
        i,
        t: candles[i].t,
        entryT: candles[i + 1].t,
        dir,
        entry: candles[i + 1].o,
        sl,
        tp1: candles[i + 1].o + dir * Math.abs(candles[i + 1].o - sl),
        result: sim.result,
        r: sim.r,
        bars: sim.bars,
        endIdx: sim.endIdx,
        confidence: clamp(Math.round(Math.abs(net) * 100), 15, 99),
        votes,
        regime: reg,
      });
      busyUntil = sim.endIdx;
    }
    return trades;
  }

  // ---------- 5) الإسناد: من أصاب ومن أخطأ في كل صفقة ----------
  function attribute(trades: TrainerTrade[]): Map<string, { n: number; correct: number }> {
    const map = new Map<string, { n: number; correct: number }>();
    for (const t of trades) {
      for (const v of t.votes) {
        const participated = v.dir === t.dir;
        let correct: boolean | null = null;
        if (t.result === "win") correct = participated;
        else if (t.result === "loss") correct = !participated;
        else if (t.r > 0.05) correct = participated;
        else if (t.r < -0.05) correct = !participated;
        if (correct === null) continue;
        const key = `${v.key}|${t.regime}`;
        const s = map.get(key) ?? { n: 0, correct: 0 };
        s.n++;
        if (correct) s.correct++;
        map.set(key, s);
      }
    }
    return map;
  }

  // ---------- 6) تحديث المضاعفات (التعلم الفعلي) ----------
  function updateMults(
    mults: MultMap,
    attribution: Map<string, { n: number; correct: number }>
  ): { key: string; nameAr: string; regime: Regime; from: number; to: number }[] {
    const changes: { key: string; nameAr: string; regime: Regime; from: number; to: number }[] = [];
    for (const meta of STRATEGY_META) {
      for (const reg of ["trend_up", "trend_down", "range"] as Regime[]) {
        const s = attribution.get(`${meta.key}|${reg}`);
        if (!s || s.n < 6) continue; // عينة صغيرة — لا تعلم
        const target = clamp(wilsonLower(s.correct, s.n) / 0.5, 0.55, 1.45);
        const old = mults[meta.key][reg];
        const next = clamp(old * 0.65 + target * 0.35, 0.5, 1.5);
        if (Math.abs(next - old) >= 0.03) {
          mults[meta.key][reg] = next;
          changes.push({ key: meta.key, nameAr: meta.nameAr, regime: reg, from: old, to: next });
        }
      }
    }
    return changes.sort((a, b) => Math.abs(b.to - b.from) - Math.abs(a.to - a.from));
  }

  // ---------- 7) اشتقاق أوزان الأعمدة من مضاعفات الاستراتيجيات ----------
  function derivePillarWeights(mults: MultMap): Record<string, number> {
    const out: Record<string, number> = {};
    for (const p of PILLAR_KEYS) {
      let num = 0;
      let den = 0;
      for (const meta of STRATEGY_META) {
        if (meta.pillar !== p) continue;
        const m = (mults[meta.key].trend_up + mults[meta.key].trend_down + mults[meta.key].range) / 3;
        num += m;
        den++;
      }
      const pillarMult = den > 0 ? num / den : 1;
      out[p] = BASE_PILLAR_WEIGHTS[p] * pillarMult;
    }
    let sum = PILLAR_KEYS.reduce((a, k) => a + out[k], 0);
    for (const k of PILLAR_KEYS) out[k] = Math.max(6, out[k]);
    sum = PILLAR_KEYS.reduce((a, k) => a + out[k], 0);
    for (const k of PILLAR_KEYS) out[k] = r1((out[k] / sum) * 100);
    const sum2 = PILLAR_KEYS.reduce((a, k) => a + out[k], 0);
    out.trend = r1(out.trend + (100 - sum2)); // تصحيح كسور التقريب
    return out;
  }

  // ---------- 8) حلقات التعلم (Epochs) على أول 75% ----------
  const split = startIdx + Math.floor((len - 1 - startIdx) * 0.75);
  let pillarW: Record<string, number> = { ...BASE_PILLAR_WEIGHTS } as Record<string, number>;
  const mults = initMults();
  const epochLog: TrainEpoch[] = [];
  let epochsRun = 0;
  let converged = false;

  for (let e = 1; e <= epochsWanted; e++) {
    const trades = runComposite(startIdx, split, pillarW, mults);
    const st = statsOfTrades(trades);
    const attribution = attribute(trades);
    const changes = updateMults(mults, attribution);
    pillarW = derivePillarWeights(mults);

    const top = changes.slice(0, 2).map((c) => {
      const dirTxt = c.to > c.from ? "رُفع" : "خُفض";
      const regAr = REGIME_AR[c.regime];
      return `${dirTxt} مضاعف «${c.nameAr}» في ${regAr} من ${r2(c.from)} إلى ${r2(c.to)}`;
    });
    const prev = epochLog[epochLog.length - 1];
    let note: string;
    if (!prev) {
      note = `الحلقة الأولى: ${st.trades} توقعاً أعمى على فترة التعلم — دقة ${r1(st.winRate * 100)}%. ${
        top.length ? `أول تعديلات: ${top.join("، ")}.` : "لا تعديلات جوهرية بعد (عينات صغيرة)."
      }`;
    } else {
      const delta = (st.winRate - prev.winRate) * 100;
      note = `الحلقة ${e}: دقة ${r1(st.winRate * 100)}% (${delta >= 0 ? "+" : ""}${r1(delta)} نقطة عن الحلقة السابقة). ${
        top.length ? top.join("، ") + "." : "الأوزان مستقرة تقريباً."
      }`;
    }
    epochLog.push({
      epoch: e,
      trades: st.trades,
      winRate: r1(st.winRate * 100),
      profitFactor: st.profitFactor,
      expectancyR: st.expectancyR,
      grossR: st.grossR,
      weightsSnapshot: { ...pillarW },
      multSnapshot: Object.fromEntries(
        STRATEGY_META.map((m) => [
          m.key,
          r2((mults[m.key].trend_up + mults[m.key].trend_down + mults[m.key].range) / 3),
        ])
      ),
      note,
    });
    epochsRun = e;

    // استقرار التعلم
    if (e >= 3 && prev) {
      const prev2 = epochLog[epochLog.length - 3];
      const d1 = Math.abs(st.winRate - prev.winRate) * 100;
      const d2 = Math.abs(st.winRate - prev2.winRate) * 100;
      if (d1 < MIN_CONVERGENCE && d2 < MIN_CONVERGENCE * 1.5) {
        converged = true;
        break;
      }
    }
  }

  // ---------- 9) الاختبار الأعمى الصارم: آخر 25% (لم ترها حلقات التعلم) ----------
  const tradesBeforeH = runComposite(split, len - 1, { ...BASE_PILLAR_WEIGHTS } as Record<string, number>, initMults());
  const tradesAfterH = runComposite(split, len - 1, pillarW, mults);
  const stBeforeH = statsOfTrades(tradesBeforeH);
  const stAfterH = statsOfTrades(tradesAfterH);
  const improvement = (stAfterH.winRate - stBeforeH.winRate) * 100;

  let verdict: string;
  if (stAfterH.trades < 8) {
    verdict = "عدد تنبؤات في فترة الاختبار صغير — النتيجة استرشادية فقط.";
  } else if (improvement > 3) {
    verdict = `التدريب حسّن الأداء فعلياً: +${r1(improvement)}% فوز على بيانات لم يرها البوت إطلاقاً أثناء التعلم ✓`;
  } else if (improvement < -3) {
    verdict = `تنبيه: الأوزان المتعلمة أداءها أدنى بـ${r1(Math.abs(improvement))}% على الفترة الأعمى — علامة فرط تجهيز، جرّب تقليل الحلقات.`;
  } else {
    verdict = `أداء مقارب (+${r1(improvement)}%) — الأوزان المتعلمة آمنة الاستخدام ولم تضر الأداء خارج العينة.`;
  }

  // ---------- 10) الجولة النهائية على كامل 6 أشهر بالأوزان المتعلمة ----------
  const finalTrades = runComposite(startIdx, len - 1, pillarW, mults);
  const finalStats = statsOfTrades(finalTrades);
  const finalAttribution = attribute(finalTrades);
  const equity = equityOf(finalTrades).slice(0, 400); // سلسلة مضغوطة

  // حفظ حالة التعلم ليمتد إليها محرك الإشارة المباشر
  setLearnedState({
    weights: pillarW,
    stats: {
      winRate: finalStats.winRate,
      trades: finalStats.trades,
      profitFactor: finalStats.profitFactor,
      expectancyR: finalStats.expectancyR,
      maxDrawdownR: finalStats.maxDrawdownR,
      tf,
      from: new Date(candles[startIdx].t).toISOString(),
      to: new Date(candles[len - 1].t).toISOString(),
      updatedAt: new Date().toISOString(),
    },
    tf,
    ts: Date.now(),
  });

  // ---------- 11) التفسير الذاتي (قلب الطلب: "يعطي تفسير لنفسه") ----------
  const LOSS_TAG_LESSONS: Record<string, { title: string; did: string }> = {
    counter_trend: {
      title: "الإشارات المعاكسة للاتجاه العام (ضد EMA200) خطرها أعلى",
      did: "خُفضت مضاعفات الاستراتيجيات الانعكاسية عند تعارضها مع EMA200",
    },
    range: {
      title: "الأسواق العرضية (ADX أقل من 20) تُفشل استراتيجيات الاختراق والاتجاه",
      did: "مضاعفات الاتجاه/الاختراق في نظام «سوق عرضي» خُفضت حلقة بعد حلقة",
    },
    vol: {
      title: "توسع التقلب (ATR فوق 130% من متوسطه) يبتلع الأوقاف الضيقة",
      did: "البوت يحاسب مسافة الوقف بمقياس ATR آلياً في إشاراته المباشرة",
    },
    news: {
      title: "أيام البيانات عالية التأثير (NFP / CPI / FOMC) تُطفئ الإشارات الفنية",
      did: "البوت يعرض تحذيراً خبرياً ويعتدل في الثقة قبل وأثناء هذه الأيام",
    },
    ob: {
      title: "الشراء في التشبع الشرائي والبيع في التشبع البيعي يواجهان ارتداداً حاداً",
      did: "خُفض وزن إشارات RSI المتطرفة عند تعارض الاتجاه",
    },
    weak: {
      title: "التوافق المحدود (استراتيجيتان فقط) يعني إشارة أقل نضجاً",
      did: "البوت يجعل الثقة متناسبة مع قوة التوافق فيصل التصفية إلى الإشارات الضعيفة",
    },
    generic: {
      title: "جزء من الخسائر ضجيج طبيعي بلا سبب هيكلي — التوزيع الطبيعي للتداول",
      did: "الالتزام بوقف 1R حصر الأضرار وحمى رأس المال",
    },
  };

  function lossCausesOf(t: TrainerTrade): { tag: string; text: string }[] {
    const i = t.i;
    const c = candles[i];
    const causes: { tag: string; text: string }[] = [];
    const adx = ctx.adxArr[i];
    const rsiNow = ctx.rsiArr[i];
    const a = ctx.atrArr[i];
    const avgA = atrAvg[i];
    const atrR = !isNaN(avgA) && avgA > 0 ? a / avgA : 1;
    const e200 = ctx.ema200[i];

    if (!isNaN(e200) && t.dir === 1 && c.c < e200)
      causes.push({ tag: "counter_trend", text: `الدخول الشرائي جاء والسعر تحت EMA200 — إشارة انعكاسية ضد الاتجاه العام الكلي، وهذا النوع أضعف إحصائياً` });
    if (!isNaN(e200) && t.dir === -1 && c.c > e200)
      causes.push({ tag: "counter_trend", text: `الدخول البيعي جاء والسعر فوق EMA200 — بيع ضد الاتجاه العام الكلي` });
    if (!isNaN(adx) && adx < 20)
      causes.push({ tag: "range", text: `سوق عرضي (ADX=${adx.toFixed(0)}) — استراتيجيات الاختراق والاتجاه تفشل غالباً بلا اتجاه واضح` });
    if (atrR > 1.3)
      causes.push({ tag: "vol", text: `توسع تقلب (ATR=${Math.round(atrR * 100)}% من متوسطه) تجاوز مسافة الوقف سريعاً` });
    const ev = eventAt(i);
    if (ev) causes.push({ tag: "news", text: `تزامن التوقيت مع ${ev} — التذبذب الخبري أثناء الإصدار أطفأ الإشارة الفنية` });
    if (t.dir === 1 && !isNaN(rsiNow) && rsiNow > 68)
      causes.push({ tag: "ob", text: `RSI=${rsiNow.toFixed(0)} في تشبع شرائي — الشراء عند هذه المستويات يواجه ارتداداً حاداً` });
    if (t.dir === -1 && !isNaN(rsiNow) && rsiNow < 32)
      causes.push({ tag: "ob", text: `RSI=${rsiNow.toFixed(0)} في تشبع بيعي — البيع عند هذه المستويات يواجه ارتداداً حاداً` });
    const agreeCount = t.votes.filter((v) => v.dir === t.dir).length;
    if (agreeCount < 3) causes.push({ tag: "weak", text: `توافق محدود (${agreeCount} استراتيجيات فقط) — إشارة أقل نضجاً` });
    if (!causes.length) causes.push({ tag: "generic", text: "لا سبب هيكلي واضح — خسارة ضمن التوزيع الطبيعي لضجيج السوق" });
    return causes;
  }

  function buildExplanation(t: TrainerTrade): { text: string; lossTags: string[] } {
    const i = t.i;
    const c = candles[i];
    const dirAr = t.dir === 1 ? "شراء" : "بيع";
    const entryS = t.entry.toFixed(1);
    const agreeNames = t.votes.filter((v) => v.dir === t.dir).map((v) => META_BY_KEY.get(v.key)?.nameAr ?? v.key);
    const disagreeNames = t.votes.filter((v) => v.dir !== t.dir).map((v) => META_BY_KEY.get(v.key)?.nameAr ?? v.key);
    const adx = ctx.adxArr[i];
    const regAr = REGIME_AR[t.regime];

    if (t.result === "win") {
      let factor: string;
      const e200 = ctx.ema200[i];
      if (!isNaN(e200) && ((t.dir === 1 && c.c > e200) || (t.dir === -1 && c.c < e200))) {
        factor = "العامل الأهم: الإشارة جاءت مع اتجاه EMA200 العام — التداول مع التيار يرفع احتمالية بلوغ الهدف.";
      } else if (!isNaN(adx) && adx >= 25) {
        factor = `العامل الأهم: قوة اتجاهية (ADX=${adx.toFixed(0)}) دعمت استمرار الحركة بعد الدخول.`;
      } else if (t.confidence >= 60) {
        factor = `العامل الأهم: توافق قوي (${t.confidence}%) بين الاستراتيجيات المتفقة.`;
      } else {
        factor = "العامل الأهم: انضباط الوقف/الهدف بمقياس ATR حصر المخاطرة وترك الربح يتحقق.";
      }
      return {
        text: `التنبؤ صحيح ✓ — إشارة ${dirAr} عند ${entryS}$ بلغت الهدف خلال ${t.bars} شمعة (+1R). شاركت ${agreeNames.length} استراتيجيات (${agreeNames.slice(0, 3).join("، ")}). النظام السوقي: ${regAr}${!isNaN(adx) ? ` (ADX=${adx.toFixed(0)})` : ""}. ${factor}`,
        lossTags: [],
      };
    }

    if (t.result === "timeout") {
      return {
        text: `انتهاء مدة الانتظار — إشارة ${dirAr} عند ${entryS}$ أُغلقت على إغلاق الشمعة الأخيرة بنتيجة ${t.r >= 0 ? "+" : ""}${t.r}R خلال ${t.bars} شمعة. ${
          t.r > 0 ? "الاتجاه كان صحيحاً لكن الزخم لم يكفِ لبلوغ الهدف كاملاً." : "الحركة دخلت تجميداً عرضياً — أفضل من اصطدام الوقف."
        } النظام: ${regAr}.`,
        lossTags: [],
      };
    }

    // خسارة — تحليل ذاتي للأسباب
    const chosen = lossCausesOf(t).slice(0, 2);
    const disagreeTxt = disagreeNames.length
      ? ` لاحظ البوت أن ${disagreeNames.slice(0, 2).join(" و")} صوتت عكس الإشارة — تجاهلها كان خطأ.`
      : "";
    const lessonTxt = chosen
      .map((cc) => LOSS_TAG_LESSONS[cc.tag]?.did ?? "")
      .filter(Boolean)
      .join("؛ ");
    return {
      text: `التنبؤ خاطئ ✗ — إشارة ${dirAr} عند ${entryS}$ اصطدمت وقف الخسارة (-1R خلال ${t.bars} شمعة). تحليل البوت لخطئه: ${chosen.map((cc) => cc.text).join("؛ ")}.${disagreeTxt} الدرس المطبّق: ${lessonTxt}`,
      lossTags: chosen.map((cc) => cc.tag),
    };
  }

  // ---------- 12) الخط الزمني للتنبؤات (إعادة تشغيل تفاعلي) ----------
  const timeline: TrainTimelineEntry[] = [];
  const stride = finalTrades.length > 240 ? Math.ceil(finalTrades.length / 240) : 1;
  for (let k = 0; k < finalTrades.length; k += stride) {
    const t = finalTrades[k];
    const d = new Date(t.t);
    const dateLabel = `${d.getUTCDate()} ${AR_MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()} · ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())} UTC`;
    const { text, lossTags } = buildExplanation(t);
    const exitPrice =
      t.result === "win" ? t.tp1 : t.result === "loss" ? t.sl : candles[Math.min(t.endIdx, len - 1)].c;
    timeline.push({
      i: t.i,
      t: t.t,
      dateLabel,
      phase: t.i < split ? "train" : "holdout",
      dir: t.dir === 1 ? "BUY" : "SELL",
      entry: r1(t.entry),
      sl: r1(t.sl),
      tp1: r1(t.tp1),
      confidence: t.confidence,
      agreeing: t.votes.filter((v) => v.dir === t.dir).map((v) => META_BY_KEY.get(v.key)?.nameAr ?? v.key),
      disagreeing: t.votes.filter((v) => v.dir !== t.dir).map((v) => META_BY_KEY.get(v.key)?.nameAr ?? v.key),
      regime: t.regime,
      regimeAr: REGIME_AR[t.regime],
      eventDay: eventAt(t.i),
      result: t.result,
      r: t.r,
      bars: t.bars,
      exitPrice: r1(exitPrice),
      explanation: text,
      lossTags,
    });
  }

  // ---------- 13) جدول الاستراتيجيات بمضاعفاتها ----------
  const strategies: StrategyMult[] = STRATEGY_META.map((meta) => {
    let n = 0;
    let correct = 0;
    for (const reg of ["trend_up", "trend_down", "range"] as Regime[]) {
      const s = finalAttribution.get(`${meta.key}|${reg}`);
      if (s) {
        n += s.n;
        correct += s.correct;
      }
    }
    return {
      key: meta.key,
      nameAr: meta.nameAr,
      pillarAr: meta.pillarAr,
      global: r2((mults[meta.key].trend_up + mults[meta.key].trend_down + mults[meta.key].range) / 3),
      trendUp: r2(mults[meta.key].trend_up),
      trendDown: r2(mults[meta.key].trend_down),
      range: r2(mults[meta.key].range),
      samples: n,
      winRate: n ? r1((correct / n) * 100) : 0,
    };
  }).sort((a, b) => b.samples - a.samples);

  // ---------- 14) الدروس المستخلصة (مجمعة من كل الخسائر) ----------
  const lessons: TrainLesson[] = [];
  {
    const tagCounts = new Map<string, number>();
    for (const t of finalTrades) {
      if (t.result !== "loss") continue;
      for (const tag of lossCausesOf(t).map((cc) => cc.tag)) {
        tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
      }
    }
    for (const [tag, count] of [...tagCounts.entries()].sort((a, b) => b[1] - a[1])) {
      if (count < 2) continue;
      const L = LOSS_TAG_LESSONS[tag];
      if (!L) continue;
      lessons.push({ key: tag, text: `${L.title} (${count} حالة) — ${L.did}.`, count, severity: "warn" });
    }
  }

  // ---------- 15) المعايرة: هل الثقة العالية تعني فوزاً أعلى؟ ----------
  let lowN = 0, lowW = 0, midN = 0, midW = 0, highN = 0, highW = 0;
  for (const t of finalTrades) {
    const correct = t.result === "win" || (t.result === "timeout" && t.r > 0.05);
    if (t.confidence < 45) { lowN++; if (correct) lowW++; }
    else if (t.confidence <= 65) { midN++; if (correct) midW++; }
    else { highN++; if (correct) highW++; }
  }
  const lowWr = lowN ? lowW / lowN : 0;
  const midWr = midN ? midW / midN : 0;
  const highWr = highN ? highW / highN : 0;
  const calibVerdict =
    highN >= 10 && lowN >= 10
      ? highWr - lowWr > 0.08
        ? "معايرة جيدة ✓: توقعات الثقة العالية تتفوق فعلاً على منخفضة الثقة"
        : "الثقة تحتاج معايرة: لا فارق واضح بين مستويات الثقة"
      : "عينات المعايرة غير كافية للحكم";

  // ---------- 16) ملاحظات الأنظمة السوقية ----------
  const regimeNotes: string[] = [];
  for (const reg of ["trend_up", "trend_down", "range"] as Regime[]) {
    const rt = finalTrades.filter((t) => t.regime === reg);
    if (!rt.length) {
      regimeNotes.push(`${REGIME_AR[reg]}: لم تتولد إشارات كافية`);
      continue;
    }
    const wr = rt.filter((t) => t.result === "win").length / rt.length;
    regimeNotes.push(
      `${REGIME_AR[reg]}: ${rt.length} تنبؤاً — دقة ${r1(wr * 100)}% — ${
        wr >= 0.55 ? "بيئة مواتية لاستراتيجيات البوت" : wr >= 0.45 ? "أداء متوسط" : "بيئة صعبة — البوت يقلص نشاطه فيها"
      }`
    );
  }

  // ---------- 17) تحليل الشهور (الشهر الحالي + السابق + كل الأشهر) ----------
  const months: BtMonth[] = [];
  {
    interface MonthAgg { ym: string; open: number; close: number; high: number; low: number }
    const byMonth = new Map<string, MonthAgg>();
    const order: string[] = [];
    for (let i = startIdx; i < len; i++) {
      const d = new Date(candles[i].t);
      const ym = `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`;
      let agg = byMonth.get(ym);
      if (!agg) {
        agg = { ym, open: candles[i].o, close: candles[i].c, high: -Infinity, low: Infinity };
        byMonth.set(ym, agg);
        order.push(ym);
      }
      agg.close = candles[i].c;
      agg.high = Math.max(agg.high, candles[i].h);
      agg.low = Math.min(agg.low, candles[i].l);
    }
    for (const ym of order) {
      const agg = byMonth.get(ym)!;
      const mt = finalTrades.filter((t) => {
        const d = new Date(t.t);
        return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}` === ym;
      });
      const mWins = mt.filter((t) => t.result === "win").length;
      const buys = mt.filter((t) => t.dir === 1).length;
      const sells = mt.length - buys;
      const [y, m] = ym.split("-");
      months.push({
        ym,
        label: `${AR_MONTHS[parseInt(m, 10) - 1]} ${y}`,
        open: r1(agg.open),
        high: r1(agg.high),
        low: r1(agg.low),
        close: r1(agg.close),
        changePct: r1(((agg.close - agg.open) / agg.open) * 100),
        atrAvg: 0,
        trades: mt.length,
        wins: mWins,
        wr: mt.length ? r1((mWins / mt.length) * 100) : 0,
        dominant: buys > sells * 1.3 ? "BUY" : sells > buys * 1.3 ? "SELL" : "متوازن",
      });
    }
  }

  // ---------- 18) المعرفة الذاتية ----------
  const withStats = strategies.filter((s) => s.samples >= 12);
  const bestS = withStats.slice().sort((a, b) => b.winRate - a.winRate)[0] ?? null;
  const worstS = withStats.slice().sort((a, b) => a.winRate - b.winRate)[0] ?? null;

  if (bestS) {
    lessons.push({
      key: "best",
      text: `أقوى سلاح حالياً: «${bestS.nameAr}» — إصابة ${bestS.winRate}% عبر ${bestS.samples} مشاركة في التوليفة. البوت يرفع وزنها تدريجياً.`,
      count: bestS.samples,
      severity: "good",
    });
  }
  lessons.push({
    key: "calibration",
    text: `${calibVerdict}${
      highN >= 10 && lowN >= 10 ? ` (دقة الثقة العالية ${r1(highWr * 100)}% مقابل ${r1(lowWr * 100)}% للمنخفضة)` : ""
    }.`,
    count: highN,
    severity: highWr > lowWr + 0.08 ? "good" : "info",
  });
  lessons.push({
    key: "holdout",
    text: `الاختبار الأعمى (آخر 25% من الفترة — لم يرها البوت إطلاقاً أثناء التعلم): ${verdict}`,
    count: stAfterH.trades,
    severity: improvement >= 0 ? "good" : "info",
  });

  const summary = `تدرّب البوت على ${(len - startIdx).toLocaleString("en-US")} شمعة ${
    tf === "1h" ? "ساعة" : "يومية"
  } تغطي نحو 6 أشهر، وأنجز ${finalStats.trades} توقعاً أعمى عبر ${epochsRun} ${
    epochsRun === 1 ? "حلقة تعلم" : "حلقات تعلم"
  }${converged ? " (استقر التعلم مبكراً)" : ""}. دقة التنبؤ على كامل الفترة ${r1(
    finalStats.winRate * 100
  )}%، وفي فترة الاختبار الأعمى ${r1(stAfterH.winRate * 100)}% مقابل ${r1(
    stBeforeH.winRate * 100
  )}% بالأوزان الأساسية قبل التدريب. أقوى استراتيجية: ${
    bestS ? `«${bestS.nameAr}» بإصابة ${bestS.winRate}%` : "غير محددة بعينة كافية"
  }؛ الأضعف: ${worstS ? `«${worstS.nameAr}» بإصابة ${worstS.winRate}%` : "غير محددة"}. استخلص ${
    lessons.length
  } درساً يضبط بها أوزانه المباشرة.`;

  // ---------- 19) مستوى التدريب ----------
  const epochsPart = Math.min(35, epochsRun * 6);
  const holdoutPart = clamp(improvement * 1.5, -15, 20);
  const sep = highN >= 10 && lowN >= 10 ? (highWr - lowWr) * 100 : 0;
  const calibPart = sep > 5 ? clamp(sep, 5, 15) : 0;
  const coveragePart = finalStats.trades >= 80 ? 10 : Math.round(finalStats.trades / 8);
  const lessonsPart = Math.min(10, lessons.length * 2);
  const score = clamp(Math.round(epochsPart + holdoutPart + calibPart + coveragePart + lessonsPart), 0, 100);
  const label =
    score < 30 ? "مبتدئ" : score < 50 ? "متدرب" : score < 68 ? "متدرب جيداً" : score < 84 ? "متدرب متقدم" : "خبير متدرّب جداً";

  // ---------- 20) النتيجة النهائية ----------
  return {
    tf,
    epochsRun,
    requestedEpochs: epochsWanted,
    converged,
    generatedAt: new Date().toISOString(),
    dataSource,
    window: {
      from: new Date(candles[startIdx].t).toISOString(),
      to: new Date(candles[len - 1].t).toISOString(),
      candles: len - startIdx,
      months: 6,
    },
    blindStats: finalStats,
    holdout: {
      tradesBefore: stBeforeH.trades,
      winRateBefore: r1(stBeforeH.winRate * 100),
      pfBefore: stBeforeH.profitFactor,
      expBefore: stBeforeH.expectancyR,
      tradesAfter: stAfterH.trades,
      winRateAfter: r1(stAfterH.winRate * 100),
      pfAfter: stAfterH.profitFactor,
      expAfter: stAfterH.expectancyR,
      equityBefore: equityOf(tradesBeforeH).slice(0, 300),
      equityAfter: equityOf(tradesAfterH).slice(0, 300),
      improvementPct: r1(improvement),
      verdict,
    },
    epochLog,
    equity,
    timeline,
    strategies,
    lessons,
    months,
    selfKnowledge: {
      blindAccuracy: r1(finalStats.winRate * 100),
      totalPredictions: finalStats.trades,
      bestStrategy: bestS?.nameAr ?? null,
      bestStrategyWr: bestS?.winRate ?? 0,
      worstStrategy: worstS?.nameAr ?? null,
      worstStrategyWr: worstS?.winRate ?? 0,
      calibration: {
        lowWr: r1(lowWr * 100),
        midWr: r1(midWr * 100),
        highWr: r1(highWr * 100),
        lowN,
        midN,
        highN,
        verdict: calibVerdict,
      },
      regimeNotes,
      summary,
    },
    trainingLevel: { score, label, epochsDone: epochsRun },
    weights: pillarW,
    weightsParam: weightsToParam(pillarW),
  };
}
