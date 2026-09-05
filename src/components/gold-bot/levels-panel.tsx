"use client";

import type { SignalResponse } from "@/lib/engine/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock, MapPin, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * لوحة المستويات الهيكلية: دعوم/مقاومات + بيفوت + فيبوناتشي + النطاق الآسيوي
 */
export function LevelsPanel({ signal }: { signal: SignalResponse }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* الدعوم والمقاومات */}
      <Card className="border-zinc-800 bg-[#101013]">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <MapPin className="w-4 h-4 text-amber-400" />
            الدعوم والمقاومات الهيكلية
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <LevelList
            title="مقاومات (فوق السعر)"
            levels={signal.resistanceLevels}
            variant="resistance"
          />
          <LevelList title="دعوم (تحت السعر)" levels={signal.supportLevels} variant="support" />
          <p className="text-[11px] text-zinc-500 leading-relaxed">
            المستويات مبنية من قمم/قيعان السوينغ المتجمعة + مستويات اليومين السابقين. القوة تحسب من عدد اللمسات
            وأهمية المصدر. كلما اقترب السعر من مستوى قوي — ارتفع احتمال الارتداد أو الاختراق الحاد.
          </p>
        </CardContent>
      </Card>

      {/* بيفوت + فيبو + النطاق الآسيوي */}
      <div className="flex flex-col gap-4">
        {signal.pivots && (
          <Card className="border-zinc-800 bg-[#101013]">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400" />
                مستويات البيفوت اليومية (من أمس)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-4 gap-1.5 text-center text-[11px]">
                {[
                  ["R3", signal.pivots.r3, "text-rose-400"],
                  ["R2", signal.pivots.r2, "text-rose-300/90"],
                  ["R1", signal.pivots.r1, "text-rose-300/70"],
                  ["PP", signal.pivots.pp, "text-amber-400 font-bold"],
                  ["S1", signal.pivots.s1, "text-emerald-300/70"],
                  ["S2", signal.pivots.s2, "text-emerald-300/90"],
                  ["S3", signal.pivots.s3, "text-emerald-400"],
                ].map(([label, val, cls]) => (
                  <div key={label as string} className="rounded-lg bg-zinc-900/70 border border-zinc-800 py-2">
                    <div className="text-zinc-500 font-medium">{label as string}</div>
                    <div className={cn("tabular-nums font-semibold mt-0.5", cls as string)} dir="ltr">
                      {val as number}$
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {signal.fib && (
          <Card className="border-zinc-800 bg-[#101013]">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400" />
                فيبوناتشي — موجة {signal.fib.direction === "up" ? "صاعدة" : "هابطة"} (
                <span dir="ltr">
                  {signal.fib.from}$ → {signal.fib.to}$
                </span>
                )
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-5 gap-1.5 text-center">
                {signal.fib.levels.map((l) => (
                  <div
                    key={l.ratio}
                    className={cn(
                      "rounded-lg bg-zinc-900/70 border py-2",
                      l.ratio === 0.618 ? "border-amber-500/50" : "border-zinc-800"
                    )}
                  >
                    <div className="text-[10px] text-zinc-500">{(l.ratio * 100).toFixed(1)}%</div>
                    <div
                      className={cn(
                        "text-xs tabular-nums font-semibold mt-0.5",
                        l.ratio === 0.618 ? "text-amber-300" : "text-zinc-300"
                      )}
                      dir="ltr"
                    >
                      {l.price}$
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-zinc-500 mt-2 leading-relaxed">
                المنطقة الذهبية 61.8% (المظللة ذهبياً) — أفضل مناطق الدخول مع الاتجاه حسب استراتيجية السكالبينج
                بالتصحيح.
              </p>
            </CardContent>
          </Card>
        )}

        {signal.asianRange && (
          <Card className="border-zinc-800 bg-[#101013]">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-400" />
                النطاق الآسيوي (00:00-07:00 UTC)
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2 text-xs">
              <div className="rounded-lg bg-zinc-900/70 border border-zinc-800 px-3 py-2">
                <span className="text-zinc-500">القمة: </span>
                <span className="tabular-nums text-rose-300 font-semibold" dir="ltr">
                  {signal.asianRange.high}$
                </span>
              </div>
              <div className="rounded-lg bg-zinc-900/70 border border-zinc-800 px-3 py-2">
                <span className="text-zinc-500">القاع: </span>
                <span className="tabular-nums text-emerald-300 font-semibold" dir="ltr">
                  {signal.asianRange.low}$
                </span>
              </div>
              <div className="rounded-lg bg-zinc-900/70 border border-zinc-800 px-3 py-2">
                <span className="text-zinc-500">العرض: </span>
                <span className="tabular-nums text-zinc-200 font-semibold" dir="ltr">
                  {signal.asianRange.width}$
                </span>
              </div>
              {signal.asianRange.swept !== "none" && (
                <div
                  className={cn(
                    "rounded-lg px-3 py-2 border",
                    signal.asianRange.swept === "high"
                      ? "border-rose-500/40 bg-rose-500/10 text-rose-300"
                      : "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                  )}
                >
                  🩸 تم كنس السيولة {signal.asianRange.swept === "high" ? "فوق القمة" : "تحت القاع"} — إشارة SMC
                  عكسية
                </div>
              )}
              <p className="text-[11px] text-zinc-500 w-full leading-relaxed">
                استراتيجية كسر النطاق الآسيوي: إغلاق شمعة 15 دقيقة خارج النطاق بعد فتح لندن = إشارة كسر، والهدف
                التقريبي 1.5-2× عرض النطاق. كنس السيولة قبل الكسر الحقيقي نمط متكرر (Judas Swing).
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function LevelList({
  title,
  levels,
  variant,
}: {
  title: string;
  levels: { price: number; strength: number; label: string; touches: number }[];
  variant: "support" | "resistance";
}) {
  return (
    <div>
      <p className="text-xs font-semibold text-zinc-400 mb-1.5">{title}</p>
      <div className="flex flex-col gap-1">
        {levels.length === 0 && <span className="text-xs text-zinc-600">لا مستويات قريبة</span>}
        {levels.map((l) => (
          <div
            key={`${l.price}-${l.label}`}
            className="flex items-center justify-between gap-2 rounded-lg bg-zinc-900/60 border border-zinc-800/60 px-3 py-1.5"
          >
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "w-1.5 h-1.5 rounded-full",
                  variant === "support" ? "bg-emerald-400" : "bg-rose-400"
                )}
              />
              <span className="tabular-nums text-sm font-semibold text-zinc-200" dir="ltr">
                {l.price}$
              </span>
              <span className="text-[10px] text-zinc-500">{l.label}</span>
            </div>
            <div className="flex items-center gap-1.5" dir="ltr">
              <span className="text-[10px] text-zinc-500">{l.touches}× لمسة</span>
              <div className="w-14 h-1 rounded-full bg-zinc-800 overflow-hidden">
                <div
                  className={cn("h-full", variant === "support" ? "bg-emerald-500" : "bg-rose-500")}
                  style={{ width: `${l.strength}%` }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

