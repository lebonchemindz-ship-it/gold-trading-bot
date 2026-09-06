"use client";

// ============================================================
// لوحة التدريب الذاتي — البوت يتدرب على شموع هذا الشهر + السابق
// بروتوكول Walk-Forward: قرار بلا نظرة مستقبلية ثم تحقق ثم تعلم
// ============================================================

import { motion } from "framer-motion";
import {
  BrainCircuit,
  Play,
  TrendingUp,
  TrendingDown,
  Target,
  Trophy,
  Activity,
  BarChart3,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  MinusCircle,
  ArrowUpRight,
  ArrowDownRight,
  CalendarRange,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { BacktestResult, BtStats, BtStrategy, BtTrade, BtMonth } from "@/lib/engine/backtest";

const PILLAR_AR: Record<string, string> = {
  trend: "الاتجاه",
  momentum: "الزخم",
  location: "الموقع من المستويات",
  priceAction: "حركة السعر",
  macro: "الارتباط الكلي",
  session: "الجلسة",
  volatility: "التقلب",
};

const PILLAR_ORDER = ["trend", "momentum", "location", "session", "priceAction", "macro", "volatility"];

function fmtPct(v: number): string {
  return `${Math.round(v * 10) / 10}%`;
}

function KpiCard({
  label,
  value,
  sub,
  tone = "neutral",
  icon,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "good" | "bad" | "neutral" | "gold";
  icon?: React.ReactNode;
}) {
  const toneCls =
    tone === "good"
      ? "text-emerald-400"
      : tone === "bad"
        ? "text-rose-400"
        : tone === "gold"
          ? "text-amber-300"
          : "text-zinc-200";
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3">
      <div className="flex items-center gap-1.5 text-[10px] text-zinc-300 mb-1">
        {icon}
        {label}
      </div>
      <div className={cn("text-lg font-black tabular-nums leading-none", toneCls)} dir="ltr">
        {value}
      </div>
      {sub && <div className="text-[9px] text-zinc-300 mt-1">{sub}</div>}
    </div>
  );
}

function StatsCompare({ before, after }: { before: BtStats; after: BtStats }) {
  const improved = after.winRate > before.winRate;
  const diff = (after.winRate - before.winRate) * 100;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
      <KpiCard
        label="نسبة الفوز — قبل التدريب"
        value={fmtPct(before.winRate * 100)}
        sub={`${before.trades} صفقة`}
        tone={before.winRate >= 0.5 ? "good" : "bad"}
        icon={<Target className="w-3 h-3" />}
      />
      <KpiCard
        label="نسبة الفوز — بعد التدريب"
        value={fmtPct(after.winRate * 100)}
        sub={`${after.trades} صفقة`}
        tone={after.winRate >= 0.5 ? "good" : "bad"}
        icon={<BrainCircuit className="w-3 h-3" />}
      />
      <KpiCard
        label="أثر التعلم"
        value={`${diff >= 0 ? "+" : ""}${Math.round(diff * 10) / 10}%`}
        sub={improved ? "التعلم حسّن الأداء" : "فروق ضمن حدود العينة"}
        tone={diff > 1 ? "good" : diff < -1 ? "bad" : "neutral"}
        icon={improved ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
      />
      <KpiCard
        label="عامل الربح"
        value={String(after.profitFactor)}
        sub={`قبل: ${before.profitFactor}`}
        tone={after.profitFactor >= 1.3 ? "good" : after.profitFactor >= 1 ? "neutral" : "bad"}
        icon={<BarChart3 className="w-3 h-3" />}
      />
      <KpiCard
        label="توقع الصفقة"
        value={`${after.expectancyR}R`}
        sub={`قبل: ${before.expectancyR}R`}
        tone={after.expectancyR > 0 ? "good" : "bad"}
        icon={<Activity className="w-3 h-3" />}
      />
      <KpiCard
        label="أقصى تراجع"
        value={`${after.maxDrawdownR}R`}
        sub={`أفضل سلسلة: ${after.bestStreak} فوز`}
        tone="neutral"
        icon={<ShieldAlert className="w-3 h-3" />}
      />
    </div>
  );
}

function EquityChart({ equity }: { equity: number[] }) {
  if (equity.length < 2) {
    return (
      <div className="h-40 flex items-center justify-center text-[11px] text-zinc-300">
        لا صفقات كافية لرسم المنحنى
      </div>
    );
  }
  const W = 600;
  const H = 150;
  const min = Math.min(...equity, 0);
  const max = Math.max(...equity, 1);
  const range = max - min || 1;
  const pts = equity.map((v, i) => {
    const x = (i / (equity.length - 1)) * W;
    const y = H - ((v - min) / range) * (H - 20) - 10;
    return `${Math.round(x * 10) / 10},${Math.round(y * 10) / 10}`;
  });
  const final = equity[equity.length - 1];
  const zeroY = H - ((0 - min) / range) * (H - 20) - 10;
  const positive = final >= 0;

  return (
    <div dir="ltr">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-40" preserveAspectRatio="none">
        <defs>
          <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={positive ? "#f59e0b" : "#f43f5e"} stopOpacity="0.35" />
            <stop offset="100%" stopColor={positive ? "#f59e0b" : "#f43f5e"} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <line x1="0" y1={zeroY} x2={W} y2={zeroY} stroke="#52525b" strokeWidth="1" strokeDasharray="4 4" />
        <polygon points={`0,${H} ${pts.join(" ")} ${W},${H}`} fill="url(#eqGrad)" />
        <polyline
          points={pts.join(" ")}
          fill="none"
          stroke={positive ? "#fbbf24" : "#fb7185"}
          strokeWidth="2"
          strokeLinejoin="round"
        />
      </svg>
      <div className="flex items-center justify-between text-[10px] text-zinc-300 mt-1">
        <span>بداية فترة الاختبار</span>
        <span className={cn("tabular-nums", positive ? "text-amber-300" : "text-rose-400")}>
          الناتج التراكمي: {Math.round(final * 100) / 100}R
        </span>
        <span>الآن</span>
      </div>
    </div>
  );
}

function StrategyTable({ strategies }: { strategies: BtStrategy[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="text-zinc-400 border-b border-zinc-800">
            <th className="text-right py-2 pr-2 font-medium">الاستراتيجية</th>
            <th className="text-right py-2 font-medium">العمود</th>
            <th className="py-2 font-medium">صفقات</th>
            <th className="py-2 font-medium">فوز</th>
            <th className="py-2 font-medium">نسبة الفوز</th>
            <th className="py-2 font-medium">متوسط R</th>
            <th className="py-2 font-medium">عامل الربح</th>
            <th className="py-2 font-medium">أثر التعلم</th>
          </tr>
        </thead>
        <tbody>
          {strategies.map((s) => {
            const wr = s.winRate;
            const mult = s.multiplier;
            return (
              <tr key={s.key} className="border-b border-zinc-800/50 hover:bg-zinc-900/40">
                <td className="py-2 pr-2 text-zinc-300">{s.nameAr}</td>
                <td className="py-2 text-zinc-400">{s.pillarAr}</td>
                <td className="py-2 text-center tabular-nums text-zinc-400">{s.trades}</td>
                <td className="py-2 text-center tabular-nums text-zinc-400">{s.wins}</td>
                <td className="py-2 text-center">
                  <span
                    className={cn(
                      "tabular-nums font-bold",
                      wr >= 55 ? "text-emerald-400" : wr >= 45 ? "text-amber-300" : "text-rose-400"
                    )}
                  >
                    {fmtPct(wr)}
                  </span>
                </td>
                <td
                  className={cn(
                    "py-2 text-center tabular-nums",
                    s.avgR > 0 ? "text-emerald-400/80" : "text-rose-400/80"
                  )}
                >
                  {s.avgR}
                </td>
                <td className="py-2 text-center tabular-nums text-zinc-400">{s.profitFactor}</td>
                <td className="py-2 text-center">
                  {mult > 1.03 ? (
                    <span className="text-emerald-400 font-bold tabular-nums" dir="ltr">
                      ×{mult} ↑
                    </span>
                  ) : mult < 0.97 ? (
                    <span className="text-rose-400 font-bold tabular-nums" dir="ltr">
                      ×{mult} ↓
                    </span>
                  ) : (
                    <span className="text-zinc-400 tabular-nums" dir="ltr">
                      ×1.00
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function WeightsBars({ base, learned }: { base: Record<string, number>; learned: Record<string, number> }) {
  return (
    <div className="flex flex-col gap-2.5">
      {PILLAR_ORDER.map((k) => {
        const b = base[k] ?? 0;
        const l = learned[k] ?? b;
        const up = l > b + 0.05;
        const down = l < b - 0.05;
        return (
          <div key={k}>
            <div className="flex items-center justify-between text-[10px] mb-1">
              <span className="text-zinc-400">{PILLAR_AR[k]}</span>
              <span className="tabular-nums" dir="ltr">
                <span className="text-zinc-400">{b}</span>
                <span className="text-zinc-700"> → </span>
                <span className={up ? "text-emerald-400 font-bold" : down ? "text-rose-400 font-bold" : "text-zinc-300"}>
                  {l}
                </span>
                {up && <ArrowUpRight className="w-3 h-3 inline text-emerald-400" />}
                {down && <ArrowDownRight className="w-3 h-3 inline text-rose-400" />}
              </span>
            </div>
            <div className="relative h-2.5 rounded-full bg-zinc-800/70 overflow-hidden">
              {/* الأساسي */}
              <div className="absolute inset-y-0 left-0 bg-zinc-700/80 rounded-full" style={{ width: `${b}%` }} />
              {/* المتعلم */}
              <div
                className={cn(
                  "absolute inset-y-0 left-0 rounded-full bg-gradient-to-l",
                  up ? "from-emerald-500 to-emerald-400" : down ? "from-rose-500 to-rose-400" : "from-amber-500 to-yellow-400"
                )}
                style={{ width: `${l}%`, opacity: 0.85 }}
              />
            </div>
          </div>
        );
      })}
      <p className="text-[9px] text-zinc-300 mt-1">
        الشريط الرمادي = الوزن الأساسي (من البحث) — الشريط الملون = الوزن بعد التدريب على الشموع التاريخية (مجموع
        100)
      </p>
    </div>
  );
}

function MonthsCards({ months }: { months: BtMonth[] }) {
  if (!months.length) return null;
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {months.map((m, i) => {
        const up = m.changePct >= 0;
        const isCurrent = i === months.length - 1;
        return (
          <div
            key={m.ym}
            className={cn(
              "rounded-xl border p-3",
              isCurrent ? "border-amber-500/40 bg-amber-500/[0.05]" : "border-zinc-800 bg-zinc-900/50"
            )}
          >
            <div className="flex items-center justify-between mb-2">
              <span className={cn("text-xs font-bold", isCurrent ? "text-amber-300" : "text-zinc-300")}>
                {m.label} {isCurrent && "· الشهر الحالي"}
              </span>
              <span
                className={cn("text-[11px] font-bold tabular-nums flex items-center gap-0.5", up ? "text-emerald-400" : "text-rose-400")}
                dir="ltr"
              >
                {up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                {up ? "+" : ""}
                {m.changePct}%
              </span>
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] text-zinc-300">
              <span>
                افتتاح: <span className="text-zinc-300 tabular-nums">{m.open}</span>
              </span>
              <span>
                إغلاق: <span className="text-zinc-300 tabular-nums">{m.close}</span>
              </span>
              <span>
                الأعلى: <span className="text-emerald-500/80 tabular-nums">{m.high}</span>
              </span>
              <span>
                الأدنى: <span className="text-rose-500/80 tabular-nums">{m.low}</span>
              </span>
              <span>
                تقلب يومي: <span className="text-zinc-300 tabular-nums">{m.atrAvg}$</span>
              </span>
              <span>
                صفقات البوت:{" "}
                <span className="text-zinc-300 tabular-nums">
                  {m.trades} (فوز {fmtPct(m.wr)})
                </span>
              </span>
            </div>
            <div className="mt-2 text-[10px] text-zinc-300 flex items-center gap-1.5">
              <CalendarRange className="w-3 h-3" />
              الميل الغالب:{" "}
              <span className={m.dominant === "BUY" ? "text-emerald-400/80" : m.dominant === "SELL" ? "text-rose-400/80" : "text-zinc-400"}>
                {m.dominant === "BUY" ? "شراء" : m.dominant === "SELL" ? "بيع" : "متوازن"}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TradesTable({ trades }: { trades: BtTrade[] }) {
  if (!trades.length) return null;
  return (
    <div className="overflow-x-auto max-h-[340px] overflow-y-auto">
      <table className="w-full text-[11px]">
        <thead className="sticky top-0 bg-[#101013]">
          <tr className="text-zinc-400 border-b border-zinc-800">
            <th className="text-right py-2 pr-2 font-medium">وقت الإشارة</th>
            <th className="py-2 font-medium">الاتجاه</th>
            <th className="text-right py-2 font-medium">الاستراتيجيات المتفقة</th>
            <th className="py-2 font-medium">دخول</th>
            <th className="py-2 font-medium">وقف</th>
            <th className="py-2 font-medium">هدف</th>
            <th className="py-2 font-medium">النتيجة</th>
            <th className="py-2 font-medium">R</th>
          </tr>
        </thead>
        <tbody>
          {trades.slice(0, 14).map((t, i) => (
            <tr key={i} className="border-b border-zinc-800/50 hover:bg-zinc-900/40">
              <td className="py-2 pr-2 text-zinc-400 tabular-nums whitespace-nowrap" dir="ltr">
                {new Date(t.t).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}{" "}
                {new Date(t.t).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
              </td>
              <td className="py-2 text-center">
                <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded", t.dir === "BUY" ? "text-emerald-400 bg-emerald-500/10" : "text-rose-400 bg-rose-500/10")}>
                  {t.dir === "BUY" ? "شراء" : "بيع"}
                </span>
              </td>
              <td className="py-2 text-zinc-400 text-[10px] max-w-[220px] truncate">{t.strategies.join(" + ")}</td>
              <td className="py-2 text-center tabular-nums text-zinc-300">{t.entry}</td>
              <td className="py-2 text-center tabular-nums text-rose-400/70">{t.sl}</td>
              <td className="py-2 text-center tabular-nums text-emerald-400/70">{t.tp1}</td>
              <td className="py-2 text-center">
                {t.result === "win" ? (
                  <span className="flex items-center justify-center gap-1 text-emerald-400">
                    <CheckCircle2 className="w-3 h-3" /> فوز
                  </span>
                ) : t.result === "loss" ? (
                  <span className="flex items-center justify-center gap-1 text-rose-400">
                    <XCircle className="w-3 h-3" /> خسارة
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-1 text-zinc-400">
                    <MinusCircle className="w-3 h-3" /> خروج زمني
                  </span>
                )}
              </td>
              <td className={cn("py-2 text-center tabular-nums font-bold", t.r > 0 ? "text-emerald-400" : "text-rose-400")}>
                {t.r > 0 ? "+" : ""}
                {t.r}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function BacktestPanel({
  result,
  running,
  error,
  onRun,
  mode,
  applied,
}: {
  result: BacktestResult | null;
  running: boolean;
  error: string | null;
  onRun: (tf: "15m" | "1h") => void;
  mode: "scalping" | "day";
  applied: boolean;
}) {
  const tf = mode === "scalping" ? "15m" : "1h";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-zinc-800 bg-[#101013] p-4"
    >
      {/* الترويسة */}
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400/20 to-yellow-600/20 border border-amber-500/30 flex items-center justify-center">
            <BrainCircuit className="w-4.5 h-4.5 text-amber-400" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-zinc-200 flex items-center gap-2">
              وضع التدريب الذاتي (Walk-Forward)
              {applied && (
                <Badge variant="outline" className="text-[9px] border-emerald-500/40 bg-emerald-500/10 text-emerald-400 gap-1">
                  <Trophy className="w-2.5 h-2.5" /> مطبّق على التحليل المباشر
                </Badge>
              )}
            </h2>
            <p className="text-[10px] text-zinc-300">
              البوت يجرب استراتيجياته على شموع هذا الشهر + السابق دون رؤية النتائج، ثم يتحقق ويقوّي أوزانه
            </p>
          </div>
        </div>
        <Button
          onClick={() => onRun(tf)}
          disabled={running}
          className="bg-gradient-to-l from-amber-500 to-yellow-600 hover:from-amber-400 hover:to-yellow-500 text-zinc-900 font-bold text-xs gap-2"
          size="sm"
        >
          <Play className={cn("w-3.5 h-3.5", running && "animate-pulse")} />
          {running
            ? "جاري التدريب على الشموع التاريخية…"
            : result
              ? `أعد التدريب (${tf === "1h" ? "إطار الساعة" : "إطار 15 دقيقة"})`
              : `درّب البوت على الشهرين الماضيين (${tf === "1h" ? "ساعة" : "15 دقيقة"})`}
        </Button>
      </div>

      {/* شرح البروتوكول */}
      <details className="mb-4" open={!result}>
        <summary className="text-[11px] text-zinc-300 cursor-pointer select-none mb-2">
          كيف يتدرب البوت؟ (بروتوكول بلا نظرة مستقبلية)
        </summary>
        <div className="grid gap-1.5 text-[11px] text-zinc-300 bg-zinc-900/40 border border-zinc-800/60 rounded-lg p-3 leading-relaxed">
          <p>
            <span className="text-amber-300 font-bold">1) المحاولة:</span> عند كل شمعة تاريخية يصدر البوت قراره
            بقراءة المؤشرات المحسوبة من الشموع السابقة فقط — يستحيل عليه رؤية ما سيحدث.
          </p>
          <p>
            <span className="text-amber-300 font-bold">2) التحقق:</span> يدخل على افتتاح الشمعة التالية ثم يتابع:
            هل وصل الهدف 1R أم ضرب الوقف؟ (بافتراض متحفظ: الوقف أولوية عند لمسهما بنفس الشمعة).
          </p>
          <p>
            <span className="text-amber-300 font-bold">3) التقوية:</span> وزن كل عمود يتعدل بمضاعف اشتقاقي من حد
            ثقة Wilson السفلي لنسبة الفوز — الاستراتيجية الفائزة تزيد ثقلها والخاسرة تخف.
          </p>
          <p>
            <span className="text-amber-300 font-bold">4) الاختبار الصادق:</span> يتعلم على أول 70% من الفترة ثم
            يُختبر على آخر 30% لم يرها إطلاقاً — المقارنة (قبل/بعد) أدناه من هذه الفترة غير المرئية.
          </p>
          <p>
            <span className="text-amber-300 font-bold">5) التطبيق:</span> الأوزان الناتجة تُطبق فوراً على التحليل
            المباشر في الأعلى — لذلك تتحسن جودة التوقعات كلما تكرر التدريب.
          </p>
        </div>
      </details>

      {error && (
        <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-[11px] text-rose-200 mb-3">
          {error}
        </div>
      )}

      {running && !result && (
        <div className="grid grid-cols-4 gap-2 mb-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-16 rounded-xl bg-zinc-900/60 animate-pulse" style={{ animationDelay: `${i * 120}ms` }} />
          ))}
        </div>
      )}

      {result && (
        <div className="flex flex-col gap-4">
          {/* معلومات الفترة */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-zinc-300">
            <span className="flex items-center gap-1">
              <CalendarRange className="w-3 h-3" />
              الفترة: <span className="text-zinc-400" dir="ltr">
                {new Date(result.from).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })} →{" "}
                {new Date(result.to).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" })}
              </span>
            </span>
            <span>
              شموع مفحوصة: <span className="text-zinc-300 tabular-nums">{result.candlesTested.toLocaleString("en-US")}</span>
            </span>
            <span>
              تعلم حتى:{" "}
              <span className="text-zinc-400" dir="ltr">
                {new Date(result.testFrom).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
              </span>{" "}
              ثم اختبار غير مرئي حتى النهاية
            </span>
            <span>
              الإطار: {result.tf === "1h" ? "ساعة (تداول يومي)" : "15 دقيقة (سكالبينج)"} · أقصى احتجاز:{" "}
              {result.holdBars} شمعة
            </span>
          </div>

          {/* KPIs */}
          <StatsCompare before={result.statsBefore} after={result.statsAfter} />

          {/* منحنى + الأوزان */}
          <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
              <h3 className="text-[11px] font-bold text-zinc-400 mb-2 flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-amber-400/80" />
                منحنى الأداء التراكمي (فترة الاختبار — بعد التعلم) بوحدات المخاطرة R
              </h3>
              <EquityChart equity={result.equity} />
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
              <h3 className="text-[11px] font-bold text-zinc-400 mb-3 flex items-center gap-1.5">
                <BarChart3 className="w-3.5 h-3.5 text-amber-400/80" />
                أوزان الأعمدة: قبل ← بعد التدريب
              </h3>
              <WeightsBars base={result.weights.base} learned={result.weights.learnedLive} />
            </div>
          </div>

          {/* الاستراتيجيات */}
          <div>
            <h3 className="text-[11px] font-bold text-zinc-400 mb-2 flex items-center gap-1.5">
              <Target className="w-3.5 h-3.5 text-amber-400/80" />
              أداء كل استراتيجية على كامل الفترة (9 استراتيجيات)
            </h3>
            <StrategyTable strategies={result.strategies} />
          </div>

          {/* تحليل الشهور */}
          <div>
            <h3 className="text-[11px] font-bold text-zinc-400 mb-2 flex items-center gap-1.5">
              <CalendarRange className="w-3.5 h-3.5 text-amber-400/80" />
              تحليل الشموع الشهرية — هذا الشهر والسابقان
            </h3>
            <MonthsCards months={result.months} />
          </div>

          {/* آخر الصفقات */}
          <div>
            <h3 className="text-[11px] font-bold text-zinc-400 mb-2 flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-amber-400/80" />
              آخر صفقات البوت التدريبية (الأحدث أولاً) — الإشارة صدرت قبل رؤية النتيجة
            </h3>
            <TradesTable trades={result.trades} />
          </div>

          {/* ملاحظات */}
          <ul className="text-[10px] text-zinc-300 leading-relaxed border-t border-zinc-800/60 pt-2 flex flex-col gap-1">
            {result.notes.map((n, i) => (
              <li key={i}>• {n}</li>
            ))}
            <li className="text-rose-400/70">
              • تنبيه صادق: نتائج الباك-تيست على البيانات التاريخية لا تضمن الأرباح المستقبلية — استخدمها لتحسين
              الانتظام وليس كوعد ربح.
            </li>
          </ul>
        </div>
      )}
    </motion.div>
  );
}
