"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, TrendingUp, TrendingDown, Activity, MapPin, BarChart3, Globe, Clock, Gauge } from "lucide-react";
import type { PillarScore } from "@/lib/engine/types";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  trend: TrendingUp,
  momentum: Activity,
  location: MapPin,
  priceAction: BarChart3,
  macro: Globe,
  session: Clock,
  volatility: Gauge,
};

function scoreColor(score: number): string {
  if (score >= 40) return "bg-emerald-500";
  if (score >= 15) return "bg-emerald-400/70";
  if (score > -15) return "bg-zinc-500";
  if (score > -40) return "bg-rose-400/70";
  return "bg-rose-500";
}

function scoreText(score: number): string {
  if (score >= 40) return "قوة شرائية واضحة";
  if (score >= 15) return "ميل شرائي";
  if (score > -15) return "محايد";
  if (score > -40) return "ميل بيعي";
  return "قوة بيعية واضحة";
}

/**
 * لوحة أعمدة التحليل — كل عمود مع درجته ووزنه وأسبابه التفصيلية
 * (الشفافية الكاملة: كل سبب له مساهمة رقمية موثقة)
 */
export function PillarsPanel({ pillars }: { pillars: PillarScore[] }) {
  const [expanded, setExpanded] = useState<string | null>(pillars[0]?.key ?? null);

  return (
    <div className="flex flex-col gap-2.5">
      {pillars.map((p) => {
        const Icon = iconMap[p.key] ?? Activity;
        const isOpen = expanded === p.key;
        const positive = p.score >= 0;
        return (
          <div
            key={p.key}
            className="rounded-xl border border-zinc-800 bg-[#101013] overflow-hidden transition-colors hover:border-zinc-700"
          >
            <button
              onClick={() => setExpanded(isOpen ? null : p.key)}
              className="w-full flex items-center gap-3 p-3.5 text-right"
              aria-expanded={isOpen}
            >
              <div
                className={cn(
                  "shrink-0 w-9 h-9 rounded-lg flex items-center justify-center",
                  positive ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"
                )}
              >
                <Icon className="w-4.5 h-4.5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="font-semibold text-sm text-zinc-100">{p.name}</span>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-zinc-700 text-zinc-400">
                      وزن {p.weight}%
                    </Badge>
                    <span
                      className={cn(
                        "text-sm font-bold tabular-nums",
                        positive ? "text-emerald-400" : "text-rose-400"
                      )}
                      dir="ltr"
                    >
                      {p.score > 0 ? "+" : ""}
                      {p.score}
                    </span>
                  </div>
                </div>
                {/* شريط الدرجة */}
                <div className="relative h-1.5 mt-2 rounded-full bg-zinc-800 overflow-hidden">
                  {/* خط المنتصف */}
                  <div className="absolute inset-y-0 left-1/2 w-px bg-zinc-600 z-10" />
                  <div
                    className={cn("absolute inset-y-0 transition-all duration-500", scoreColor(p.score))}
                    style={
                      positive
                        ? { left: "50%", width: `${Math.min(Math.abs(p.score), 100) / 2}%` }
                        : { right: "50%", width: `${Math.min(Math.abs(p.score), 100) / 2}%` }
                    }
                  />
                </div>
                <span className="text-[11px] text-zinc-500 mt-1 block">
                  {scoreText(p.score)} — {Math.abs(p.score)}% قوة الإشارة
                </span>
              </div>
              <div className="shrink-0 text-zinc-500">
                {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </div>
            </button>

            {isOpen && (
              <div className="px-3.5 pb-3.5 border-t border-zinc-800/60 pt-2.5">
                <ul className="flex flex-col gap-1.5">
                  {p.reasons.map((r, i) => (
                    <li key={i} className="flex items-start justify-between gap-3 text-xs leading-relaxed">
                      <span className="text-zinc-300 flex-1">
                        <span className="text-zinc-500 ml-1">•</span>
                        {r.text}
                      </span>
                      {r.contribution !== 0 && (
                        <span
                          className={cn(
                            "shrink-0 tabular-nums font-mono text-[10px] px-1.5 py-0.5 rounded",
                            r.contribution > 0
                              ? "text-emerald-400 bg-emerald-500/10"
                              : "text-rose-400 bg-rose-500/10"
                          )}
                          dir="ltr"
                        >
                          {r.contribution > 0 ? "+" : ""}
                          {Math.round(r.contribution)}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
