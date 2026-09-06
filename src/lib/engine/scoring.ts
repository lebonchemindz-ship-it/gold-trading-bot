// ============================================================
// محرك التقييم الموزون — 7 أعمدة (Confluence System)
// كل عمود ينتج درجة من -100 إلى +100 مع أسباب موثقة
// الوزن الإجمالي = 100. النتيجة النهائية حتمية 100%
// مبني على: كورس PDF + بحث معمق (جلسات، SMC، BB+RSI، EMA50/200، ATR)
// ============================================================

import { linregSlope, ema } from "./indicators";
import { detectPatterns } from "./candles";
import { nearestLevels, roundLevels } from "./structure";
import type {
  AsianRange,
  Candle,
  FibLevels,
  PillarReason,
  PillarScore,
  PivotLevels,
  RSIData,
  SRLevel,
  SessionInfo,
  TimeframeAnalysis,
} from "./types";

export interface PillarContext {
  entry: TimeframeAnalysis; // إطار الدخول: 15m سكالبينج / 1h يومي
  confirm: TimeframeAnalysis; // إطار التأكيد: 1h / 4h
  bias: TimeframeAnalysis; // إطار الانحياز: 4h / 1d
  daily: TimeframeAnalysis; // اليومي دائماً
  all: TimeframeAnalysis[]; // كل الأطر للجدول
  supports: SRLevel[];
  resistances: SRLevel[];
  pivots: PivotLevels | null;
  fib: FibLevels | null;
  asianRange: AsianRange | null;
  session: SessionInfo;
  dxyBias: number; // -100..+100 (سالب = دولار هابط = إيجابي للذهب)
  silverBias: number; // -100..+100
  mode: "scalping" | "day";
}

const clamp = (v: number, lo = -100, hi = 100) => Math.max(lo, Math.min(hi, v));

// ============ العمود 1: الاتجاه متعدد الأطر (وزن 24) ============
function pillarTrend(ctx: PillarContext): PillarScore {
  const reasons: PillarReason[] = [];
  const { entry, confirm, bias, daily } = ctx;
  const price = entry.price;

  // 1) ترتيب EMA على إطار الدخول (9>21>50>200)
  const e = entry.ema;
  const emaOk = (arr: number[]) => arr.length && !isNaN(arr[arr.length - 1]);
  if (emaOk(e.ema9) && emaOk(e.ema21) && emaOk(e.ema50) && emaOk(e.ema200)) {
    const s = e.ema9[e.ema9.length - 1];
    const t = e.ema21[e.ema21.length - 1];
    const f = e.ema50[e.ema50.length - 1];
    const tw = e.ema200[e.ema200.length - 1];
    let stack = 0;
    if (s > t) stack += 25;
    else stack -= 25;
    if (t > f) stack += 25;
    else stack -= 25;
    if (f > tw) stack += 25;
    else stack -= 25;
    if (price > tw) stack += 25;
    else stack -= 25;
    reasons.push({
      text: `ترتيب المتوسطات على ${tfAr(entry.tf)}: ${
        stack > 0 ? "ترتيب صاعد" : stack < 0 ? "ترتيب هابط" : "ترتيب مختلط"
      } (${stack >= 0 ? "+" : ""}${stack})`,
      contribution: stack,
    });
  }

  // 2) اتجاه إطار التأكيد EMA50 vs EMA200 (من استراتيجية H4 الترندية)
  const c50 = last(confirm.ema.ema50);
  const c200 = last(confirm.ema.ema200);
  if (c50 != null && c200 != null) {
    const crossDir = c50 > c200 ? 1 : -1;
    // مسافة التقاطع نسبة للسعر — كل ما كانت أوسع كان الاتجاه أرسخ
    const spread = Math.min(Math.abs(c50 - c200) / price * 100 * 40, 30); // حتى 30
    const val = crossDir * (15 + spread);
    reasons.push({
      text: `EMA50 ${crossDir > 0 ? "فوق" : "تحت"} EMA200 على ${tfAr(confirm.tf)} — ${
        crossDir > 0 ? "اتجاه صاعد" : "اتجاه هابط"
      }`,
      contribution: val,
    });
  }

  // 3) انحياز الإطار الأعلى (4h للسكالبينج / يومي للتداول اليومي)
  const b50 = last(bias.ema.ema50);
  const b200 = last(bias.ema.ema200);
  if (b50 != null && b200 != null) {
    const val = b50 > b200 ? 40 : -40;
    reasons.push({
      text: `الانحياز الأعلى (${tfAr(bias.tf)}): ${b50 > b200 ? "صاعد" : "هابط"} — تداول مع التيار فقط`,
      contribution: val,
    });
  }

  // 4) الانحياز اليومي: السعر مقابل EMA50 اليومي
  const d50 = last(daily.ema.ema50);
  if (d50 != null) {
    const val = price > d50 ? 25 : -25;
    reasons.push({
      text: `السعر ${price > d50 ? "فوق" : "تحت"} EMA50 اليومي — ${price > d50 ? "الانحياز الكلي يميل للصعود" : "الانحياز الكلي يميل للهبوط"}`,
      contribution: val,
    });
  }

  // 5) قوة الاتجاه ADX
  if (entry.adx.trending) {
    const dirSign = entry.adx.plusDI > entry.adx.minusDI ? 1 : -1;
    const val = dirSign * 30;
    reasons.push({
      text: `ADX=${entry.adx.adx.toFixed(0)} (سوق اتجاهي) و${dirSign > 0 ? "+DI يهيمن (ضغط شرائي)" : "-DI يهيمن (ضغط بيعي)"}`,
      contribution: val,
    });
  } else {
    reasons.push({
      text: `ADX=${entry.adx.adx.toFixed(0)} — سوق عرضي/ضعيف الاتجاه (يقلل موثوقية إشارات الاختراق)`,
      contribution: 0,
    });
  }

  const raw = reasons.reduce((a, r) => a + r.contribution, 0) / reasons.length;
  return {
    key: "trend",
    name: "الاتجاه متعدد الأطر",
    weight: 24,
    score: clamp(raw),
    reasons,
  };
}

// ============ العمود 2: الزخم (وزن 20) ============
function pillarMomentum(ctx: PillarContext): PillarScore {
  const reasons: PillarReason[] = [];
  const { entry, confirm } = ctx;

  // 1) RSI — المنطقة والميل (من استراتيجية BB+RSI)
  const r: RSIData = entry.rsi;
  let rsiScore = 0;
  if (r.zone === "oversold") rsiScore = 45;
  else if (r.zone === "oversold_mid") rsiScore = 30;
  else if (r.zone === "overbought") rsiScore = -45;
  else if (r.zone === "overbought_mid") rsiScore = -30;
  else rsiScore = (r.rsi - 50) * 1.6;
  rsiScore += clamp(r.slope * 2.2, -18, 18);
  reasons.push({
    text: `RSI(14) = ${r.rsi.toFixed(1)} (${zoneAr(r.zone)}) والميل ${r.slope >= 0 ? "صاعد" : "هابط"}`,
    contribution: clamp(rsiScore),
  });

  // 2) MACD histogram
  const m = entry.macd;
  reasons.push({
    text: `MACD: الهيستوغرام ${m.hist >= 0 ? "إيجابي" : "سلبي"} و${m.histRising ? "يتزايد" : "يتناقص"}`,
    contribution: clamp((m.hist >= 0 ? 30 : -30) + (m.histRising ? 25 : -25)),
  });

  // 3) Stochastic تقاطع
  const st = entry.stoch;
  let stochScore = 0;
  if (st.crossUp) stochScore = st.zone === "oversold" ? 50 : 25;
  if (st.crossDown) stochScore = st.zone === "overbought" ? -50 : -25;
  if (stochScore === 0) stochScore = (st.k - 50) * 0.5;
  reasons.push({
    text: `Stochastic: %K=${st.k.toFixed(0)} %D=${st.d.toFixed(0)} (${zoneAr(st.zone)})${
      st.crossUp ? " — تقاطع صاعد" : st.crossDown ? " — تقاطع هابط" : ""
    }`,
    contribution: clamp(stochScore),
  });

  // 4) تباعد RSI (Divergence) — كشف حتمي على آخر 40 شمعة
  const div = detectRSIDivergence(entry);
  if (div !== 0) {
    reasons.push({
      text:
        div > 0
          ? "تباعد صاعد: السعر صنع قاعًا أدنى بينما RSI صنع قاعًا أعلى — إشارة انعكاس شراء"
          : "تباعد هابط: السعر صنع قمة أعلى بينما RSI صنع قمة أدنى — إشارة انعكاس بيع",
      contribution: div * 55,
    });
  }

  // 5) زخم إطار التأكيد
  const cr = confirm.rsi.rsi;
  reasons.push({
    text: `زخم ${tfAr(confirm.tf)}: RSI = ${cr.toFixed(1)}`,
    contribution: clamp((cr - 50) * 0.9),
  });

  const raw = reasons.reduce((a, r) => a + r.contribution, 0) / reasons.length;
  return { key: "momentum", name: "الزخم والمذبذبات", weight: 20, score: clamp(raw), reasons };
}

// ============ العمود 3: الموقع من الدعم/المقاومة (وزن 14) ============
function pillarLocation(ctx: PillarScore_ctxAlias): PillarScore {
  const reasons: PillarReason[] = [];
  const { entry, supports, resistances, pivots, fib, asianRange } = ctx;
  const price = entry.price;
  const atrV = Math.max(entry.atr.atr, 0.01);

  const { nearestSupport, nearestResistance, distS, distR } = nearestLevels(
    price,
    supports,
    resistances,
    atrV
  );

  // 1) المسافة للدعم/المقاومة بمقياس ATR
  if (nearestSupport && nearestResistance) {
    let loc = 0;
    let text = "";
    if (distS <= 1.2 && distR > 2.0) {
      loc = 40;
      text = `السعر قريب من دعم ${nearestSupport.price}$ (على بعد ${distS.toFixed(1)}×ATR) وبعيد عن المقاومة — منطقة شراء جيدة`;
    } else if (distR <= 1.2 && distS > 2.0) {
      loc = -40;
      text = `السعر قريب من مقاومة ${nearestResistance.price}$ (على بعد ${distR.toFixed(1)}×ATR) وبعيد عن الدعم — خطر تصحيح/بيع`;
    } else if (distS < 0.4 || distR < 0.4) {
      // فوق المستوى مباشرة = لحظة اختبار
      loc = distS < distR ? 15 : -15;
      text = `السعر يختبر ${distS < distR ? `دعم ${nearestSupport.price}$` : `مقاومة ${nearestResistance.price}$`} الآن — راقب ردة الفعل`;
    } else {
      loc = (distR - distS) * 8;
      text = `السعر بين الدعم ${nearestSupport.price}$ والمقاومة ${nearestResistance.price}$ — مساحة حركة ${((distR + distS) * atrV).toFixed(0)}$`;
    }
    reasons.push({ text, contribution: clamp(loc) });
  }

  // 2) البيفوت
  if (pivots) {
    const above = price > pivots.pp;
    reasons.push({
      text: `السعر ${above ? "فوق" : "تحت"} نقطة البيفوت المحورية PP=${pivots.pp}$ — ${above ? "انحياز يومي صاعد" : "انحياز يومي هابط"}`,
      contribution: above ? 20 : -20,
    });
  }

  // 3) المنطقة الذهبية لفيبوناتشي 0.618
  if (fib && fib.golden) {
    const g = fib.golden.price;
    const dist = Math.abs(price - g) / atrV;
    if (dist <= 0.8) {
      const dir: 1 | -1 = fib.direction === "up" ? 1 : -1;
      reasons.push({
        text: `السعر داخل المنطقة الذهبية لفيبوناتشي 61.8% عند ${g}$ (موجة ${fib.direction === "up" ? "صاعدة" : "هابطة"}) — أفضل نقاط الدخول مع الترند`,
        contribution: 45 * dir,
      });
    }
  }

  // 4) النطاق الآسيوي وموقع السعر منه (استراتيجية كسر النطاق + كنس السيولة)
  if (asianRange) {
    const above = price > asianRange.high;
    const below = price < asianRange.low;
    const inside = !above && !below;
    if (inside) {
      reasons.push({
        text: `السعر داخل النطاق الآسيوي (${asianRange.low}$ - ${asianRange.high}$) عرضه ${asianRange.width}$ — انتظر الكسر أو الكنس`,
        contribution: 0,
      });
    } else if (above) {
      reasons.push({
        text: `السعر فوق النطاق الآسيوي (${asianRange.high}$) — كسر صاعد، الحركة تستهدف 1.5-2× عرض النطاق (${(asianRange.width * 1.5).toFixed(0)}$+)`,
        contribution: 35,
      });
    } else {
      reasons.push({
        text: `السعر تحت النطاق الآسيوي (${asianRange.low}$) — كسر هابط، الحركة تستهدف 1.5-2× عرض النطاق (${(asianRange.width * 1.5).toFixed(0)}$+)`,
        contribution: -35,
      });
    }

    // كنس السيولة (Judas Swing / Sweep) — SMC
    if (asianRange.swept === "high") {
      reasons.push({
        text: `🩸 كنس سيولة فوق قمة النطاق الآسيوي ثم الإغلاق تحته — مصيدة صعود (Sweep) → انحياز هبوطي`,
        contribution: -45,
      });
    } else if (asianRange.swept === "low") {
      reasons.push({
        text: `🩸 كنس سيولة تحت قاع النطاق الآسيوي ثم الإغلاق فوقه — مصيدة هبوط (Sweep) → انحياز صاعد`,
        contribution: 45,
      });
    }
  }

  // 5) الأرقام المستديرة — مجمعات سيولة للذهب
  const rounds = roundLevels(price);
  const nearestRound = rounds[0];
  if (nearestRound && nearestRound.distance < atrV * 0.5) {
    const roundDir = nearestRound.level > price ? -12 : 12;
    reasons.push({
      text: `قرب الرقم المستدير ${nearestRound.level}$ (مجمع سيولة) — احتمال ارتداد/تباطؤ عند المستوى`,
      contribution: roundDir,
    });
  }

  const raw = reasons.reduce((a, r) => a + r.contribution, 0) / Math.max(reasons.length, 1);
  return { key: "location", name: "الموقع من الدعم والمقاومة", weight: 14, score: clamp(raw), reasons };
}

// ============ العمود 4: حركة السعر (وزن 10) ============
function pillarPriceAction(ctx: PillarScore_ctxAlias): PillarScore {
  const reasons: PillarReason[] = [];
  const { entry } = ctx;
  const patterns = detectPatterns(entry.candles, entry.atr.atr);

  if (!patterns.length) {
    // اتجاه آخر 5 شموع
    const last5 = entry.candles.slice(-5);
    const bullCount = last5.filter((c) => c.c > c.o).length;
    const val = (bullCount - 2.5) * 18;
    reasons.push({
      text: `لا نمط شموع واضح — آخر 5 شموع: ${bullCount} صاعدة / ${5 - bullCount} هابطة`,
      contribution: clamp(val),
    });
  } else {
    const strongest = patterns[patterns.length - 1];
    for (const p of patterns.slice(-3)) {
      const recency = p.barIndex >= entry.candles.length - 1 ? 1 : 0.7;
      reasons.push({
        text: `${p.name} — ${p.direction === "bull" ? "إشارة شراء" : "إشارة بيع"}`,
        contribution: (p.direction === "bull" ? 1 : -1) * p.strength * recency,
      });
    }
    void strongest;
  }

  // إغلاق مقابل VWAP اليومي
  if (entry.vwap != null) {
    const above = entry.price > entry.vwap;
    reasons.push({
      text: `السعر ${above ? "فوق" : "تحت"} VWAP اليومي (${entry.vwap.toFixed(2)}$) — ${above ? "المشترون يسيطرون على القيمة العادلة" : "البائعون يسيطرون على القيمة العادلة"}`,
      contribution: above ? 30 : -30,
    });
  }

  const raw = reasons.reduce((a, r) => a + r.contribution, 0) / Math.max(reasons.length, 1);
  return { key: "priceAction", name: "حركة السعر والشموع", weight: 10, score: clamp(raw), reasons };
}

// ============ العمود 5: الارتباط الكلي (وزن 10) ============
function pillarMacro(ctx: PillarScore_ctxAlias): PillarScore {
  const reasons: PillarReason[] = [];

  // 1) الدولار الأمريكي DXY (علاقة عكسية مع الذهب)
  reasons.push({
    text: `مؤشر الدولار DXY: ${ctx.dxyBias < -15 ? "زخم هابط" : ctx.dxyBias > 15 ? "زخم صاعد" : "محايد"} — ${ctx.dxyBias < 0 ? "يدعم الذهب صعوداً" : "يضغط على الذهب"}`,
    contribution: clamp(-ctx.dxyBias),
  });

  // 2) الفضة SI (ارتباط موجب قوي)
  reasons.push({
    text: `الفضة (ارتباط موجب): ${ctx.silverBias < -15 ? "زخم هابط" : ctx.silverBias > 15 ? "زخم صاعد" : "محايد"}`,
    contribution: clamp(ctx.silverBias),
  });

  // 3) أداء آخر 5 أيام للذهب نفسه (معدل التغير)
  const daily = ctx.daily;
  const closes = daily.candles.map((c) => c.c).filter((v) => !isNaN(v));
  if (closes.length >= 6) {
    const roc5 = ((closes[closes.length - 1] - closes[closes.length - 6]) / closes[closes.length - 6]) * 100;
    reasons.push({
      text: `تغير الذهب خلال 5 أيام: ${roc5 >= 0 ? "+" : ""}${roc5.toFixed(1)}% — ${roc5 > 1 ? "تدفق شراء مستمر" : roc5 < -1 ? "ضغط بيع" : "استقرار نسبي"}`,
      contribution: clamp(roc5 * 12),
    });
  }

  const raw = reasons.reduce((a, r) => a + r.contribution, 0) / Math.max(reasons.length, 1);
  return { key: "macro", name: "الارتباط الكلي (دولار/فضة)", weight: 10, score: clamp(raw), reasons };
}

// ============ العمود 6: الجلسة والتوقيت (وزن 12) ============
function pillarSession(ctx: PillarScore_ctxAlias): PillarScore {
  const reasons: PillarReason[] = [];
  const { session, entry } = ctx;

  // 1) جودة الجلسة (سيولة)
  const qualityFactor = session.quality / 100;
  reasons.push({
    text: `${session.label}`,
    contribution: 0,
  });

  // 1-ب) دورة الأسبوع الخفية في الذهب (v8 — من تدريب السنتين + البحث المستقل)
  // الاثنين والأربعاء أضعف الأيام فوزاً — نضيف إنذاراً صريحاً ونخصم الثقة
  const now = new Date();
  const dow = now.getUTCDay();
  const WD_AR = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
  if (dow === 1 || dow === 3) {
    const weakTxt =
      dow === 1
        ? "الاثنين — نطاقات ميتة بعد عطلة الأسبوع (فوز البوت التاريخي 50%): انتظر اختراقاً صريحاً أو اكتفِ بالمراقبة"
        : "الأربعاء — تشظّ منتصف الأسبوع (فوز البوت التاريخي 53%): طالب توافقاً أعمق قبل الدخول";
    reasons.push({
      text: `⚠️ دورة الأسبوع: ${weakTxt}`,
      contribution: -12,
    });
  } else if (dow === 2 || dow === 4 || dow === 5) {
    reasons.push({
      text: `✓ دورة الأسبوع: ${WD_AR[dow]} من أيام الذهب القوية (الثلاثاء اختراقات · الخميس/الجمعة اتجاه مؤكد — فوز تاريخي 64-100%)`,
      contribution: 8,
    });
  }

  // 1-ج) ساعة 17:00 UTC تلاشي نيويورك (فوز تاريخي 33%) — إنذار خفيف
  const hUtc = now.getUTCHours();
  if (hUtc === 17) {
    reasons.push({
      text: "⚠️ الساعة 17:00 UTC — تلاشي ما بعد ظهور نيويورك (أضعف ساعة تاريخياً بفوز 33%): حجم أصغر أو انتظر الغد",
      contribution: -8,
    });
  }

  // 2) اتجاه حركة الجلسة الحالية (الافتتاح → الآن)
  const dayStart = Math.floor(entry.candles[entry.candles.length - 1].t / 86400000) * 86400000;
  const todays = entry.candles.filter((c) => c.t >= dayStart);
  if (todays.length >= 3) {
    const open = todays[0].o;
    const dir = entry.price > open ? 1 : -1;
    const mag = Math.min(Math.abs(entry.price - open) / Math.max(entry.atr.atr, 0.01) / 2, 1);
    const val = dir * mag * 60 * qualityFactor;
    reasons.push({
      text: `حركة اليوم من الافتتاح (${open.toFixed(2)}$): ${dir > 0 ? "صاعدة" : "هابطة"} بمقدار ${Math.abs(entry.price - open).toFixed(1)}$${qualityFactor < 0.5 ? " — لكن خارج جلسات السيولة العالية (حركة أقل موثوقية)" : ""}`,
      contribution: val,
    });
  }

  const raw = reasons.length > 1
    ? reasons.slice(1).reduce((a, r) => a + r.contribution, 0) / (reasons.length - 1)
    : 0;
  return { key: "session", name: "الجلسة والتوقيت", weight: 12, score: clamp(raw), reasons };
}

// ============ العمود 7: التقلب والانضباط (وزن 10) ============
function pillarVolatility(ctx: PillarScore_ctxAlias): PillarScore {
  const reasons: PillarReason[] = [];
  const { entry } = ctx;

  // 1) نظام التقلب
  const ratio = entry.atr.expansionRatio;
  if (ratio > 1.25) {
    reasons.push({
      text: `توسع تقلب قوي: ATR الحالي = ${(ratio * 100).toFixed(0)}% من متوسطه — حركة نشطة، مناسبة للمضاربة اللحظية مع وقف أوسع`,
      contribution: 0,
    });
  } else if (ratio < 0.75) {
    reasons.push({
      text: `انكماش تقلب: ATR = ${(ratio * 100).toFixed(0)}% من متوسطه — سوق هادئ، الإشارات أقل موثوقية وانتظار الاختراق أفضل`,
      contribution: 0,
    });
  } else {
    reasons.push({
      text: `تقلب طبيعي: ATR = ${(ratio * 100).toFixed(0)}% من متوسطه`,
      contribution: 0,
    });
  }

  // 2) حزام بولينجر — ضغط أو سير الحزام (Band Walk)
  const bb = entry.bb;
  if (bb.squeeze) {
    reasons.push({
      text: `ضغط بولينجر (Bandwidth ${bb.bandwidth.toFixed(2)}% أقل من 75% من المتوسط) — تكوين طاقة لكسر وشيك، اتجاه الكسر يحدده الاتجاه الأعلى`,
      contribution: 0,
    });
  }
  if (bb.percentB > 0.95) {
    reasons.push({
      text: `السعر يمشي على الحزام العلوي (%B=${(bb.percentB * 100).toFixed(0)}%) — زخم صاعد قوي (Band Walk)`,
      contribution: 45,
    });
  } else if (bb.percentB < 0.05) {
    reasons.push({
      text: `السعر يمشي على الحزام السفلي (%B=${(bb.percentB * 100).toFixed(0)}%) — زخم هابط قوي (Band Walk)`,
      contribution: -45,
    });
  } else if (bb.percentB > 0.55 && bb.percentB <= 0.95) {
    reasons.push({ text: `السعر في النصف العلوي من بولينجر (%B=${(bb.percentB * 100).toFixed(0)}%)`, contribution: 15 });
  } else if (bb.percentB >= 0.05 && bb.percentB < 0.45) {
    reasons.push({ text: `السعر في النصف السفلي من بولينجر (%B=${(bb.percentB * 100).toFixed(0)}%)`, contribution: -15 });
  }

  const raw = reasons.reduce((a, r) => a + r.contribution, 0) / Math.max(reasons.length, 1);
  return { key: "volatility", name: "التقلب وبولينجر", weight: 10, score: clamp(raw), reasons };
}

// ============ بوابات الجودة (Quality Gates) ============
export function computeQualityGate(ctx: PillarContext, pillars: PillarScore[]): {
  factor: number;
  notes: string[];
} {
  const notes: string[] = [];
  let factor = 1.0;

  // 1) سوق ميت (تقلب منخفض) يخفض الثقة
  const ratio = ctx.entry.atr.expansionRatio;
  if (ratio < 0.7) {
    factor *= 0.78;
    notes.push("تقلب منخفض جداً: تخفيض الثقة 22% — السوق يحتاج طاقة للحركة");
  } else if (ratio < 0.85) {
    factor *= 0.92;
    notes.push("تقلب تحت المتوسط: تخفيض طفيف للثقة");
  }

  // 2) تعارض الاتجاه مع الزخم يخفض الثقة
  const trend = pillars.find((p) => p.key === "trend")!;
  const mom = pillars.find((p) => p.key === "momentum")!;
  if (Math.sign(trend.score) !== Math.sign(mom.score) && Math.abs(trend.score) > 12 && Math.abs(mom.score) > 12) {
    factor *= 0.82;
    notes.push("تعارض بين عمود الاتجاه وعمود الزخم: تخفيض الثقة 18% — إشارة أقل وضوحاً");
  }

  // 3) جودة الجلسة
  if (ctx.session.quality < 40) {
    factor *= 0.88;
    notes.push("خارج جلسات السيولة الرئيسية: تخفيض الثقة 12% — الحركات تخترق بسهولة");
  }

  // 4) عدد الشموع غير كافٍ
  if (ctx.entry.candles.length < 120) {
    factor *= 0.85;
    notes.push("عمق بيانات تاريخية محدود: تخفيض الثقة 15%");
  }

  return { factor: Math.max(factor, 0.55), notes };
}

// ============ حساب الأعمدة كاملة ============
export function computePillars(ctx: PillarContext): PillarScore[] {
  return [
    pillarTrend(ctx),
    pillarMomentum(ctx),
    pillarLocation(ctx),
    pillarPriceAction(ctx),
    pillarMacro(ctx),
    pillarSession(ctx),
    pillarVolatility(ctx),
  ];
}

// ============ أدوات مساعدة ============
function last(arr: number[]): number | null {
  const valid = arr.filter((v) => !isNaN(v));
  return valid.length ? valid[valid.length - 1] : null;
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

function zoneAr(zone: string): string {
  const map: Record<string, string> = {
    oversold: "تشبع بيعي",
    oversold_mid: "منطقة بيعية",
    neutral: "محايد",
    overbought_mid: "منطقة شرائية",
    overbought: "تشبع شرائي",
  };
  return map[zone] ?? zone;
}

// ============ كشف تباعد RSI (حتمي) ============
export function detectRSIDivergence(tfa: TimeframeAnalysis): number {
  const closes = tfa.candles.map((c) => c.c);
  const rsiVals = tfa.rsi.values;
  if (closes.length < 45) return 0;

  const win = 40;
  const startIdx = closes.length - win;
  let minPriceIdx = startIdx;
  let maxPriceIdx = startIdx;
  let minRsiIdx = startIdx;
  let maxRsiIdx = startIdx;

  for (let i = startIdx; i < closes.length; i++) {
    if (closes[i] < closes[minPriceIdx]) minPriceIdx = i;
    if (closes[i] > closes[maxPriceIdx]) maxPriceIdx = i;
    const rv = rsiVals[i];
    if (!isNaN(rv)) {
      const rmin = rsiVals[minRsiIdx];
      const rmax = rsiVals[maxRsiIdx];
      if (!isNaN(rmin) && rv < rmin) minRsiIdx = i;
      if (!isNaN(rmax) && rv > rmax) maxRsiIdx = i;
    }
  }

  // تباعد صاعد: قاع سعر أدنى + قاع RSI أعلى (القاعان في النصف الثاني من النافذة)
  const secondHalfStart = startIdx + Math.floor(win / 2);
  if (
    minPriceIdx >= secondHalfStart &&
    minRsiIdx < secondHalfStart &&
    rsiVals[minRsiIdx] - rsiVals[minPriceIdx] > 3
  ) {
    return 1;
  }
  // تباعد هابط: قمة سعر أعلى + قمة RSI أدنى
  if (
    maxPriceIdx >= secondHalfStart &&
    maxRsiIdx < secondHalfStart &&
    rsiVals[maxRsiIdx] - rsiVals[maxPriceIdx] > 3
  ) {
    return -1;
  }
  return 0;
}

// اسم مستخدم للسياق (تنظيمي)
type PillarScore_ctxAlias = PillarContext;
