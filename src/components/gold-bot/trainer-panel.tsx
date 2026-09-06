"use client";

// ============================================================
// لوحة التدريب الذاتي العميق — 6 أشهر
// تجسيد حرفي لطلب المستخدم:
//   يتنبأ دون رؤية النتيجة ← يكشفها ← يتحقق ← يفسّر لنفسه
//   لماذا أصاب/أخطأ ← يعدّل أوزانه ← يعيد الحلقة
// ============================================================

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BrainCircuit,
  Play,
  Pause,
  RotateCcw,
  Eye,
  EyeOff,
  Trophy,
  Target,
  GraduationCap,
  Lightbulb,
  ShieldCheck,
  DatabaseBackup,
  Zap,
  Activity,
  TrendingUp,
  TrendingDown,
  MinusCircle,
  CalendarRange,
  Gauge,
  FlaskConical,
  AlertTriangle,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import type { SelfTrainingResult, TrainTimelineEntry } from "@/lib/engine/selftrainer";

const SPEEDS = [
  { label: "بطيء", ms: 1600 },
  { label: "عادي", ms: 750 },
  { label: "سريع", ms: 300 },
  { label: "فوري", ms: 90 },
];

const EPOCH_OPTIONS = [2, 3, 4, 5, 6, 8];

function levelStyle(label: string): string {
  switch (label) {
    case "خبير متدرّب جداً":
      return "border-emerald-500/50 bg-emerald-500/10 text-emerald-300";
    case "متدرب متقدم":
      return "border-emerald-500/40 bg-emerald-500/10 text-emerald-400";
    case "متدرب جيداً":
      return "border-amber-500/40 bg-amber-500/10 text-amber-300";
    case "متدرب":
      return "border-amber-500/30 bg-amber-500/5 text-amber-400/90";
    default:
      return "border-zinc-700 bg-zinc-800/50 text-zinc-400";
  }
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
          : "text-zinc-100";
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3">
      <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 mb-1">
        {icon}
        {label}
      </div>
      <div className={cn("text-lg font-black tabular-nums leading-none", toneCls)} dir="ltr">
        {value}
      </div>
      {sub && <div className="text-[9px] text-zinc-600 mt-1">{sub}</div>}
    </div>
  );
}

/** شريط تقدم أفقي صغير */
function MiniBar({ pct, tone = "gold" }: { pct: number; tone?: "gold" | "good" | "bad" | "zinc" }) {
  const cls =
    tone === "good"
      ? "bg-emerald-500"
      : tone === "bad"
        ? "bg-rose-500"
        : tone === "zinc"
          ? "bg-zinc-600"
          : "bg-amber-400";
  return (
    <div className="h-1.5 w-full rounded-full bg-zinc-800 overflow-hidden">
      <div className={cn("h-full rounded-full transition-all duration-500", cls)} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
    </div>
  );
}

const RUNNING_STEPS = [
  "يجمع شموع 6 أشهر من السوق…",
  "يمشي شمعة شمعة — يتنبأ دون رؤية النتيجة…",
  "يكشف النتيجة ويتحقق: أصاب أم أخطأ؟",
  "يحلل أخطاءه ويكتب لنفسه الدروس…",
  "يعدّل أوزان استراتيجياته ويكرر الحلقة…",
  "يجري الاختبار الأعمى النهائي على فترة لم يرها…",
];

function RunningIndicator() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setStep((s) => (s + 1) % RUNNING_STEPS.length), 2200);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="flex flex-col gap-3 py-8 items-center justify-center text-center">
      <div className="relative w-14 h-14">
        <div className="absolute inset-0 rounded-full border-2 border-zinc-800" />
        <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-amber-400 animate-spin" />
        <BrainCircuit className="absolute inset-0 m-auto w-6 h-6 text-amber-400" />
      </div>
      <AnimatePresence mode="wait">
        <motion.p
          key={step}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          className="text-sm text-zinc-300"
        >
          {RUNNING_STEPS[step]}
        </motion.p>
      </AnimatePresence>
      <p className="text-[10px] text-zinc-600">حلقة التدريب تعمل على الخادم — عادةً أقل من 15 ثانية</p>
    </div>
  );
}

// ============================================================
// المشغل التفاعلي: تنبؤ أعمى ← كشف النتيجة ← تفسير ذاتي
// ============================================================
function Playback({ timeline }: { timeline: TrainTimelineEntry[] }) {
  const [idx, setIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [speedMs, setSpeedMs] = useState(750);

  const entry = timeline[idx];
  const total = timeline.length;

  useEffect(() => {
    if (!playing || !entry) return;
    const t = setTimeout(() => {
      if (!revealed) setRevealed(true);
      else if (idx + 1 >= total) setPlaying(false);
      else {
        setIdx((i) => i + 1);
        setRevealed(false);
      }
    }, speedMs);
    return () => clearTimeout(t);
  }, [playing, revealed, idx, speedMs, total, entry]);

  const jump = (i: number) => {
    setPlaying(false);
    setIdx(i);
    setRevealed(true);
  };

  if (!entry) return null;

  return (
    <div className="rounded-xl border border-zinc-800 bg-gradient-to-b from-zinc-900/80 to-zinc-950/80 p-4 flex flex-col gap-3">
      {/* أدوات التحكم */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => {
              if (idx + 1 >= total && revealed) jump(0);
              setPlaying((p) => !p);
            }}
            className="h-8 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold gap-1.5"
          >
            {playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            {playing ? "إيقاف" : "شاهد تدربه"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => jump(0)}
            className="h-8 border-zinc-700 text-zinc-400 hover:text-amber-300 gap-1.5"
          >
            <RotateCcw className="w-3 h-3" /> من البداية
          </Button>
          <div className="flex items-center gap-1 text-[10px] text-zinc-500">
            <FlaskConical className="w-3 h-3 text-amber-400/80" />
            <span dir="ltr">{idx + 1} / {total}</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Gauge className="w-3 h-3 text-zinc-500" />
          <Select value={String(speedMs)} onValueChange={(v) => setSpeedMs(Number(v))}>
            <SelectTrigger className="h-7 w-[92px] text-[10px] border-zinc-700 bg-zinc-900 text-zinc-300">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="border-zinc-800 bg-zinc-900 text-zinc-300">
              {SPEEDS.map((s) => (
                <SelectItem key={s.ms} value={String(s.ms)} className="text-[11px]">
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* شريط التقدم */}
      <Slider
        value={[idx]}
        min={0}
        max={Math.max(0, total - 1)}
        step={1}
        onValueChange={(v) => jump(v[0])}
        className="cursor-pointer"
      />

      {/* بطاقة التوقع الحالي */}
      <AnimatePresence mode="wait">
        <motion.div
          key={`${idx}-${revealed}`}
          initial={{ opacity: 0, y: 10, scale: 0.99 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.22 }}
          className={cn(
            "rounded-xl border p-4 flex flex-col gap-3",
            !revealed
              ? "border-amber-500/30 bg-amber-500/[0.04]"
              : entry.result === "win"
                ? "border-emerald-500/30 bg-emerald-500/[0.04]"
                : entry.result === "loss"
                  ? "border-rose-500/30 bg-rose-500/[0.04]"
                  : "border-zinc-700 bg-zinc-900/40"
          )}
        >
          {/* الرأس: التاريخ + المرحلة */}
          <div className="flex items-center justify-between flex-wrap gap-1.5">
            <span className="text-[11px] text-zinc-400 font-medium" dir="ltr">{entry.dateLabel}</span>
            <div className="flex items-center gap-1.5">
              <Badge
                variant="outline"
                className={cn(
                  "text-[9px] px-1.5 py-0",
                  entry.phase === "holdout"
                    ? "border-emerald-500/40 text-emerald-400 bg-emerald-500/5"
                    : "border-zinc-700 text-zinc-500"
                )}
              >
                {entry.phase === "holdout" ? "اختبار أعمى — لم يرها إطلاقاً" : "مرحلة التعلم"}
              </Badge>
              {entry.eventDay && (
                <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-rose-500/40 text-rose-300 bg-rose-500/5">
                  {entry.eventDay}
                </Badge>
              )}
            </div>
          </div>

          {/* الطور الأول: التنبؤ الأعمى */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              {!revealed && <EyeOff className="w-4 h-4 text-amber-400" />}
              {revealed && <Eye className="w-4 h-4 text-zinc-500" />}
              <span
                className={cn(
                  "text-sm font-black px-2.5 py-1 rounded-lg",
                  entry.dir === "BUY"
                    ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                    : "bg-rose-500/15 text-rose-400 border border-rose-500/30"
                )}
              >
                {entry.dir === "BUY" ? "شراء BUY" : "بيع SELL"}
              </span>
            </div>
            <span className="text-[11px] text-zinc-500" dir="ltr">
              دخول <b className="text-zinc-300">${entry.entry}</b> · وقف <b className="text-rose-300">${entry.sl}</b> · هدف <b className="text-emerald-300">${entry.tp1}</b>
            </span>
            <div className="flex items-center gap-1.5 min-w-[120px] flex-1 max-w-[180px]">
              <span className="text-[9px] text-zinc-600 shrink-0">ثقة {entry.confidence}%</span>
              <MiniBar pct={entry.confidence} tone="gold" />
            </div>
          </div>

          {/* الاستراتيجيات المتفقة */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {entry.agreeing.slice(0, 4).map((s, k) => (
              <Badge key={k} variant="outline" className="text-[9px] px-1.5 py-0 border-amber-500/25 text-amber-300/90 bg-amber-500/5">
                {s}
              </Badge>
            ))}
            {entry.disagreeing.length > 0 && (
              <span className="text-[9px] text-zinc-600">
                معارضة: {entry.disagreeing.slice(0, 2).join("، ")}
              </span>
            )}
          </div>

          {/* الطور الثاني: الكشف + التفسير الذاتي */}
          <AnimatePresence>
            {revealed && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden flex flex-col gap-2.5"
              >
                <div className="flex items-center gap-2 flex-wrap border-t border-zinc-800/70 pt-2.5">
                  {entry.result === "win" && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                  {entry.result === "loss" && <XCircle className="w-4 h-4 text-rose-400" />}
                  {entry.result === "timeout" && <MinusCircle className="w-4 h-4 text-zinc-400" />}
                  <span
                    className={cn(
                      "text-xs font-bold",
                      entry.result === "win" ? "text-emerald-400" : entry.result === "loss" ? "text-rose-400" : "text-zinc-400"
                    )}
                  >
                    {entry.result === "win" ? "النتيجة: هدف تحقق ✓" : entry.result === "loss" ? "النتيجة: اصطدام الوقف ✗" : "النتيجة: انتهاء المدة"}
                  </span>
                  <span className="text-[11px] text-zinc-500 tabular-nums" dir="ltr">
                    {entry.r >= 0 ? "+" : ""}{entry.r}R · خروج ${entry.exitPrice} · {entry.bars} شمعة
                  </span>
                  <span className="text-[10px] text-zinc-600">{entry.regimeAr}</span>
                </div>
                <div className="rounded-lg bg-zinc-950/60 border border-zinc-800/60 p-3">
                  <div className="flex items-center gap-1.5 text-[10px] text-amber-400/80 mb-1.5">
                    <BrainCircuit className="w-3.5 h-3.5" />
                    تفسير البوت لنفسه
                  </div>
                  <p className="text-[12px] leading-relaxed text-zinc-300">{entry.explanation}</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {!revealed && (
            <div className="flex items-center gap-2 text-[11px] text-amber-400/70 border-t border-zinc-800/70 pt-2.5">
              <EyeOff className="w-3.5 h-3.5" />
              النتيجة مخفية — البوت التقط الإشارة من البيانات السابقة فقط… انتظر الكشف
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* شريط النتائج المصغّر */}
      <div className="flex items-center gap-1 flex-wrap">
        {timeline.slice(Math.max(0, idx - 8), idx).map((e, k) => (
          <ResultChip key={`${e.t}-${k}`} entry={e} />
        ))}
        <span
          className={cn(
            "w-5 h-5 rounded-md grid place-items-center text-[9px] font-black",
            entry.dir === "BUY" ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400"
          )}
        >
          {idx + 1}
        </span>
      </div>
      <p className="text-[9px] text-zinc-600">
        كل خطوة = توقع حقيقي سابق بترتيب زمني. {timeline.filter((e) => e.phase === "holdout").length} منها ضمن فترة الاختبار الأعمى (بأوزان لم تتعرض لبياناتها إطلاقاً).
      </p>
    </div>
  );
}

function ResultChip({ entry }: { entry: TrainTimelineEntry }) {
  const cls =
    entry.result === "win"
      ? "bg-emerald-500/25 text-emerald-500"
      : entry.result === "loss"
        ? "bg-rose-500/25 text-rose-500"
        : "bg-zinc-700/50 text-zinc-500";
  return (
    <span className={cn("w-5 h-5 rounded-md grid place-items-center text-[9px]", cls)} title={entry.dateLabel}>
      {entry.result === "win" ? "✓" : entry.result === "loss" ? "✗" : "–"}
    </span>
  );
}

// ============================================================
// المكون الرئيسي: لوحة التدريب الذاتي
// ============================================================
export function TrainerPanel({
  result,
  running,
  error,
  onRun,
  applied,
  persistedAt,
}: {
  result: SelfTrainingResult | null;
  running: boolean;
  error: string | null;
  onRun: (epochs: number) => void;
  applied: boolean;
  persistedAt?: string | null;
}) {
  const [epochs, setEpochs] = useState(4);

  const holdoutHold = result?.holdout;
  const lastVsFirst = useMemo(() => {
    if (!result || result.epochLog.length < 2) return null;
    const first = result.epochLog[0].winRate;
    const last = result.epochLog[result.epochLog.length - 1].winRate;
    return { first, last, delta: Math.round((last - first) * 10) / 10 };
  }, [result]);

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-950/60 overflow-hidden">
      {/* ===== الترويسة ===== */}
      <div className="border-b border-zinc-800/80 bg-gradient-to-l from-amber-500/[0.07] via-transparent to-transparent p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-yellow-600 grid place-items-center shrink-0 shadow-lg shadow-amber-500/20">
              <BrainCircuit className="w-5 h-5 text-zinc-900" />
            </div>
            <div>
              <h2 className="text-base font-black text-zinc-50 leading-tight">
                حلقة التدريب الذاتي العميق — 6 أشهر
              </h2>
              <p className="text-[11px] text-zinc-500 mt-0.5 leading-relaxed max-w-xl">
                يتنبأ على كل شمعة تاريخية <b className="text-amber-400/90">دون رؤية النتيجة</b> ← يكشفها ويتحقق ←
                يفسّر لنفسه لماذا أصاب أو أخطأ ← يعدّل أوزان استراتيجياته ← ويعيد الحلقة حتى يستقر
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {result && (
              <Badge variant="outline" className={cn("text-[10px] gap-1 px-2 py-1", levelStyle(result.trainingLevel.label))}>
                <GraduationCap className="w-3.5 h-3.5" />
                {result.trainingLevel.label} · {result.trainingLevel.score}/100
              </Badge>
            )}
            {persistedAt && !running && (
              <Badge
                variant="outline"
                className="text-[10px] border-amber-500/40 text-amber-400 bg-amber-500/5 gap-1"
                title={`آخر تدريب محفوظ: ${new Date(persistedAt).toLocaleString("ar-EG")} — البوت يتذكر تدريبه حتى بعد إعادة تشغيل الخادم أو النشر`}
              >
                <DatabaseBackup className="w-3 h-3" />
                مدرب ومحفوظ · {result?.epochsRun ?? 0} حلقة · {result?.blindStats.trades ?? 0} توقعاً أعمى
              </Badge>
            )}
            {applied && (
              <Badge variant="outline" className="text-[10px] border-emerald-500/40 text-emerald-400 bg-emerald-500/5 gap-1">
                <ShieldCheck className="w-3 h-3" /> الأوزان مطبقة على الإشارة الحية
              </Badge>
            )}
          </div>
        </div>

        {/* أدوات التشغيل */}
        <div className="flex items-center gap-2 mt-4 flex-wrap">
          <Select value={String(epochs)} onValueChange={(v) => setEpochs(Number(v))}>
            <SelectTrigger className="h-9 w-[130px] text-xs border-zinc-700 bg-zinc-900 text-zinc-300" disabled={running}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="border-zinc-800 bg-zinc-900 text-zinc-300">
              {EPOCH_OPTIONS.map((n) => (
                <SelectItem key={n} value={String(n)} className="text-xs">
                  {n} {n === 2 ? "حلقتان" : "حلقات"} تعلم
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            onClick={() => onRun(epochs)}
            disabled={running}
            className="h-9 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold gap-2"
          >
            <Zap className="w-4 h-4" />
            {running ? "يتدرب الآن…" : result ? "أعد التدريب" : "ابدأ تدريب البوت"}
          </Button>
          {result && (
            <span className="text-[10px] text-zinc-600" dir="ltr">
              {result.window.candles.toLocaleString("en-US")} شمعة · {new Date(result.window.from).toLocaleDateString("ar-EG", { month: "short", day: "numeric" })} ←{" "}
              {new Date(result.window.to).toLocaleDateString("ar-EG", { month: "short", day: "numeric" })} · {result.tf === "1h" ? "فريم الساعة" : "فريم يومي"}
            </span>
          )}
        </div>
      </div>

      {/* ===== الجسم ===== */}
      <div className="p-4 sm:p-5 flex flex-col gap-5">
        {running && <RunningIndicator />}

        {error && !running && (
          <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
            <Button size="sm" variant="outline" onClick={() => onRun(epochs)} className="mr-auto h-7 border-rose-500/40 text-rose-300 hover:bg-rose-500/10">
              إعادة المحاولة
            </Button>
          </div>
        )}

        {!result && !running && !error && (
          <div className="py-10 text-center">
            <BrainCircuit className="w-10 h-10 text-zinc-700 mx-auto mb-3" />
            <p className="text-sm text-zinc-500">البوت لم يتدرب بعد في هذه الجلسة — اضغط «ابدأ تدريب البوت» ليتعلم من 6 أشهر سابقة</p>
          </div>
        )}

        {result && !running && (
          <>
            {/* --- ملخص المعرفة الذاتية --- */}
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.03] p-4">
              <div className="flex items-center gap-1.5 text-[10px] text-amber-400/80 mb-2">
                <BrainCircuit className="w-3.5 h-3.5" />
                ماذا يعرف البوت عن نفسه الآن (ملفه الذاتي)
              </div>
              <p className="text-[13px] leading-relaxed text-zinc-300">{result.selfKnowledge.summary}</p>
            </div>

            {/* --- مؤشرات الأداء --- */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
              <KpiCard
                label="دقة التنبؤ الأعمى (6 أشهر)"
                value={`${result.selfKnowledge.blindAccuracy}%`}
                sub={`${result.selfKnowledge.totalPredictions} توقعاً أعمى`}
                tone={result.selfKnowledge.blindAccuracy >= 55 ? "good" : result.selfKnowledge.blindAccuracy >= 45 ? "neutral" : "bad"}
                icon={<Target className="w-3 h-3" />}
              />
              <KpiCard
                label="الاختبار الأعمى — بعد التدريب"
                value={`${result.holdout.winRateAfter}%`}
                sub={`قبل التدريب: ${result.holdout.winRateBefore}%`}
                tone={result.holdout.improvementPct > 0 ? "good" : "neutral"}
                icon={<FlaskConical className="w-3 h-3" />}
              />
              <KpiCard
                label="أثر التعلم (خارج العينة)"
                value={`${result.holdout.improvementPct >= 0 ? "+" : ""}${result.holdout.improvementPct}%`}
                sub="على بيانات لم ترها حلقات التعلم"
                tone={result.holdout.improvementPct > 3 ? "good" : result.holdout.improvementPct < -3 ? "bad" : "neutral"}
                icon={<TrendingUp className="w-3 h-3" />}
              />
              <KpiCard
                label="معامل الربح PF"
                value={String(result.blindStats.profitFactor)}
                sub={`توقع الصفقة: ${result.blindStats.expectancyR}R`}
                tone={result.blindStats.profitFactor >= 1.15 ? "good" : result.blindStats.profitFactor >= 1 ? "neutral" : "bad"}
                icon={<Activity className="w-3 h-3" />}
              />
              <KpiCard
                label="حلقات التعلم المنجزة"
                value={String(result.epochsRun)}
                sub={result.converged ? "استقر التعلم مبكراً" : `المطلوبة: ${result.requestedEpochs}`}
                tone="gold"
                icon={<RotateCcw className="w-3 h-3" />}
              />
              <KpiCard
                label="الدروس المستخلصة"
                value={String(result.lessons.length)}
                sub="قواعد يضبط بها أوزانه"
                tone="gold"
                icon={<Lightbulb className="w-3 h-3" />}
              />
            </div>

            {/* --- مستوى التدريب --- */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-zinc-300 flex items-center gap-1.5">
                  <GraduationCap className="w-4 h-4 text-amber-400" />
                  مستوى تدريب البوت
                </span>
                <span className="text-[11px] text-zinc-500" dir="ltr">{result.trainingLevel.score}/100</span>
              </div>
              <MiniBar pct={result.trainingLevel.score} tone={result.trainingLevel.score >= 68 ? "good" : "gold"} />
              <p className="text-[10px] text-zinc-600 mt-2">
                الدرجة = عدد الحلقات + تحسن الاختبار الأعمى + معايرة الثقة + تغطية التوقعات + الدروس. ترفع الدرجة بإعادة التدريب بعدد حلقات أكبر.
              </p>
            </div>

            {/* --- مشغل التدريب التفاعلي --- */}
            <div>
              <h3 className="text-sm font-bold text-zinc-300 mb-2.5 flex items-center gap-2">
                <span className="w-1 h-4 bg-amber-400 rounded-full" />
                شاهد البوت يتدرب خطوة بخطوة (تنبأ ← كشف ← تفسير)
              </h3>
              <Playback timeline={result.timeline} />
            </div>

            {/* --- حلقات التعلم --- */}
            <div>
              <h3 className="text-sm font-bold text-zinc-300 mb-2.5 flex items-center gap-2">
                <span className="w-1 h-4 bg-amber-400 rounded-full" />
                سجل حلقات التعلم
                {lastVsFirst && (
                  <Badge variant="outline" className={cn("text-[9px]", lastVsFirst.delta >= 0 ? "border-emerald-500/40 text-emerald-400" : "border-rose-500/40 text-rose-400")}>
                    من {lastVsFirst.first}% إلى {lastVsFirst.last}% {lastVsFirst.delta >= 0 ? "+" : ""}{lastVsFirst.delta} نقطة
                  </Badge>
                )}
              </h3>
              <div className="flex flex-col gap-2 max-h-72 overflow-y-auto pl-1">
                {result.epochLog.map((e) => (
                  <div key={e.epoch} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3">
                    <div className="flex items-center gap-3 flex-wrap">
                      <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-300 bg-amber-500/5 shrink-0">
                        الحلقة {e.epoch}
                      </Badge>
                      <span className="text-xs font-black tabular-nums text-zinc-200" dir="ltr">
                        دقة {e.winRate}% · {e.trades} توقعاً · PF {e.profitFactor} · {e.grossR >= 0 ? "+" : ""}{e.grossR}R
                      </span>
                      <div className="flex-1 min-w-[80px]">
                        <MiniBar pct={e.winRate} tone={e.winRate >= 55 ? "good" : e.winRate >= 45 ? "gold" : "bad"} />
                      </div>
                    </div>
                    <p className="text-[11px] text-zinc-500 mt-1.5 leading-relaxed">{e.note}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* --- الاختبار الأعمى الصارم --- */}
            {holdoutHold && (
              <div>
                <h3 className="text-sm font-bold text-zinc-300 mb-2.5 flex items-center gap-2">
                  <span className="w-1 h-4 bg-amber-400 rounded-full" />
                  الاختبار الأعمى الصارم — آخر 25% من الفترة (لم يرها البوت إطلاقاً أثناء التعلم)
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <KpiCard label="فوز قبل التدريب" value={`${holdoutHold.winRateBefore}%`} sub={`${holdoutHold.tradesBefore} توقعاً · PF ${holdoutHold.pfBefore}`} tone="neutral" icon={<Target className="w-3 h-3" />} />
                  <KpiCard label="فوز بعد التدريب" value={`${holdoutHold.winRateAfter}%`} sub={`${holdoutHold.tradesAfter} توقعاً · PF ${holdoutHold.pfAfter}`} tone={holdoutHold.improvementPct >= 0 ? "good" : "bad"} icon={<BrainCircuit className="w-3 h-3" />} />
                  <KpiCard label="توقع الصفقة بعد" value={`${holdoutHold.expAfter}R`} sub={`قبل: ${holdoutHold.expBefore}R`} tone={holdoutHold.expAfter > 0 ? "good" : "bad"} icon={<Activity className="w-3 h-3" />} />
                  <KpiCard label="الحكم" value={`${holdoutHold.improvementPct >= 0 ? "+" : ""}${holdoutHold.improvementPct}%`} sub="فرق الفوز خارج العينة" tone={holdoutHold.improvementPct > 3 ? "good" : holdoutHold.improvementPct < -3 ? "bad" : "neutral"} icon={<Trophy className="w-3 h-3" />} />
                </div>
                <p className="text-[11px] text-zinc-500 mt-2 leading-relaxed rounded-lg bg-zinc-900/40 border border-zinc-800/60 p-2.5">
                  {holdoutHold.verdict}
                </p>
              </div>
            )}

            {/* --- الاستراتيجيات ومضاعفاتها --- */}
            <div>
              <h3 className="text-sm font-bold text-zinc-300 mb-2.5 flex items-center gap-2">
                <span className="w-1 h-4 bg-amber-400 rounded-full" />
                كيف قوّى البوت استراتيجياته (المضاعفات المكتسبة)
              </h3>
              <div className="rounded-xl border border-zinc-800 overflow-hidden overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="bg-zinc-900/80 text-zinc-500">
                      <th className="text-right font-medium px-3 py-2">الاستراتيجية</th>
                      <th className="text-center font-medium px-2 py-2">إصابة</th>
                      <th className="text-center font-medium px-2 py-2">عينات</th>
                      <th className="text-center font-medium px-2 py-2">ترند صاعد</th>
                      <th className="text-center font-medium px-2 py-2">ترند هابط</th>
                      <th className="text-center font-medium px-2 py-2">عرضي</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.strategies.map((s) => (
                      <tr key={s.key} className="border-t border-zinc-800/60 hover:bg-zinc-900/40">
                        <td className="px-3 py-2 text-zinc-300">
                          <div className="font-medium">{s.nameAr}</div>
                          <div className="text-[9px] text-zinc-600">{s.pillarAr} · مضاعف عام {s.global}</div>
                        </td>
                        <td className={cn("px-2 py-2 text-center font-bold tabular-nums", s.winRate >= 55 ? "text-emerald-400" : s.winRate >= 45 ? "text-zinc-300" : "text-rose-400")} dir="ltr">
                          {s.winRate}%
                        </td>
                        <td className="px-2 py-2 text-center text-zinc-500 tabular-nums" dir="ltr">{s.samples}</td>
                        <td className="px-2 py-2 text-center">
                          <MultCell v={s.trendUp} />
                        </td>
                        <td className="px-2 py-2 text-center">
                          <MultCell v={s.trendDown} />
                        </td>
                        <td className="px-2 py-2 text-center">
                          <MultCell v={s.range} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[9px] text-zinc-600 mt-1.5">
                المضاعف فوق 1.0 = البوت زاد الثقة في هذه الاستراتيجية ضمن هذا النظام السوقي بعد إثبات أدائها · أقل من 1.0 = خُفضت بعد تكرار الأخطاء
              </p>
            </div>

            {/* --- الدروس المستخلصة --- */}
            <div>
              <h3 className="text-sm font-bold text-zinc-300 mb-2.5 flex items-center gap-2">
                <span className="w-1 h-4 bg-amber-400 rounded-full" />
                الدروس التي كتبها البوت لنفسه
              </h3>
              <div className="flex flex-col gap-2 max-h-80 overflow-y-auto pl-1">
                {result.lessons.map((l) => (
                  <div
                    key={l.key}
                    className={cn(
                      "rounded-xl border p-3 flex items-start gap-2.5",
                      l.severity === "good"
                        ? "border-emerald-500/25 bg-emerald-500/[0.04]"
                        : l.severity === "warn"
                          ? "border-amber-500/25 bg-amber-500/[0.04]"
                          : "border-zinc-800 bg-zinc-900/40"
                    )}
                  >
                    {l.severity === "good" && <Trophy className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />}
                    {l.severity === "warn" && <Lightbulb className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />}
                    {l.severity === "info" && <ShieldCheck className="w-4 h-4 text-zinc-400 shrink-0 mt-0.5" />}
                    <div>
                      <p className="text-[12px] leading-relaxed text-zinc-300">{l.text}</p>
                      {l.count > 0 && <span className="text-[9px] text-zinc-600" dir="ltr">n={l.count}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* --- تحليل الشهور --- */}
            <div>
              <h3 className="text-sm font-bold text-zinc-300 mb-2.5 flex items-center gap-2">
                <span className="w-1 h-4 bg-amber-400 rounded-full" />
                أداء البوت شهرياً خلال فترة التدريب (الشهر الحالي والسابق وأشهر التحليل)
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                {result.months.map((m) => (
                  <div key={m.ym} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-zinc-300 flex items-center gap-1.5">
                        <CalendarRange className="w-3.5 h-3.5 text-amber-400/70" />
                        {m.label}
                      </span>
                      <span className={cn("text-[11px] font-bold tabular-nums flex items-center gap-0.5", m.changePct >= 0 ? "text-emerald-400" : "text-rose-400")} dir="ltr">
                        {m.changePct >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                        {m.changePct >= 0 ? "+" : ""}{m.changePct}%
                      </span>
                    </div>
                    <div className="text-[10px] text-zinc-600 mt-1.5 tabular-nums" dir="ltr">
                      {m.open} ← {m.close} · H {m.high} · L {m.low}
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-[10px] text-zinc-500" dir="ltr">{m.trades} صفقة</span>
                      <span className={cn("text-[10px] font-bold tabular-nums", m.wr >= 55 ? "text-emerald-400" : m.wr >= 45 ? "text-zinc-400" : "text-rose-400")} dir="ltr">
                        فوز {m.wr}%
                      </span>
                      <Badge variant="outline" className={cn("text-[8px] px-1 py-0", m.dominant === "BUY" ? "border-emerald-500/30 text-emerald-400" : m.dominant === "SELL" ? "border-rose-500/30 text-rose-400" : "border-zinc-700 text-zinc-500")}>
                        {m.dominant === "BUY" ? "شراء" : m.dominant === "SELL" ? "بيع" : "متوازن"}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* --- ملاحظات الأمانة --- */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-3.5">
              <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 mb-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-500/70" />
                ضمانات نزاهة التدريب
              </div>
              <ul className="text-[10px] text-zinc-600 leading-relaxed list-disc pr-4 flex flex-col gap-1">
                <li>كل تنبؤ في الخط الزمني استُخرج من بيانات الشموع السابقة فقط — المؤشرات كلها سببية (لا تعتمد على أي بيانات لاحقة).</li>
                <li>الدخول على افتتاح الشمعة التالية، والتحقق لاحقاً (وقف/هدف بأولوية الوقف داخل الشمعة — افتراض متحفظ).</li>
                <li>حلقات التعلم تعمل على أول 75% فقط؛ آخر 25% (الاختبار الأعمى) لم تتسرب إليها الأوزان إطلاقاً.</li>
                <li>الأرقام استرشادية للتقييم الذاتي — لا تضمن أي نتائج مستقبلية، والتداول يحمل مخاطر خسارة.</li>
              </ul>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function MultCell({ v }: { v: number }) {
  const tone =
    v > 1.08 ? "text-emerald-400 bg-emerald-500/10" : v < 0.92 ? "text-rose-400 bg-rose-500/10" : "text-zinc-400 bg-zinc-800/40";
  return (
    <span className={cn("inline-block px-1.5 py-0.5 rounded-md text-[10px] font-bold tabular-nums", tone)} dir="ltr">
      ×{v.toFixed(2)}
    </span>
  );
}
