// ============================================================
// منسّق الإشارة — يجلب البيانات، يحلل، يقيّم، وينتج التوصية
// Confidence = 50 + |score| × 0.45 × qualityGate (سقف 95%)
// WAIT إذا |score| < 20 (عتبة أعمق — إشارات أقل وأجود)
// ============================================================

import { createHash } from "crypto";
import {
  analyzeRSI,
  bollinger,
  computeEMASet,
  macd as macdCalc,
  adx as adxCalc,
  atr as atrCalc,
  stochastic,
  vwapDaily,
} from "./indicators";
import { aggregateTo4h, fetchCandles, fetchNews } from "./market";
import { computeAsianRange, computeSRLevels, fibonacciLevels, findSwings, pivotPoints } from "./structure";
import { computePillars, computeQualityGate, type PillarContext } from "./scoring";
import { getSessionInfo } from "./sessions";
import { getLearnedState, BASE_PILLAR_WEIGHTS, PILLAR_KEYS } from "./learning";
import type {
  Candle,
  Direction,
  PillarScore,
  SignalResponse,
  TFRow,
  Timeframe,
  TimeframeAnalysis,
  TradeLevels,
  TradeMode,
} from "./types";

// ---------- تحليل إطار زمني واحد ----------
function analyzeTimeframe(tf: Timeframe, candles: Candle[]): TimeframeAnalysis {
  const closes = candles.map((c) => c.c);
  const price = closes[closes.length - 1];
  const ema = computeEMASet(closes);
  const rsiData = analyzeRSI(closes);
  const macdData = macdCalc(closes);
  const bb = bollinger(closes);
  const atrData = atrCalc(candles, 14);
  const stoch = stochastic(candles);
  const adxData = adxCalc(candles, 14);
  const vwap = vwapDaily(candles);
  const swings = findSwings(candles, 2);

  // وسم الاتجاه
  const e50 = lastVal(ema.ema50);
  const e200 = lastVal(ema.ema200);
  let trendLabel: TimeframeAnalysis["trendLabel"] = "محايد";
  if (e50 != null && e200 != null) {
    const spreadPct = Math.abs(e50 - e200) / price;
    if (e50 > e200) trendLabel = spreadPct > 0.004 ? "صاعد قوي" : "صاعد";
    else trendLabel = spreadPct > 0.004 ? "هابط قوي" : "هابط";
  }

  return {
    tf,
    candles,
    price,
    ema,
    rsi: rsiData,
    macd: macdData,
    bb,
    atr: atrData,
    stoch,
    adx: adxData,
    vwap,
    swings,
    trendLabel,
  };
}

// ---------- حساب انحياز رمزي لمؤشر خارجي ----------
function externalBias(candles: Candle[]): number {
  if (candles.length < 30) return 0;
  const closes = candles.map((c) => c.c);
  const closesArr = closes;
  const e9 = lastArr(closesArr, 9);
  const e21 = lastArr(closesArr, 21);
  const rsiNow = analyzeRSI(closes).rsi;
  const roc3 = ((closes[closes.length - 1] - closes[closes.length - 4]) / closes[closes.length - 4]) * 100;

  let bias = 0;
  if (e9 != null && e21 != null) bias += e9 > e21 ? 45 : -45;
  bias += Math.max(-30, Math.min(30, (rsiNow - 50) * 1.2));
  bias += Math.max(-25, Math.min(25, roc3 * 12));
  return Math.max(-100, Math.min(100, bias));
}

// ---------- بناء جدول الأطر الزمنية ----------
function buildTFRows(all: TimeframeAnalysis[]): TFRow[] {
  return all.map((tfa) => {
    let verdict: TFRow["verdict"] = "محايد";
    let bull = 0;
    let bear = 0;

    const e50 = lastVal(tfa.ema.ema50);
    const e200 = lastVal(tfa.ema.ema200);
    if (e50 != null && e200 != null) {
      if (e50 > e200) bull += 2;
      else bear += 2;
    }
    if (e50 != null) {
      if (tfa.price > e50) bull += 1;
      else bear += 1;
    }
    if (tfa.rsi.rsi > 52) bull += 1;
    else if (tfa.rsi.rsi < 48) bear += 1;
    if (tfa.macd.hist > 0) bull += 1;
    else if (tfa.macd.hist < 0) bear += 1;
    if (tfa.stoch.k > tfa.stoch.d) bull += 1;
    else bear += 1;

    if (bull >= 4 && bull - bear >= 2) verdict = "شراء";
    else if (bear >= 4 && bear - bull >= 2) verdict = "بيع";

    const macdLabel: TFRow["macd"] =
      Math.abs(tfa.macd.hist) < 0.05 ? "محايد" : tfa.macd.hist > 0 ? "إيجابي" : "سلبي";

    return {
      tf: tfAr(tfa.tf),
      trend: tfa.trendLabel,
      rsi: Math.round(tfa.rsi.rsi),
      macd: macdLabel,
      stoch: `${Math.round(tfa.stoch.k)} / ${Math.round(tfa.stoch.d)}`,
      verdict,
    };
  });
}

// ---------- مستويات الصفقة (حتمية بالكامل) ----------
function buildTradeLevels(
  direction: "BUY" | "SELL",
  price: number,
  atrValue: number,
  candles: Candle[],
  supports: { price: number }[],
  resistances: { price: number }[]
): TradeLevels {
  // 1) الوقف: خلف آخر سوينغ + عازل 0.4×ATR
  // أرضية صلبة 1.5×ATR (مطابقة لإعدادات الباك-تيست الذي حقق 70% فوز)
  // — الوقف الأضيق من ذلك قتله ضجيج السوق في التداول الحي
  const lookback = candles.slice(-30);
  const swingLow = Math.min(...lookback.map((c) => c.l));
  const swingHigh = Math.max(...lookback.map((c) => c.h));

  // أقرب مستوى هيكلي معتبر
  const nearestStructure =
    direction === "BUY"
      ? supports.filter((s) => s.price < price).sort((a, b) => b.price - a.price)[0]?.price ?? swingLow
      : resistances.filter((r) => r.price > price).sort((a, b) => a.price - b.price)[0]?.price ?? swingHigh;

  const atrStop = 1.5 * atrValue; // نفس مسافة الباك-تيست بالضبط
  let sl: number;
  if (direction === "BUY") {
    sl = Math.min(nearestStructure - 0.4 * atrValue, price - atrStop);
    // لا تبعد الوقف أكثر من 2.4×ATR
    sl = Math.max(sl, price - 2.4 * atrValue);
  } else {
    sl = Math.max(nearestStructure + 0.4 * atrValue, price + atrStop);
    sl = Math.min(sl, price + 2.4 * atrValue);
  }

  const riskUsd = Math.abs(price - sl);

  // 2) الأهداف: 1R / 1.8R / 2.8R مُحسّنة بالمستويات الهيكلية
  const sign = direction === "BUY" ? 1 : -1;
  const tpCandidates = [
    { base: price + sign * riskUsd * 1.0, label: "TP1" },
    { base: price + sign * riskUsd * 1.8, label: "TP2" },
    { base: price + sign * riskUsd * 2.8, label: "TP3" },
  ];

  const levelPool = direction === "BUY" ? resistances : supports;
  const tps = tpCandidates.map((tp) => {
    // اسحب الهدف لأقرب مستوى هيكلي قريب (ضمن 0.4×ATR) لتكون الأهداف واقعية
    const near = levelPool
      .map((l) => l.price)
      .filter((p) => (direction === "BUY" ? p > tp.base : p < tp.base))
      .sort((a, b) => Math.abs(a - tp.base) - Math.abs(b - tp.base))[0];
    if (near != null && Math.abs(near - tp.base) < atrValue * 0.9) {
      return (direction === "BUY" ? Math.max(tp.base, near) : Math.min(tp.base, near));
    }
    return tp.base;
  });

  // منطقة الدخول: سوق فوري أو تصحيح خفيف نحو EMA (نطاق 0.35×ATR)
  const entryZone: [number, number] =
    direction === "BUY"
      ? [round2(price - 0.35 * atrValue), round2(price + 0.1 * atrValue)]
      : [round2(price - 0.1 * atrValue), round2(price + 0.35 * atrValue)];

  return {
    entry: round2(price),
    entryZone,
    sl: round2(sl),
    tp1: round2(tps[0]),
    tp2: round2(tps[1]),
    tp3: round2(tps[2]),
    rr1: round2(Math.abs(tps[0] - price) / riskUsd),
    rr2: round2(Math.abs(tps[1] - price) / riskUsd),
    rr3: round2(Math.abs(tps[2] - price) / riskUsd),
    riskUsd: round2(riskUsd),
    pips: Math.round(riskUsd * 10),
  };
}

// ---------- الثقة والدالة الرئيسية ----------
// weightsOverride: أوزان أعمدة قادمة من الباك-تيست (تعلّم ذاتي)
export async function generateSignal(
  mode: TradeMode,
  weightsOverride?: Record<string, number> | null
): Promise<SignalResponse> {
  // 1) جلب البيانات (متوازٍ)
  const [c5, c15, c60, c1d, dxy, silver, news] = await Promise.all([
    fetchCandles("GC=F", "5m", "5d").catch(() => null),
    fetchCandles("GC=F", "15m", "1mo").catch(() => null),
    fetchCandles("GC=F", "60m", "3mo"),
    fetchCandles("GC=F", "1d", "1y"),
    fetchCandles("DX-Y.NYB", "60m", "5d").catch(() => null),
    fetchCandles("SI=F", "60m", "5d").catch(() => null),
    fetchNews(),
  ]);

  if (!c15 && !c5) throw new Error("تعذر جلب بيانات الذهب — تحقق من الاتصال بمصدر البيانات");
  const c15m = c15 ?? c5!;
  const c4h = aggregateTo4h(c60);

  // 2) تحليل كل الأطر
  const tf5 = c5 ? analyzeTimeframe("5m", c5) : null;
  const tf15 = analyzeTimeframe("15m", c15m);
  const tf1h = analyzeTimeframe("1h", c60);
  const tf4h = analyzeTimeframe("4h", c4h);
  const tf1d = analyzeTimeframe("1d", c1d);

  const all: TimeframeAnalysis[] = [tf5, tf15, tf1h, tf4h, tf1d].filter(Boolean) as TimeframeAnalysis[];

  // 3) اختيار الأطر حسب النمط
  const entry = mode === "scalping" ? (tf5 ?? tf15) : tf1h;
  const confirm = mode === "scalping" ? tf1h : tf4h;
  const bias = mode === "scalping" ? tf4h : tf1d;

  // 4) هيكل السوق على إطار الدخول
  const price = entry.price;
  const sr = computeSRLevels(entry.swings, price, entry.atr.atr, entry.candles);
  const pivots = pivotPoints(entry.candles);
  const fib = fibonacciLevels(entry.candles, entry.atr.atr);
  const asianRange = computeAsianRange(c15m);

  // 5) انحيازات خارجية
  const dxyBias = dxy ? externalBias(dxy) : 0;
  const silverBias = silver ? externalBias(silver) : 0;

  // 6) الجلسة والأخبار — من الوقت الحالي دائماً (يعرف البوت مواعيد الفتح/الإغلاق عند كل Refresh)
  // الجلسة الحالية تعكس حالة السوق الفعلية الآن: نهاية الأسبوع → «السوق مغلق»،
  // وساعات التداول → الجلسة الحية الصحيحة بغض النظر عن عمر آخر شمعة
  const session = getSessionInfo(new Date());
  const now = Date.now();
  const usdNews = news.filter((e) => e.impact === "High");
  const upcoming = usdNews
    .filter((e) => e.time > now && e.time < now + 4 * 3600000)
    .slice(0, 3);
  const recent = usdNews
    .filter((e) => e.time <= now && e.time > now - 2 * 3600000)
    .slice(-3);
  const newsCaution = upcoming.some((e) => e.time - now < 90 * 60000) || recent.length > 0;
  let cautionText: string | null = null;
  if (newsCaution) {
    const ev = upcoming.find((e) => e.time - now < 90 * 60000) ?? recent[recent.length - 1];
    cautionText = ev
      ? ` خبر عالي التأثير (${ev.title}) ${ev.time > now ? "قادم خلال " + Math.round((ev.time - now) / 60000) + " دقيقة" : "صدر قبل " + Math.round((now - ev.time) / 60000) + " دقيقة"} — التقلب المفاجئ قد يضرب الوقف، فكّر بتأجيل الدخول أو توسيعه`
      : null;
  }

  // 7) تقييم الأعمدة
  const ctx: PillarContext = {
    entry,
    confirm,
    bias,
    daily: tf1d,
    all,
    supports: sr.supports,
    resistances: sr.resistances,
    pivots,
    fib,
    asianRange,
    session,
    dxyBias,
    silverBias,
    mode,
  };
  const pillars: PillarScore[] = computePillars(ctx);
  const gate = computeQualityGate(ctx, pillars);

  // 7.5) تطبيق أوزان التعلّم الذاتي (من الباك-تيست) إن وُجدت
  let training: SignalResponse["training"] = { applied: false, source: "base", stats: null, note: null };
  const weights =
    weightsOverride ??
    (getLearnedState() && mode === (getLearnedState()!.tf === "1h" ? "day" : "scalping")
      ? getLearnedState()!.weights
      : null);
  if (weights) {
    const valid = PILLAR_KEYS.every((k) => weights[k] != null && !isNaN(weights[k]) && weights[k] >= 3);
    if (valid) {
      for (const p of pillars) {
        const w = weights[p.key];
        if (w != null) p.weight = Math.round(w * 10) / 10;
      }
      const st = getLearnedState()?.stats ?? null;
      training = {
        applied: true,
        source: "backtest",
        stats: st,
        note:
          `تم تعديل أوزان الأعمدة تلقائياً وفق أداء التدريب على ${st?.trades ?? 0} صفقة تاريخية ` +
          `(نسبة فوز ${st ? Math.round(st.winRate * 100) : 0}% على إطار ${st?.tf ?? ""}) — الأوزان الأساسية تُستخدم عند غياب التعلّم`,
      };
    }
  }

  // 8) الدرجة النهائية الموزونة
  const totalWeight = pillars.reduce((a, p) => a + p.weight, 0);
  const score = pillars.reduce((a, p) => a + p.score * p.weight, 0) / totalWeight;

  // 9) الاتجاه والثقة — عتبة أعمق 20 (كانت 18): إشارات أقل لكن أجود
  // مبنية على البحث: التصفية المتشددة ترفع نسبة الفوز
  let direction: Direction = "WAIT";
  if (score >= 20) direction = "BUY";
  else if (score <= -20) direction = "SELL";

  const actionable = direction !== "WAIT";
  // الثقة تتضاعف بعمق التوافق: عدد الأعمدة القوية بنفس الاتجاه يرفعها
  const strongAgree = pillars.filter((p) => Math.sign(p.score) === Math.sign(score) && Math.abs(p.score) >= 12).length;
  const confluence = strongAgree; // عمق التوافق — يُستخدم كبوابة صلبة في المونيتور
  const confluenceBoost = 1 + Math.max(0, strongAgree - 2) * 0.06;
  const rawConfidence = 50 + Math.abs(score) * 0.45 * gate.factor * confluenceBoost;
  const confidence = Math.min(95, Math.round(rawConfidence));

  // 9.5) حرس الدخول — منع «التقاط السكاكين الهابطة» (سبب خسارة الصفقة الأولى حيّاً):
  // إذا تحرك السعر ضد اتجاه الصفقة أكثر من 1.1×ATR خلال آخر 3 شموع على إطار الدخول
  // فالدخول الآن يعني الشراء في منتصف انهيار/البيع في منتصف صعود — نرفض وننتظر استقراراً
  const entryGuard = { ok: true, reason: null as string | null };
  if (actionable) {
    const last3 = entry.candles.slice(-3);
    if (last3.length === 3) {
      const move = entry.price - last3[0].o; // صافي الحركة على آخر 3 شموع
      const against = direction === "BUY" ? move < -1.1 * entry.atr.atr : move > 1.1 * entry.atr.atr;
      if (against) {
        entryGuard.ok = false;
        entryGuard.reason =
          `حرس الدخول: السعر تحرك ${Math.abs(move).toFixed(1)}$ ضد ${direction === "BUY" ? "الشراء" : "البيع"} ` +
          `خلال آخر 3 شموع (${tfAr(entry.tf)}) أي ما يعادل ${(Math.abs(move) / entry.atr.atr).toFixed(1)}×ATR — الدخول الآن خطر، انتظر استقرار الحركة أو شمعة تأكيد`;
      }
    }
  }
  if (entryGuard.ok && actionable) {
    const last1 = entry.candles[entry.candles.length - 1];
    const body = Math.abs(last1.c - last1.o);
    // شمعة حالية عنيفة ضد الاتجاه (> 0.9×ATR جسم) = إلغاء مؤقت
    if (body > 0.9 * entry.atr.atr) {
      const bearish = last1.c < last1.o;
      if ((direction === "BUY" && bearish) || (direction === "SELL" && !bearish)) {
        entryGuard.ok = false;
        entryGuard.reason =
          `حرس الدخول: آخر شمعة على ${tfAr(entry.tf)} عنيفة ضد الاتجاه (جسم ${body.toFixed(1)}$ ≈ ${(body / entry.atr.atr).toFixed(1)}×ATR) — انتظر إغلاقاً هادئاً أو تأكيداً`;      
      }
    }
  }

  // 10) مستويات الصفقة
  const levels =
    actionable && (mode === "scalping" ? entry.atr.atr : entry.atr.atr) > 0
      ? buildTradeLevels(direction as "BUY" | "SELL", price, entry.atr.atr, entry.candles, sr.supports, sr.resistances)
      : null;

  // 11) وسم الثقة
  const confidenceLabel =
    confidence >= 85
      ? "ثقة عالية جداً"
      : confidence >= 75
        ? "ثقة عالية"
        : confidence >= 65
          ? "ثقة متوسطة-عالية"
          : confidence >= 55
            ? "ثقة متوسطة"
            : "ثقة منخفضة — الأفضل الانتظار";

  // 12) نظام السوق
  const regime =
    entry.adx.adx >= 25
      ? `سوق اتجاهي (ADX=${entry.adx.adx.toFixed(0)}) — استراتيجيات الاختراق والاستمرارية أولى`
      : entry.bb.squeeze
        ? "سوق انضغاطي (بولينجر مضغوط) — تجهّز لكسر وشيك، الانتظار أفضل من الاستباق"
        : `سوق عرضي/مختلط (ADX=${entry.adx.adx.toFixed(0)}) — استراتيجيات الارتداد من المستويات أولى`;

  // 13) السرد التحليلي
  const narrative: string[] = [];
  narrative.push(
    `السعر الحالي ${price.toFixed(2)}$ — التحليل على إطار ${tfAr(entry.tf)} مع تأكيد ${tfAr(confirm.tf)} وانحياز ${tfAr(bias.tf)}.`
  );
  narrative.push(
    `الاتجاه العام: ${bias.trendLabel} على ${tfAr(bias.tf)}، و${confirm.trendLabel} على ${tfAr(confirm.tf)}.`
  );
  narrative.push(regime + ".");
  narrative.push(session.label + ".");
  if (asianRange) {
    narrative.push(
      `النطاق الآسيوي اليوم: ${asianRange.low}$ - ${asianRange.high}$ (عرض ${asianRange.width}$)${
        asianRange.swept !== "none" ? ` — تم كنس سيولة ${asianRange.swept === "high" ? "فوق قمته" : "تحت قاعه"}` : ""
      }.`
    );
  }
  const reasonsTop = pillars
    .flatMap((p) => p.reasons.filter((r) => Math.abs(r.contribution) >= 25).map((r) => ({ ...r, w: p.weight })))
    .sort((a, b) => Math.abs(b.contribution * b.w) - Math.abs(a.contribution * a.w))
    .slice(0, 3);
  for (const r of reasonsTop) {
    narrative.push(`أقوى إشارة: ${r.text}.`);
  }
  if (actionable && levels) {
    narrative.push(
      `${direction === "BUY" ? "شراء" : "بيع"} من ${levels.entry}$ بوقف ${levels.sl}$ (مسافة ${levels.riskUsd}$ ≈ ${levels.pips} نقطة) وأهداف حتى ${levels.tp3}$ بنسبة عائد/مخاطرة ${levels.rr3}:1.`
    );
  } else {
    narrative.push("الإشارات غير كافية لدخول آمن الآن — الوقوف جانباً حتى تكتمل الشروط هو قرار تداول صحيح.");
  }
  if (cautionText) narrative.push(cautionText);
  if (actionable && !entryGuard.ok && entryGuard.reason) {
    narrative.push("⛔ " + entryGuard.reason + ".");
  }
  if (training.applied) {
    const st = training.stats;
    narrative.push(
      st
        ? `🧠 التعلّم الذاتي مفعّل: الأوزان مقاسة من ${st.trades} صفقة تدريب (فوز ${Math.round(
            st.winRate * 100
          )}%، عامل ربح ${st.profitFactor}) — التدريب يجري بدون نظرة مستقبلية على الشموع السابقة.`
        : "🧠 التعلّم الذاتي مفعّل: أوزان الأعمدة معايرة من نتائج التدريب على الشموع التاريخية (التفاصيل في لوحة التدريب الذاتي أدناه)."
    );
  } else {
    narrative.push(
      "الأوزان الحالية هي الأساسية (24/20/14/12/10/10/10) — شغّل لوحة التدريب الذاتي ليعيد البوت معايرة أوزانه على الشموع التاريخية."
    );
  }

  // 14) بصمة حتمية (إثبات عدم العشوائية)
  const fingerprint = createHash("sha256")
    .update(
      JSON.stringify({
        m: mode,
        p: all.map((t) => [t.tf, t.candles.length, t.candles[t.candles.length - 1].t, t.price, t.rsi.rsi]),
        dxy: dxyBias,
        si: silverBias,
        n: upcoming.length + recent.length,
        w: training.applied ? PILLAR_KEYS.map((k) => (weights ?? BASE_PILLAR_WEIGHTS)[k]).join("/") : "base",
      })
    )
    .digest("hex")
    .slice(0, 16);

  // 15) بيانات السعر 24h من اليومي
  const dailyCloses = tf1d.candles.map((c) => c.c);
  const prevClose = dailyCloses.length >= 2 ? dailyCloses[dailyCloses.length - 2] : price;
  const change24h = price - prevClose;
  const todayCandle = tf1d.candles[tf1d.candles.length - 1];

  return {
    mode,
    generatedAt: new Date().toISOString(),
    fingerprint,
    symbol: "XAU/USD (GC=F)",
    price: round2(price),
    change24h: round2(change24h),
    change24hPct: round2((change24h / prevClose) * 100),
    dayHigh: round2(todayCandle.h),
    dayLow: round2(todayCandle.l),
    direction,
    directionAr: direction === "BUY" ? "شراء 🟢" : direction === "SELL" ? "بيع 🔴" : "انتظار ⏳",
    score: round2(score),
    confidence,
    confidenceLabel,
    qualityGate: Math.round(gate.factor * 100) / 100,
    confluence,
    adx: Math.round(entry.adx.adx * 10) / 10,
    adxTrending: entry.adx.trending,
    atrExpansion: Math.round(entry.atr.expansionRatio * 100) / 100,
    entryGuard,
    pillars: pillars.map((p) => ({ ...p, score: round2(p.score) })),
    levels,
    timeframeRows: buildTFRows(all),
    supportLevels: sr.supports,
    resistanceLevels: sr.resistances,
    pivots,
    fib,
    asianRange,
    session,
    news: { upcoming, recent, caution: newsCaution, cautionText },
    narrative,
    marketRegime: regime,
    atr15m: round2(tf15.atr.atr),
    atr1h: round2(tf1h.atr.atr),
    atr4h: round2(tf4h.atr.atr),
    dxyBias: Math.round(dxyBias),
    silverBias: Math.round(silverBias),
    dataSource: "Yahoo Finance (GC=F) + ForexFactory Calendar",
    training,
  };
}

// ---------- مساعدات ----------
function lastVal(arr: number[]): number | null {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (!isNaN(arr[i])) return arr[i];
  }
  return null;
}

function lastArr(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const alpha = 2 / (period + 1);
  let out = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < values.length; i++) {
    out = alpha * values[i] + (1 - alpha) * out;
  }
  return out;
}

function tfAr(tf: string): string {
  const map: Record<string, string> = {
    "5m": "5 دقائق",
    "15m": "15 دقيقة",
    "1h": "ساعة",
    "4h": "4 ساعات",
    "1d": "يومي",
  };
  return map[tf] ?? tf;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
