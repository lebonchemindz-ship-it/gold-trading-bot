"use client";

import type { SignalResponse, TradeLevels } from "@/lib/engine/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ConfidenceGauge } from "./confidence-gauge";
import { cn } from "@/lib/utils";
import { Target, ShieldAlert, Flag, ArrowUpRight, ArrowDownRight, Pause } from "lucide-react";

/**
 * بطاقة التوصية الرئيسية — الاتجاه + الثقة + مستويات الصفقة
 */
export function SignalCard({ signal }: { signal: SignalResponse }) {
  const dir = signal.direction;
  const isBuy = dir === "BUY";
  const isSell = dir === "SELL";
  const levels: TradeLevels | null = signal.levels;

  const dirColor = isBuy
    ? "text-emerald-400 border-emerald-500/40 bg-emerald-500/10"
    : isSell
      ? "text-rose-400 border-rose-500/40 bg-rose-500/10"
      : "text-amber-400 border-amber-500/40 bg-amber-500/10";

  return (
    <Card className="border-zinc-800 bg-[#101013]">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Flag className="w-4 h-4 text-amber-400" />
            التوصية —{" "}
            {signal.mode === "scalping" ? "مضاربة لحظية (سكالبينج)" : "تداول يومي (Day Trading)"}
          </CardTitle>
          <Badge variant="outline" className="border-zinc-700 text-zinc-400 font-mono text-[10px]" dir="ltr">
            #{signal.fingerprint}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {/* الاتجاه + الثقة */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-col gap-1.5">
            <div
              className={cn(
                "text-3xl font-black tracking-tight flex items-center gap-2 px-4 py-2 rounded-xl border",
                dirColor
              )}
            >
              {isBuy && <ArrowUpRight className="w-8 h-8" />}
              {isSell && <ArrowDownRight className="w-8 h-8" />}
              {dir === "WAIT" && <Pause className="w-7 h-7" />}
              {dir === "BUY" ? "شراء" : dir === "SELL" ? "بيع" : "انتظار"}
            </div>
            <span className="text-xs text-zinc-500">
              الدرجة الموزونة:{" "}
              <span
                className={cn("font-bold tabular-nums", signal.score >= 0 ? "text-emerald-400" : "text-rose-400")}
                dir="ltr"
              >
                {signal.score > 0 ? "+" : ""}
                {signal.score}/100
              </span>{" "}
              — محسوبة من 7 أعمدة بأوزان ثابتة
            </span>
          </div>
          <ConfidenceGauge value={signal.confidence} label={signal.confidenceLabel} direction={dir} />
        </div>

        {/* نظام السوق */}
        <div className="rounded-lg bg-zinc-900/70 border border-zinc-800 px-3.5 py-2.5 text-xs leading-relaxed text-zinc-300">
          <span className="text-amber-400/90 font-semibold">نظام السوق: </span>
          {signal.marketRegime}
        </div>

        {/* مستويات الصفقة */}
        {levels ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
            <LevelBox
              title="الدخول (سوق)"
              value={levels.entry}
              sub={`منطقة ${levels.entryZone[0]}$ - ${levels.entryZone[1]}$`}
              icon={<Target className="w-3.5 h-3.5" />}
              colorClass="border-zinc-700"
              valueClass="text-amber-300"
            />
            <LevelBox
              title="وقف الخسارة"
              value={levels.sl}
              sub={`مسافة ${levels.riskUsd}$ ≈ ${levels.pips} نقطة`}
              icon={<ShieldAlert className="w-3.5 h-3.5" />}
              colorClass="border-rose-500/30"
              valueClass="text-rose-400"
            />
            <LevelBox
              title="هدف 1 (RR 1:1)"
              value={levels.tp1}
              sub={`عائد/مخاطرة ${levels.rr1}:1`}
              colorClass="border-emerald-500/30"
              valueClass="text-emerald-400"
            />
            <LevelBox
              title="هدف 2 (RR 1:1.8)"
              value={levels.tp2}
              sub={`عائد/مخاطرة ${levels.rr2}:1`}
              colorClass="border-emerald-500/30"
              valueClass="text-emerald-400"
            />
            <LevelBox
              title="هدف 3 (ممتد)"
              value={levels.tp3}
              sub={`عائد/مخاطرة ${levels.rr3}:1`}
              colorClass="border-emerald-500/30"
              valueClass="text-emerald-400"
            />
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2.5 flex flex-col justify-center">
              <span className="text-[10px] text-zinc-500">مبدأ المخاطرة (من الأبحاث)</span>
              <span className="text-xs text-zinc-300 leading-relaxed mt-0.5">
                خاطر بـ 1-2% فقط من الحساب، والوقف مبني على 1.35-2.2×ATR
              </span>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-amber-500/25 bg-amber-500/5 px-4 py-3 text-sm text-amber-200/90 leading-relaxed">
            <b>لا دخول الآن — الإشارات غير كافية.</b> الدرجة المطلوبة للدخول ≥ ±15 من 100. الوقوف جانباً حتى اكتمال
            الشروط (تزامن الاتجاه والزخم والموقع) قرار تداول صحيح وليس تقصيراً.
          </div>
        )}

        {/* السرد التحليلي */}
        <div className="rounded-lg bg-zinc-900/70 border border-zinc-800 p-3.5">
          <p className="text-xs font-semibold text-zinc-400 mb-2 flex items-center gap-1.5">
            <span className="w-1 h-3.5 bg-amber-400 rounded-full inline-block" />
            قراءة البوت للسوق
          </p>
          <ul className="flex flex-col gap-1.5">
            {signal.narrative.map((n, i) => (
              <li key={i} className="text-xs leading-relaxed text-zinc-300 flex gap-1.5">
                <span className="text-zinc-600 shrink-0">◆</span>
                <span>{n}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* تحذير الأخبار */}
        {signal.news.caution && signal.news.cautionText && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-xs leading-relaxed text-amber-200 flex gap-2">
            <span className="text-base shrink-0">⚠️</span>
            <div>
              <b>تنبيه أخبار عالي التأثير:</b> {signal.news.cautionText.replace(/^\s/, "")}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function LevelBox({
  title,
  value,
  sub,
  icon,
  colorClass,
  valueClass,
}: {
  title: string;
  value: number;
  sub: string;
  icon?: React.ReactNode;
  colorClass: string;
  valueClass: string;
}) {
  return (
    <div className={cn("rounded-lg border bg-zinc-900/60 px-3 py-2.5", colorClass)}>
      <span className="text-[10px] text-zinc-500 flex items-center gap-1">
        {icon}
        {title}
      </span>
      <span className={cn("text-lg font-bold tabular-nums block", valueClass)} dir="ltr">
        ${value}
      </span>
      <span className="text-[10px] text-zinc-500" dir="ltr">
        {sub}
      </span>
    </div>
  );
}
