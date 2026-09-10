// ============================================================
// Gold Trading Bot — Core Types
// محرك تحليل ذهب حتمي (Deterministic) — نفس البيانات = نفس النتيجة
// ============================================================

export interface Candle {
  t: number; // timestamp (ms, UTC)
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export type Timeframe = "5m" | "15m" | "1h" | "4h" | "1d";

export type TradeMode = "scalping" | "day";

export type Direction = "BUY" | "SELL" | "WAIT";

// ---------- المؤشرات ----------
export interface EMASet {
  ema9: number[];
  ema21: number[];
  ema50: number[];
  ema200: number[];
}

export interface RSIData {
  values: number[];
  rsi: number; // آخر قيمة
  slope: number; // ميل آخر 5 قيم
  zone: "oversold" | "oversold_mid" | "neutral" | "overbought_mid" | "overbought";
}

export interface MACDData {
  line: number[];
  signal: number[];
  histogram: number[];
  hist: number;
  histRising: boolean;
}

export interface BollingerData {
  upper: number[];
  mid: number[];
  lower: number[];
  upperNow: number;
  midNow: number;
  lowerNow: number;
  percentB: number;
  bandwidth: number;
  bandwidthAvg: number; // متوسط 50
  squeeze: boolean;
}

export interface ATRData {
  values: number[];
  atr: number;
  atrAvg: number; // متوسط 50
  expansionRatio: number; // atr / atrAvg
}

export interface StochData {
  k: number;
  d: number;
  crossUp: boolean;
  crossDown: boolean;
  zone: "oversold" | "neutral" | "overbought";
}

export interface ADXData {
  adx: number;
  plusDI: number;
  minusDI: number;
  trending: boolean;
}

export interface TimeframeAnalysis {
  tf: Timeframe;
  candles: Candle[];
  price: number;
  ema: EMASet;
  rsi: RSIData;
  macd: MACDData;
  bb: BollingerData;
  atr: ATRData;
  stoch: StochData;
  adx: ADXData;
  vwap: number | null;
  swings: Swing[];
  trendLabel: "صاعد قوي" | "صاعد" | "محايد" | "هابط" | "هابط قوي";
}

// ---------- هيكل السوق ----------
export interface Swing {
  index: number;
  price: number;
  type: "high" | "low";
  t: number;
}

export interface SRLevel {
  price: number;
  type: "support" | "resistance";
  touches: number;
  strength: number; // 0..100
  label: string;
}

export interface PivotLevels {
  pp: number; r1: number; r2: number; r3: number; s1: number; s2: number; s3: number;
}

export interface FibLevels {
  from: number;
  to: number;
  direction: "up" | "down";
  levels: { ratio: number; price: number }[];
  golden: { price: number; ratio: number } | null;
}

export interface AsianRange {
  date: string;
  high: number;
  low: number;
  width: number;
  complete: boolean; // هل اكتملت الجلسة الآسيوية
  swept: "high" | "low" | "none"; // كنس سيولة
}

// ---------- الجلسات ----------
export interface SessionInfo {
  active: string[]; // الجلسات النشطة الآن
  quality: number; // 0..100 جودة السيولة
  label: string; // وصف عربي
  londonOpen: boolean;
  nyOpen: boolean;
  overlap: boolean;
}

// ---------- الأخبار ----------
export interface NewsEvent {
  time: number;
  title: string;
  impact: "High" | "Medium" | "Low";
  currency: string;
}

// ---------- نظام التقييم ----------
export interface PillarReason {
  text: string;
  contribution: number; // -100..+100 مساهمة قبل الوزن
}

export interface PillarScore {
  key: string;
  name: string; // اسم عربي
  weight: number; // 0..100
  score: number; // -100..+100
  reasons: PillarReason[];
}

export interface TradeLevels {
  entry: number;
  entryZone: [number, number];
  sl: number;
  tp1: number;
  tp2: number;
  tp3: number;
  rr1: number;
  rr2: number;
  rr3: number;
  riskUsd: number; // مسافة الوقف بالدولار
  pips: number; // مسافة الوقف بالنقاط (بيب = 0.10$)
}

export interface TFRow {
  tf: string;
  trend: string;
  rsi: number;
  macd: "إيجابي" | "سلبي" | "محايد";
  stoch: string;
  verdict: "شراء" | "بيع" | "محايد";
}

export interface SignalResponse {
  mode: TradeMode;
  generatedAt: string;
  fingerprint: string; // بصمة حتمية — sha256 من البيانات
  symbol: string;
  price: number;
  change24h: number;
  change24hPct: number;
  dayHigh: number;
  dayLow: number;
  direction: Direction;
  directionAr: string;
  score: number; // -100..+100
  confidence: number; // 0..100
  confidenceLabel: string;
  qualityGate: number; // معامل جودة السوق 0.6..1
  confluence: number; // عدد الأعمدة القوية (|score|>=12) المتفقة مع الاتجاه — عمق التوافق
  adx: number; // قوة الاتجاه على إطار الدخول
  adxTrending: boolean; // ADX >= 25 (سوق اتجاهي)
  atrExpansion: number; // ATR الحالي ÷ متوسطه — فوق 1.35 = توسع خطر يبتلع الأوقاف
  entryGuard: {
    ok: boolean; // هل زخم اللحظة يسمح بالدخول بأمان؟
    reason: string | null; // سبب المنع بالعربية (إن وُجد)
  };
  pillars: PillarScore[];
  levels: TradeLevels | null;
  timeframeRows: TFRow[];
  supportLevels: SRLevel[];
  resistanceLevels: SRLevel[];
  pivots: PivotLevels | null;
  fib: FibLevels | null;
  asianRange: AsianRange | null;
  session: SessionInfo;
  news: {
    upcoming: NewsEvent[];
    recent: NewsEvent[];
    caution: boolean;
    cautionText: string | null;
  };
  narrative: string[]; // سرد التحليل بالعربية
  marketRegime: string; // وصف نظام السوق
  atr15m: number;
  atr1h: number;
  atr4h: number;
  dxyBias: number;
  silverBias: number;
  dataSource: string;
  training: TrainingInfo; // حالة تعلّم البوت من الباك-تيست
}

// ---------- التدريب الذاتي (Backtest Learning) ----------
export interface TrainingStats {
  winRate: number; // 0..1 نسبة الفوز المركّبة
  trades: number;
  profitFactor: number;
  expectancyR: number; // متوسط العائد بوحدات المخاطرة
  maxDrawdownR: number;
  tf: string; // إطار التدريب
  from: string; // بداية فترة التدريب
  to: string; // نهاية فترة التدريب
  updatedAt: string;
}

export interface TrainingInfo {
  applied: boolean;
  source: "base" | "backtest";
  stats: TrainingStats | null;
  note: string | null; // وصف عربي للتعلّم المطبق
}

// ---------- إدخال خط زمني للتدريب المحفوظ (شكل مبسّط للتخزين) ----------
export interface TrainTimelineEntryLike {
  i: number;
  t: number;
  dateLabel: string;
  phase: string;
  dir: string;
  entry: number;
  sl: number;
  tp1: number;
  confidence: number;
  agreeing: string[];
  disagreeing: string[];
  regime: string;
  regimeAr: string;
  eventDay: string | null;
  result: string;
  r: number;
  bars: number;
  exitPrice: number;
  explanation: string;
  lossTags: string[];
}

// ---------- أخطاء ----------
export class MarketDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MarketDataError";
  }
}
