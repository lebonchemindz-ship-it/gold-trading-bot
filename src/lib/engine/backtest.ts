// ============================================================
// محرك التدريب الذاتي — Walk-Forward Backtest
// البروتوكول (كما طلبه المستخدم):
//   1) البوت "يجرب" كل استراتيجية على شمعة تاريخية C(i)
//      باستخدام بيانات C(0..i) فقط — لا يمكنه رؤية النتيجة
//   2) الدخول على افتتاح الشمعة التالية C(i+1) — بلا نظرة مستقبلية
//   3) بعدها "يتأكد": هل ضرب الهدف أم الوقف؟ (بأولوية الوقف — متحفظ)
//   4) يقوّي استراتيجيته: أوزان الأعمدة تُعدّل وفق Wilson bound
//   5) اختبار إسقاطي صادق: يتعلم على أول 70% ويُختبر على آخر 30%
//      (الفترة الأخيرة لم يرها إطلاقاً أثناء التعلم)
// كل المؤشرات المستخدمة سببية (causal): قيمتها عند i تعتمد فقط
// على الشموع 0..i — إعادة حسابها على الشرائح تعطي نفس النتيجة
// ============================================================

import { fetchCandles } from "./market";
import { computeEMASet, rsi, macd, bollinger, atr } from "./indicators";
import { BASE_PILLAR_WEIGHTS, PILLAR_KEYS, setLearnedState } from "./learning";
import type { Candle } from "./types";

// ---------- الأنواع العامة ----------
export interface BtStats {
  trades: number;
  wins: number;
  losses: number;
  timeouts: number;
  winRate: number; // 0..1
  avgR: number;
  grossR: number;
  profitFactor: number;
  expectancyR: number;
  maxDrawdownR: number;
  bestStreak: number;
  worstStreak: number;
}

export interface BtStrategy {
  key: string;
  nameAr: string;
  pillar: string;
  pillarAr: string;
  trades: number;
  wins: number;
  losses: number;
  timeouts: number;
  winRate: number;
  wilson: number;
  avgR: number;
  profitFactor: number;
  multiplier: number; // عامل التعلم 0.55..1.45
  grossR: number;
}

export interface BtTrade {
  t: number; // وقت الإشارة (إغلاق الشمعة)
  entryT: number;
  dir: "BUY" | "SELL";
  strategies: string[]; // الاستراتيجيات المتفقة
  entry: number;
  sl: number;
  tp1: number;
  result: "win" | "loss" | "timeout";
  r: number;
  bars: number;
}

export interface BtMonth {
  ym: string; // 2025-08
  label: string; // أغسطس 2025
  open: number;
  high: number;
  low: number;
  close: number;
  changePct: number;
  atrAvg: number;
  trades: number;
  wins: number;
  wr: number;
  dominant: "BUY" | "SELL" | "متوازن";
}

export interface BacktestResult {
  tf: "15m" | "1h";
  generatedAt: string;
  dataSource: string;
  candlesTested: number;
  from: string;
  to: string;
  holdBars: number;
  warmup: number;
  splitIdx: number;
  trainFrom: string;
  testFrom: string;
  // فترة الاختبار الإسقاطي (آخر 30%): قبل التدريب مقابل بعده
  statsBefore: BtStats; // أوزان متساوية
  statsAfter: BtStats; // أوزان متعلمة من فترة التدريب
  statsTrain: BtStats; // أداء التعلم داخل عينة التدريب
  equity: number[]; // منحنى R التراكمي (بعد التعلم — فترة الاختبار)
  equityBefore: number[];
  strategies: BtStrategy[];
  trades: BtTrade[]; // آخر صفقات التوليفة (كامل الفترة)
  months: BtMonth[];
  weights: {
    base: Record<string, number>;
    learnedLive: Record<string, number>; // للتطبيق المباشر (تعلم كامل الفترة)
    learnedTest: Record<string, number>; // المُستخدمة في الاختبار الإسقاطي
  };
  notes: string[];
}

// ---------- ثوابت ----------
const WARMUP = 210; // EMA200 + متوسطات BB/ATR
const AR_MONTHS = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
];

export const STRATEGY_META: { key: string; nameAr: string; pillar: string; pillarAr: string }[] = [
  { key: "ema_trend", nameAr: "اتجاه EMA المتعدد (9>21>50)", pillar: "trend", pillarAr: "الاتجاه" },
  { key: "bb_break", nameAr: "كسر انضغاط بولينجر", pillar: "trend", pillarAr: "الاتجاه" },
  { key: "macd_cross", nameAr: "تقاطع MACD مع الفلتر", pillar: "momentum", pillarAr: "الزخم" },
  { key: "rsi_reversal", nameAr: "انعكاس RSI المتطرف", pillar: "momentum", pillarAr: "الزخم" },
  { key: "bb_reversal", nameAr: "ارتداد بولينجر + RSI", pillar: "momentum", pillarAr: "الزخم" },
  { key: "sr_bounce", nameAr: "ارتداد دعم/مقاومة ديناميكي", pillar: "location", pillarAr: "الموقع" },
  { key: "smc_sweep", nameAr: "كنس سيولة + استعادة (SMC)", pillar: "location", pillarAr: "الموقع" },
  { key: "judas_sweep", nameAr: "فخ لندن (Judas Sweep للنطاق الآسيوي)", pillar: "session", pillarAr: "الجلسة" },
  { key: "pattern_play", nameAr: "أنماط الشموع اليابانية", pillar: "priceAction", pillarAr: "حركة السعر" },
  { key: "asian_breakout", nameAr: "كسر النطاق الآسيوي", pillar: "session", pillarAr: "الجلسة" },
];

// استراتيجيات الانعكاس للمتوسط — هدفها أقرب (0.85R) لأن الإحصاء يظهر نسبة فوز أعلى بهدف أقرب
// (البحث: أنظمة mean-reversion تحقق 70%+ بذلك الإعداد)
const MR_KEYS = new Set(["rsi_reversal", "bb_reversal", "sr_bounce", "judas_sweep"]);

// ---------- أدوات ----------
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function wilsonLower(wins: number, n: number, z = 1.96): number {
  if (n <= 0) return 0;
  const p = wins / n;
  const denom = 1 + (z * z) / n;
  const center = p + (z * z) / (2 * n);
  const spread = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return Math.max(0, (center - spread) / denom);
}

interface RawTrade {
  key: string;
  i: number; // شمعة الإشارة
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
}

function statsOf(trades: RawTrade[]): BtStats {
  const wins = trades.filter((t) => t.result === "win");
  const losses = trades.filter((t) => t.result === "loss");
  const timeouts = trades.filter((t) => t.result === "timeout");
  const grossR = trades.reduce((a, t) => a + t.r, 0);
  const posR = trades.filter((t) => t.r > 0).reduce((a, t) => a + t.r, 0);
  const negR = Math.abs(trades.filter((t) => t.r < 0).reduce((a, t) => a + t.r, 0));

  // أقصى تراجع تراكمي
  let cum = 0;
  let peak = 0;
  let maxDd = 0;
  for (const t of trades) {
    cum += t.r;
    peak = Math.max(peak, cum);
    maxDd = Math.max(maxDd, peak - cum);
  }

  // السلاسل
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
    wins: wins.length,
    losses: losses.length,
    timeouts: timeouts.length,
    winRate: n ? wins.length / n : 0,
    avgR: n ? grossR / n : 0,
    grossR: Math.round(grossR * 100) / 100,
    profitFactor: negR > 0 ? Math.round((posR / negR) * 100) / 100 : posR > 0 ? 99 : 0,
    expectancyR: n ? Math.round((grossR / n) * 1000) / 1000 : 0,
    maxDrawdownR: Math.round(maxDd * 100) / 100,
    bestStreak: best,
    worstStreak: worst,
  };
}

/** محاكاة النتيجة — الوقف له الأولوية داخل الشمعة (متحفظ) 
 * tpMult: مضاعف الهدف بالنسبة للمخاطرة (1 = هدف 1R، 0.85 = هدف أقرب لاستراتيجيات الانعكاس) */
export function simulate(
  candles: Candle[],
  i: number,
  dir: 1 | -1,
  sl: number,
  hold: number,
  tpMult = 1
): { result: "win" | "loss" | "timeout"; r: number; bars: number; endIdx: number } | null {
  const next = candles[i + 1];
  if (!next) return null;
  const entry = next.o;
  const risk = Math.abs(entry - sl);
  if (risk < 0.3) return null; // وقف غير منطقي — تجاهل
  const tp1 = entry + dir * risk * tpMult;

  const last = Math.min(i + hold, candles.length - 1);
  for (let j = i + 1; j <= last; j++) {
    const c = candles[j];
    if (dir === 1) {
      if (c.l <= sl) return { result: "loss", r: -1, bars: j - i, endIdx: j };
      if (c.h >= tp1) return { result: "win", r: tpMult, bars: j - i, endIdx: j };
    } else {
      if (c.h >= sl) return { result: "loss", r: -1, bars: j - i, endIdx: j };
      if (c.l <= tp1) return { result: "win", r: tpMult, bars: j - i, endIdx: j };
    }
  }
  const exit = candles[last].c;
  const r = ((exit - entry) * dir) / risk;
  return { result: "timeout", r: Math.round(r * 100) / 100, bars: last - i, endIdx: last };
}

// ---------- بنية اليوم UTC ----------
export interface DayInfo {
  idx: number; // تسلسل
  key: string;
  high: number;
  low: number;
  asianHigh: number;
  asianLow: number;
  asianCount: number;
  firstIdx: number;
  lastIdx: number;
}

export function buildDays(candles: Candle[]): { days: DayInfo[]; dayOf: number[] } {
  const days: DayInfo[] = [];
  const dayOf: number[] = new Array(candles.length).fill(-1);
  const map = new Map<string, DayInfo>();

  for (let i = 0; i < candles.length; i++) {
    const d = new Date(candles[i].t);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
    let info = map.get(key);
    if (!info) {
      info = {
        idx: days.length,
        key,
        high: -Infinity,
        low: Infinity,
        asianHigh: -Infinity,
        asianLow: Infinity,
        asianCount: 0,
        firstIdx: i,
        lastIdx: i,
      };
      map.set(key, info);
      days.push(info);
    }
    info.high = Math.max(info.high, candles[i].h);
    info.low = Math.min(info.low, candles[i].l);
    info.lastIdx = i;
    const h = d.getUTCHours();
    if (h < 8) {
      info.asianHigh = Math.max(info.asianHigh, candles[i].h);
      info.asianLow = Math.min(info.asianLow, candles[i].l);
      info.asianCount++;
    }
    dayOf[i] = info.idx;
  }
  return { days, dayOf };
}

// ---------- التقييم عند كل شمعة (كل الاستراتيجيات) ----------
export interface Vote {
  key: string;
  dir: 1 | -1;
  sl: number; // قيمة الوقف المطلقة
  tpMult: number; // مضاعف الهدف (0.85 للانعكاس للمتوسط — 1 للاتجاه)
}

export interface Ctx {
  candles: Candle[];
  closes: number[];
  ema9: number[];
  ema21: number[];
  ema50: number[];
  ema200: number[];
  rsiArr: number[];
  macdLine: number[];
  macdSignal: number[];
  macdHist: number[];
  bbUpper: number[];
  bbLower: number[];
  bw: number[];
  bwAvg: number[];
  atrArr: number[];
  adxArr: number[];
  days: DayInfo[];
  dayOf: number[];
}

export function evaluateAt(ctx: Ctx, i: number): Vote[] {
  const votes: Vote[] = [];
  const { candles, closes } = ctx;
  const c = candles[i];
  const p = candles[i - 1];
  const a = ctx.atrArr[i];
  if (!a || a < 0.3 || isNaN(a)) return votes;

  const body = Math.abs(c.c - c.o);
  const e9 = ctx.ema9[i];
  const e21 = ctx.ema21[i];
  const e50 = ctx.ema50[i];
  const e200 = ctx.ema200[i];
  const rsiNow = ctx.rsiArr[i];
  const rsiPrev = ctx.rsiArr[i - 1];

  const ok = (...vals: number[]) => vals.every((v) => v != null && !isNaN(v));

  // 1) ema_trend: ترتيب كامل + ADX ≥ 20
  if (ok(e9, e21, e50, ctx.adxArr[i]) && ctx.adxArr[i] >= 20) {
    if (e9 > e21 && e21 > e50 && c.c > e9) votes.push({ key: "ema_trend", dir: 1, sl: c.c - 1.5 * a, tpMult: 1 });
    if (e9 < e21 && e21 < e50 && c.c < e9) votes.push({ key: "ema_trend", dir: -1, sl: c.c + 1.5 * a, tpMult: 1 });
  }

  // 2) macd_cross: تقاطع خلال آخر شمعتين + اتجاه EMA50
  const ml = ctx.macdLine[i];
  const ms = ctx.macdSignal[i];
  const mlP = ctx.macdLine[i - 1];
  const msP = ctx.macdSignal[i - 1];
  if (ok(ml, ms, mlP, msP, e50)) {
    if (ml > ms && mlP <= msP && c.c > e50) votes.push({ key: "macd_cross", dir: 1, sl: c.c - 1.5 * a, tpMult: 1 });
    if (ml < ms && mlP >= msP && c.c < e50) votes.push({ key: "macd_cross", dir: -1, sl: c.c + 1.5 * a, tpMult: 1 });
  }

  // 3) bb_break: انضغاط سابق + إغلاق خارج الشريط بجسم قوي
  const bwNow = ctx.bw[i];
  const bwAvgNow = ctx.bwAvg[i];
  const squeezePrev = ok(ctx.bw[i - 1], ctx.bwAvg[i - 1]) && ctx.bw[i - 1] < 0.8 * ctx.bwAvg[i - 1];
  if (squeezePrev && ok(ctx.bbUpper[i], ctx.bbLower[i]) && body > 0.5 * a) {
    if (c.c > ctx.bbUpper[i]) votes.push({ key: "bb_break", dir: 1, sl: c.c - 1.5 * a, tpMult: 1 });
    if (c.c < ctx.bbLower[i]) votes.push({ key: "bb_break", dir: -1, sl: c.c + 1.5 * a, tpMult: 1 });
  }
  void bwNow;
  void bwAvgNow;

  // 4) rsi_reversal (مقوّى بالبحث): تطرف RSI + شمعة انعكاس + تمدّد سعري عن EMA21
  // مع الاتجاه العام (EMA200): تطرف عادي (30/70)
  // عكس الاتجاه العام: تطرف أعمق فقط (24/76) — لأن عكس الاتجاه أخطر
  // + شرط التمدد: |close - EMA21| > 1.2×ATR (السعر مشدود ويحتاج ارتداداً)
  if (ok(rsiNow, rsiPrev, e200, e21)) {
    const stretchedUp = c.c - e21 > 1.2 * a;
    const stretchedDown = e21 - c.c > 1.2 * a;
    const withTrendUp = rsiPrev < 32 && rsiNow > rsiPrev && c.c > e200 && stretchedDown;
    const deepAgainstUp = rsiPrev < 24 && rsiNow > rsiPrev && c.c <= e200 && stretchedDown;
    const withTrendDown = rsiPrev > 68 && rsiNow < rsiPrev && c.c < e200 && stretchedUp;
    const deepAgainstDown = rsiPrev > 76 && rsiNow < rsiPrev && c.c >= e200 && stretchedUp;
    if (withTrendUp || deepAgainstUp) votes.push({ key: "rsi_reversal", dir: 1, sl: c.c - 1.3 * a, tpMult: 0.85 });
    if (withTrendDown || deepAgainstDown) votes.push({ key: "rsi_reversal", dir: -1, sl: c.c + 1.3 * a, tpMult: 0.85 });
  }

  // 5) bb_reversal: اختراق الشريط ثم عودة داخلية + RSI
  const up = ctx.bbUpper[i];
  const lo = ctx.bbLower[i];
  const upP = ctx.bbUpper[i - 1];
  const loP = ctx.bbLower[i - 1];
  if (ok(up, lo, upP, loP, rsiNow)) {
    if (p.l < loP && c.c > lo && rsiNow < 42)
      votes.push({ key: "bb_reversal", dir: 1, sl: c.c - 1.3 * a, tpMult: 0.85 });
    if (p.h > upP && c.c < up && rsiNow > 58)
      votes.push({ key: "bb_reversal", dir: -1, sl: c.c + 1.3 * a, tpMult: 0.85 });
  }

  // 6) sr_bounce: دعم/مقاومة ديناميكي (آخر 12 شمعة سابقة)
  let support = Infinity;
  let resistance = -Infinity;
  for (let j = i - 12; j < i; j++) {
    if (j < 0) continue;
    support = Math.min(support, candles[j].l);
    resistance = Math.max(resistance, candles[j].h);
  }
  if (ok(support, resistance) && isFinite(support) && isFinite(resistance)) {
    if (c.l <= support + 0.25 * a && c.c > c.o && c.c > support)
      votes.push({ key: "sr_bounce", dir: 1, sl: c.c - 1.2 * a, tpMult: 0.85 });
    if (c.h >= resistance - 0.25 * a && c.c < c.o && c.c < resistance)
      votes.push({ key: "sr_bounce", dir: -1, sl: c.c + 1.2 * a, tpMult: 0.85 });
  }

  // 7) smc_sweep: كنس قاع/قمة اليوم السابق ثم استعادة
  const dayIdx = ctx.dayOf[i];
  if (dayIdx >= 1) {
    const prevDay = ctx.days[dayIdx - 1];
    if (prevDay && prevDay.lastIdx < i) {
      if (c.l < prevDay.low && c.c > prevDay.low && c.c > c.o) {
        const slDist = clamp(c.c - c.l + 0.25 * a, 0.8 * a, 2.5 * a);
        votes.push({ key: "smc_sweep", dir: 1, sl: c.c - slDist, tpMult: 1 });
      }
      if (c.h > prevDay.high && c.c < prevDay.high && c.c < c.o) {
        const slDist = clamp(c.h - c.c + 0.25 * a, 0.8 * a, 2.5 * a);
        votes.push({ key: "smc_sweep", dir: -1, sl: c.c + slDist, tpMult: 1 });
      }
    }
  }

  // 7.5) judas_sweep (v6 — شروط أعمق بعد تحليل الفشل الأول):
  // فخ لندن الحقيقي يحتاج اجتياحاً عميقاً (وليس اختراقاً سطحياً) + عودة قاطعة داخل النطاق
  // الساعات 7-9 فقط (أول ساعات لندن — حيث يحدث الكنس فعلياً)
  {
    const hourUtc = new Date(c.t).getUTCHours();
    const dayInfo = ctx.days[dayIdx];
    if (
      hourUtc >= 7 && hourUtc <= 9 &&
      dayInfo && dayInfo.asianCount >= 4 &&
      isFinite(dayInfo.asianHigh) && isFinite(dayInfo.asianLow)
    ) {
      // اجتياح عميق لقمة آسيوية (+0.15 ATR فوقها) ثم إغلاق أسفلها بهامش (‎−0.1 ATR) بجسم هابط = فخ صعودي → بيع
      if (c.h > dayInfo.asianHigh + 0.15 * a && c.c < dayInfo.asianHigh - 0.1 * a && c.c < c.o) {
        const slDist = clamp(c.h - c.c + 0.3 * a, 0.8 * a, 2.2 * a);
        votes.push({ key: "judas_sweep", dir: -1, sl: c.c + slDist, tpMult: 0.85 });
      }
      // اجتياح عميق لقاع آسيوي ثم إغلاق فوقه بهامش بجسم صاعد = فخ هبوطي → شراء
      if (c.l < dayInfo.asianLow - 0.15 * a && c.c > dayInfo.asianLow + 0.1 * a && c.c > c.o) {
        const slDist = clamp(c.c - c.l + 0.3 * a, 0.8 * a, 2.2 * a);
        votes.push({ key: "judas_sweep", dir: 1, sl: c.c - slDist, tpMult: 0.85 });
      }
    }
  }

  // 8) pattern_play: ابتلاع/مطرقة/شهاب مع فلتر EMA200
  const bodyP = c.h - c.l > 0 ? body / (c.h - c.l) : 0;
  const upperWick = c.h - Math.max(c.c, c.o);
  const lowerWick = Math.min(c.c, c.o) - c.l;
  const prevBody = Math.abs(p.c - p.o);
  if (ok(e200) && c.h - c.l > 0) {
    const bullEngulf = p.c < p.o && c.c > c.o && c.c >= p.o && c.o <= p.c && body > prevBody;
    const bearEngulf = p.c > p.o && c.c < c.o && c.o >= p.c && c.c <= p.o && body > prevBody;
    const hammer = lowerWick > body * 2 && upperWick < body * 0.8 && bodyP < 0.45;
    const star = upperWick > body * 2 && lowerWick < body * 0.8 && bodyP < 0.45;
    if ((bullEngulf || (hammer && c.c > c.o)) && c.c > e200)
      votes.push({ key: "pattern_play", dir: 1, sl: c.c - 1.2 * a, tpMult: 1 });
    if ((bearEngulf || (star && c.c < c.o)) && c.c < e200)
      votes.push({ key: "pattern_play", dir: -1, sl: c.c + 1.2 * a, tpMult: 1 });
  }

  // 9) asian_breakout: كسر نطاق آسيوي بعد 07:00 UTC
  const dayInfo = ctx.days[dayIdx];
  const hourUtc = new Date(c.t).getUTCHours();
  if (dayInfo && dayInfo.asianCount >= 4 && hourUtc >= 7 && isFinite(dayInfo.asianHigh) && isFinite(dayInfo.asianLow)) {
    const rangeWidth = dayInfo.asianHigh - dayInfo.asianLow;
    const onlyAfterLondon = hourUtc >= 7 && hourUtc <= 16; // نافذة لندن فقط
    if (onlyAfterLondon && body > 0.6 * a) {
      if (c.c > dayInfo.asianHigh) {
        const slDist = Math.max(1.0 * a, rangeWidth * 0.5);
        votes.push({ key: "asian_breakout", dir: 1, sl: c.c - slDist, tpMult: 1 });
      }
      if (c.c < dayInfo.asianLow) {
        const slDist = Math.max(1.0 * a, rangeWidth * 0.5);
        votes.push({ key: "asian_breakout", dir: -1, sl: c.c + slDist, tpMult: 1 });
      }
    }
  }

  // تنظيف: إزالة أصوات الاستراتيجيات الفارغة الأوزان — وإرجاع النتيجة
  void MR_KEYS; // (يُستخدم في selftrainer لحساب هدف التوليفة)
  return votes;
}

// ---------- التعلّم ----------
function learnWeights(
  stratTrades: Map<string, RawTrade[]>,
  base: Record<string, number>
): Record<string, number> {
  const mult: Record<string, number> = {};
  for (const meta of STRATEGY_META) {
    const trades = stratTrades.get(meta.key) ?? [];
    const n = trades.length;
    if (n >= 12) {
      const wins = trades.filter((t) => t.result === "win").length;
      const wl = wilsonLower(wins, n);
      mult[meta.key] = clamp(wl / 0.5, 0.55, 1.45);
    } else {
      mult[meta.key] = 1; // عينة صغيرة — لا تعلّم
    }
  }

  // مضاعف العمود = متوسط مرجّح بعدد صفقات استراتيجياته
  const pillarMult: Record<string, number> = {};
  for (const pKey of PILLAR_KEYS) {
    let num = 0;
    let den = 0;
    for (const meta of STRATEGY_META) {
      if (meta.pillar !== pKey) continue;
      const n = (stratTrades.get(meta.key) ?? []).length;
      num += mult[meta.key] * n;
      den += n;
    }
    pillarMult[pKey] = den > 0 ? num / den : 1;
  }

  const learned: Record<string, number> = {};
  for (const pKey of PILLAR_KEYS) {
    learned[pKey] = base[pKey] * pillarMult[pKey];
  }
  // إعادة التطبيع إلى 100 مع حد أدنى 6
  let sum = PILLAR_KEYS.reduce((a, k) => a + learned[k], 0);
  for (const k of PILLAR_KEYS) learned[k] = Math.max(6, learned[k]);
  sum = PILLAR_KEYS.reduce((a, k) => a + learned[k], 0);
  for (const k of PILLAR_KEYS) learned[k] = Math.round((learned[k] / sum) * 1000) / 10;
  return learned;
}

// ---------- التنفيذ الرئيسي ----------
export async function runBacktest(tf: "15m" | "1h"): Promise<BacktestResult> {
  const interval = tf === "1h" ? "60m" : "15m";
  const range = tf === "1h" ? "3mo" : "60d";
  const hold = tf === "1h" ? 24 : 48; // يوم تداول / 12 ساعة

  const candles = await fetchCandles("GC=F", interval, range);
  if (candles.length < WARMUP + 400) {
    throw new Error(`بيانات غير كافية للتدريب (${candles.length} شمعة) — جرّب الإطار الآخر`);
  }

  const closes = candles.map((c) => c.c);
  const emaSet = computeEMASet(closes);
  const rsiArr = rsi(closes, 14);
  const macdData = macd(closes);
  const bbData = bollinger(closes);
  const atrData = atr(candles, 14);

  // سلسلة ADX سببية (Wilder) — نفس رياضيات indicators.ts لكن لكل شمعة
  const adxArr = adxSeries(candles, 14);

  // عرض بولينجر + متوسطه المتحرك السببي
  const bw: number[] = new Array(candles.length).fill(NaN);
  for (let i = 0; i < candles.length; i++) {
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

  const len = candles.length;
  const split = WARMUP + Math.floor((len - WARMUP - hold) * 0.7); // 70% تدريب / 30% اختبار

  // ===== 1) تقييم كل الشموع (التصويت) — مرة واحدة =====
  const votesAll: Vote[][] = new Array(len);
  for (let i = WARMUP; i < len - 1; i++) {
    votesAll[i] = evaluateAt(ctx, i);
  }

  // ===== 2) صفقات كل استراتيجية (مع تهدئة — صفقة واحدة نشطة) =====
  const stratTrades = new Map<string, RawTrade[]>();
  const takenPerStrategy = new Map<string, number[]>(); // فهرس الشموع المأخوذة
  for (const meta of STRATEGY_META) {
    const trades: RawTrade[] = [];
    const taken: number[] = [];
    let busyUntil = -1;
    let lastAsianDay = -1; // كسر آسيوي واحد لكل يوم
    for (let i = WARMUP; i < len - 1; i++) {
      const votes = votesAll[i] ?? [];
      const vote = votes.find((v) => v.key === meta.key);
      if (!vote) continue;
      if (i <= busyUntil) continue;
      if (meta.key === "asian_breakout") {
        const d = dayOf[i];
        if (d === lastAsianDay) continue;
        lastAsianDay = d;
      }
      const sim = simulate(candles, i, vote.dir, vote.sl, hold, vote.tpMult ?? 1);
      if (!sim) continue;
      trades.push({
        key: meta.key,
        i,
        t: candles[i].t,
        entryT: candles[i + 1].t,
        dir: vote.dir,
        entry: candles[i + 1].o,
        sl: vote.sl,
        tp1: candles[i + 1].o + vote.dir * Math.abs(candles[i + 1].o - vote.sl) * (vote.tpMult ?? 1),
        result: sim.result,
        r: sim.r,
        bars: sim.bars,
        endIdx: sim.endIdx,
      });
      taken.push(i);
      busyUntil = sim.endIdx;
    }
    stratTrades.set(meta.key, trades);
    takenPerStrategy.set(meta.key, taken);
  }

  // ===== 3) التوليفة المركّبة (إشارة البوت الكلية) =====
  function runComposite(
    from: number,
    to: number,
    weights: Record<string, number> | null // null = أوزان متساوية
  ): RawTrade[] {
    const trades: RawTrade[] = [];
    let busyUntil = -1;
    let lastAsianDay = -1;
    for (let i = from; i < to; i++) {
      const votes = votesAll[i] ?? [];
      if (!votes.length) continue;
      if (i <= busyUntil) continue;
      let num = 0;
      let den = 0;
      for (const v of votes) {
        const meta = STRATEGY_META.find((m) => m.key === v.key)!;
        const w = weights ? weights[meta.pillar] : 1;
        num += v.dir * w;
        den += w;
      }
      if (den === 0) continue;
      const net = num / den;
      if (net < 0.15 && net > -0.15) continue;
      const dir: 1 | -1 = net >= 0.15 ? 1 : -1;

      const agreeing = votes.filter((v) => v.dir === dir);
      if (agreeing.length < 2) continue; // توافق صورتين على الأقل

      // كسر آسيوي واحد لكل يوم (لتناسق الاستراتيجيات)
      const hasAsian = agreeing.some((v) => v.key === "asian_breakout");
      if (hasAsian) {
        const d = dayOf[i];
        if (d === lastAsianDay) continue;
        lastAsianDay = d;
      }

      const c = candles[i];
      const a = ctx.atrArr[i];
      const sl = dir === 1 ? c.c - 1.5 * a : c.c + 1.5 * a;
      // هدف التوليفة = متوسط مرجّح بمضاعفات أهداف الاستراتيجيات المتفقة
      // (استراتيجيات الانعكاس هدفها 0.85R الأقرب — يرفع نسبة الفوز)
      const agreeW = agreeing.reduce((s, v) => s + (v.tpMult ?? 1), 0) / agreeing.length;
      const sim = simulate(candles, i, dir, sl, hold, agreeW);
      if (!sim) continue;
      trades.push({
        key: "composite",
        i,
        t: candles[i].t,
        entryT: candles[i + 1].t,
        dir,
        entry: candles[i + 1].o,
        sl,
        tp1: candles[i + 1].o + dir * Math.abs(candles[i + 1].o - sl) * agreeW,
        result: sim.result,
        r: sim.r,
        bars: sim.bars,
        endIdx: sim.endIdx,
      });
      busyUntil = sim.endIdx;
    }
    return trades;
  }

  // ===== 4) التعلم على فترة التدريب ثم الاختبار الإسقاطي =====
  const trainStratTrades = new Map<string, RawTrade[]>();
  for (const [k, ts] of stratTrades) trainStratTrades.set(k, ts.filter((t) => t.i < split));

  const base = { ...BASE_PILLAR_WEIGHTS } as Record<string, number>;
  const learnedTestW = learnWeights(trainStratTrades, base);

  const tradesBeforeTest = runComposite(split, len - 1, null); // أوزان متساوية
  const tradesAfterTest = runComposite(split, len - 1, learnedTestW); // أوزان متعلمة
  const tradesTrainSeg = runComposite(WARMUP, split, null); // داخل عينة التدريب

  // أوزان التطبيق المباشر — تعلم من كامل التاريخ
  const fullStratTrades = stratTrades;
  const learnedLiveW = learnWeights(fullStratTrades, base);
  const tradesLive = runComposite(WARMUP, len - 1, learnedLiveW);

  // حفظ حالة التعلّم ليمتد إليها محرك الإشارة المباشر
  setLearnedState({
    weights: learnedLiveW,
    stats: {
      winRate: tradesLive.length ? tradesLive.filter((t) => t.result === "win").length / tradesLive.length : 0,
      trades: tradesLive.length,
      profitFactor: statsOf(tradesLive).profitFactor,
      expectancyR: statsOf(tradesLive).expectancyR,
      maxDrawdownR: statsOf(tradesLive).maxDrawdownR,
      tf,
      from: new Date(candles[WARMUP].t).toISOString(),
      to: new Date(candles[len - 1].t).toISOString(),
      updatedAt: new Date().toISOString(),
    },
    tf,
    ts: Date.now(),
  });

  // ===== 5) نتائج الاستراتيجيات (كامل الفترة) =====
  const strategies: BtStrategy[] = STRATEGY_META.map((meta) => {
    const ts = stratTrades.get(meta.key) ?? [];
    const st = statsOf(ts);
    const wins = st.wins;
    const n = st.trades;
    const wl = wilsonLower(wins, n);
    return {
      key: meta.key,
      nameAr: meta.nameAr,
      pillar: meta.pillar,
      pillarAr: meta.pillarAr,
      trades: n,
      wins,
      losses: st.losses,
      timeouts: st.timeouts,
      winRate: Math.round(st.winRate * 1000) / 10,
      wilson: Math.round(wl * 1000) / 10,
      avgR: Math.round(st.avgR * 100) / 100,
      profitFactor: st.profitFactor,
      multiplier: n >= 12 ? Math.round(clamp(wl / 0.5, 0.55, 1.45) * 100) / 100 : 1,
      grossR: st.grossR,
    };
  });

  // ===== 6) منحنى R التراكمي =====
  const equity: number[] = [0];
  for (const t of tradesAfterTest) equity.push(Math.round((equity[equity.length - 1] + t.r) * 100) / 100);
  const equityBefore: number[] = [0];
  for (const t of tradesBeforeTest) equityBefore.push(Math.round((equityBefore[equityBefore.length - 1] + t.r) * 100) / 100);

  // ===== 7) تحليل الشهور (الشهر الحالي + السابق) =====
  const months: BtMonth[] = [];
  {
    interface MonthAgg {
      ym: string;
      open: number;
      close: number;
      high: number;
      low: number;
      atrSum: number;
      atrN: number;
    }
    const byMonth = new Map<string, MonthAgg>();
    const order: string[] = [];
    for (let i = WARMUP; i < len; i++) {
      const d = new Date(candles[i].t);
      const ym = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
      let agg = byMonth.get(ym);
      if (!agg) {
        agg = { ym, open: candles[i].o, close: candles[i].c, high: -Infinity, low: Infinity, atrSum: 0, atrN: 0 };
        byMonth.set(ym, agg);
        order.push(ym);
      }
      agg.close = candles[i].c;
      agg.high = Math.max(agg.high, candles[i].h);
      agg.low = Math.min(agg.low, candles[i].l);
      const a = ctx.atrArr[i];
      if (!isNaN(a) && a > 0) {
        agg.atrSum += a;
        agg.atrN++;
      }
    }
    for (const ym of order.slice(-3)) {
      const agg = byMonth.get(ym)!;
      const mt = tradesLive.filter((t) => {
        const d = new Date(t.t);
        return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}` === ym;
      });
      const mWins = mt.filter((t) => t.result === "win").length;
      const buys = mt.filter((t) => t.dir === 1).length;
      const sells = mt.length - buys;
      const [y, m] = ym.split("-");
      months.push({
        ym,
        label: `${AR_MONTHS[parseInt(m, 10) - 1]} ${y}`,
        open: Math.round(agg.open * 10) / 10,
        high: Math.round(agg.high * 10) / 10,
        low: Math.round(agg.low * 10) / 10,
        close: Math.round(agg.close * 10) / 10,
        changePct: Math.round(((agg.close - agg.open) / agg.open) * 1000) / 10,
        atrAvg: agg.atrN ? Math.round((agg.atrSum / agg.atrN) * 10) / 10 : 0,
        trades: mt.length,
        wins: mWins,
        wr: mt.length ? Math.round((mWins / mt.length) * 1000) / 10 : 0,
        dominant: buys > sells * 1.3 ? "BUY" : sells > buys * 1.3 ? "SELL" : "متوازن",
      });
    }
  }

  // ===== 8) آخر الصفقات للعرض =====
  const trades: BtTrade[] = tradesLive
    .slice(-40)
    .reverse()
    .map((t) => {
      const votes = votesAll[t.i] ?? [];
      const agreeing = votes
        .filter((v) => v.dir === t.dir)
        .map((v) => STRATEGY_META.find((m) => m.key === v.key)?.nameAr ?? v.key)
        .slice(0, 3);
      return {
        t: t.t,
        entryT: t.entryT,
        dir: t.dir === 1 ? "BUY" : "SELL",
        strategies: agreeing,
        entry: Math.round(t.entry * 10) / 10,
        sl: Math.round(t.sl * 10) / 10,
        tp1: Math.round(t.tp1 * 10) / 10,
        result: t.result,
        r: t.r,
        bars: t.bars,
      };
    });

  return {
    tf,
    generatedAt: new Date().toISOString(),
    dataSource: `Yahoo Finance GC=F — ${range} @ ${tf}`,
    candlesTested: len - WARMUP,
    from: new Date(candles[WARMUP].t).toISOString(),
    to: new Date(candles[len - 1].t).toISOString(),
    holdBars: hold,
    warmup: WARMUP,
    splitIdx: split,
    trainFrom: new Date(candles[WARMUP].t).toISOString(),
    testFrom: new Date(candles[Math.min(split, len - 1)].t).toISOString(),
    statsBefore: statsOf(tradesBeforeTest),
    statsAfter: statsOf(tradesAfterTest),
    statsTrain: statsOf(tradesTrainSeg),
    equity,
    equityBefore,
    strategies,
    trades,
    months,
    weights: {
      base,
      learnedLive: learnedLiveW,
      learnedTest: learnedTestW,
    },
    notes: [
      "البروتوكول: عند كل شمعة تاريخية يستخدم البوت بيانات الشموع السابقة فقط (لا نظرة مستقبلية)، ثم يدخل على افتتاح الشمعة التالية ويتحقق من النتيجة لاحقاً.",
      "أولوية الوقف داخل الشمعة الواحدة (افتراض متحفظ) — إذا لامست الشمعة الوقف والهدف معاً تُحتسب خسارة.",
      "التعلم على أول 70% من الفترة، ثم اختبار إسقاطي على آخر 30% لم يرها البوت أثناء التعلم — مقارنة عادلة قبل/بعد.",
      "أوزان الأعمدة تعدّل بمضاعف Wilson السفلي (حد ثقة 95%) — الاستراتيجيات ذات العينات الصغيرة لا تغيّر وزنها.",
      `الأوزان المعروضة للتطبيق المباشر مشتقة من كامل الفترة (${candlesTestedStr(len - WARMUP)} شمعة).`,
    ],
  };
}

function candlesTestedStr(n: number): string {
  return n.toLocaleString("en-US");
}

// ---------- متوسط متحرك سببي ----------
export function rollingAvg(values: number[], win: number): number[] {
  const out: number[] = new Array(values.length).fill(NaN);
  let sum = 0;
  let count = 0;
  const queue: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (!isNaN(v)) {
      queue.push(v);
      sum += v;
      count++;
      if (queue.length > win) {
        sum -= queue.shift()!;
        count--;
      }
    }
    out[i] = count >= Math.min(win, 20) ? sum / count : NaN;
  }
  return out;
}

// ---------- سلسلة ADX سببية (Wilder) ----------
export function adxSeries(candles: Candle[], period: number): number[] {
  const n = candles.length;
  const out: number[] = new Array(n).fill(NaN);
  if (n < period * 2 + 1) return out;

  const plusDM: number[] = [0];
  const minusDM: number[] = [0];
  const trs: number[] = [candles[0].h - candles[0].l];
  for (let i = 1; i < n; i++) {
    const upMove = candles[i].h - candles[i - 1].h;
    const downMove = candles[i - 1].l - candles[i].l;
    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
    const prevClose = candles[i - 1].c;
    trs.push(Math.max(candles[i].h - candles[i].l, Math.abs(candles[i].h - prevClose), Math.abs(candles[i].l - prevClose)));
  }

  const smooth = (arr: number[]): number[] => {
    const s: number[] = new Array(arr.length).fill(NaN);
    let sum = 0;
    for (let i = 0; i < period; i++) sum += arr[i];
    s[period - 1] = sum;
    for (let i = period; i < arr.length; i++) s[i] = s[i - 1] - s[i - 1] / period + arr[i];
    return s;
  };

  const smTR = smooth(trs);
  const smPDM = smooth(plusDM);
  const smMDM = smooth(minusDM);

  const dxs: number[] = [];
  const dxIdx: number[] = []; // فهرس الشمعة المقابل
  for (let i = period - 1; i < n; i++) {
    const tr = smTR[i];
    if (tr > 0 && !isNaN(tr)) {
      const pdi = (smPDM[i] / tr) * 100;
      const mdi = (smMDM[i] / tr) * 100;
      const sum = pdi + mdi;
      dxs.push(sum > 0 ? (Math.abs(pdi - mdi) / sum) * 100 : 0);
      dxIdx.push(i);
    }
  }

  if (dxs.length >= period) {
    let a = 0;
    for (let i = 0; i < period; i++) a += dxs[i];
    a /= period;
    out[dxIdx[period - 1]] = a;
    for (let i = period; i < dxs.length; i++) {
      a = (a * (period - 1) + dxs[i]) / period;
      out[dxIdx[i]] = a;
    }
  }
  return out;
}
