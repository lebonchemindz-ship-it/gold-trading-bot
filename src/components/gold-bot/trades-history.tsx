"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  History,
  BellRing,
  BellOff,
  Radar,
  TrendingUp,
  TrendingDown,
  Trophy,
  XCircle,
  Timer,
  Clock,
  RefreshCw,
} from "lucide-react";

// ============================================================
// سجل الصفقات الآلي — يعرض صفقات المراقب (يعمل 24/5 وأنت offline)
// المراقب يفتح الصفقات عند ثقة 65%+ ويتتبعها حتى TP/SL
// ============================================================

interface Trade {
  id: string;
  openedAt: string;
  direction: "BUY" | "SELL";
  entry: number;
  sl: number;
  tp1: number;
  tp2: number;
  tp3: number;
  riskUsd: number;
  confidence: number;
  sessionLabel?: string;
  status: "open" | "win" | "loss" | "timeout";
  closedAt?: string | null;
  closePrice?: number | null;
  resultR?: number | null;
}

interface TradesResponse {
  success: boolean;
  error?: string;
  updatedAt?: string | null;
  lastCheckedAt?: string | null;
  telegramEnabled?: boolean;
  monitorInterval?: string;
  stats: {
    total: number;
    open: number;
    wins: number;
    losses: number;
    winRate: number | null;
    totalR: number;
  };
  trades: Trade[];
}

function timeAr(iso?: string | null): string {
  if (!iso) return "-";
  try {
    const d = new Date(iso);
    return d.toLocaleString("ar-DZ", {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Africa/Algiers",
    });
  } catch {
    return iso;
  }
}

export function TradesHistoryPanel() {
  const [data, setData] = useState<TradesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/trades", { cache: "no-store" });
      const j = (await r.json()) as TradesResponse;
      if (j.success) {
        setData(j);
        setError(null);
      } else {
        setError(j.error ?? "خطأ غير معروف");
      }
    } catch {
      setError("تعذر الاتصال");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000); // تحديث كل دقيقة
    return () => clearInterval(t);
  }, [load]);

  const openTrades = (data?.trades ?? []).filter((t) => t.status === "open");
  const closedTrades = (data?.trades ?? []).filter((t) => t.status !== "open").reverse();
  const st = data?.stats;

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-950/60 overflow-hidden">
      {/* الترويسة */}
      <div className="border-b border-zinc-800/80 bg-gradient-to-l from-amber-500/[0.07] via-transparent to-transparent p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-yellow-600 grid place-items-center shrink-0 shadow-lg shadow-amber-500/20">
              <History className="w-5 h-5 text-zinc-900" />
            </div>
            <div>
              <h2 className="text-base font-black text-zinc-50 leading-tight">
                سجل الصفقات الآلي — يعمل حتى وأنت نائم 😴
              </h2>
              <p className="text-[11px] text-zinc-300 mt-0.5 leading-relaxed max-w-xl">
                مراقب تلقائي يفحص السوق كل 10 دقائق، يفتح صفقة عند إشارة قوية (ثقة 65%+)
                ويتتبعها حتى تلمس الهدف أو الوقف — النتيجة تُحفظ هنا وترسل لك على تيليجرام
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {data?.telegramEnabled ? (
              <Badge variant="outline" className="text-[10px] gap-1 border-emerald-500/40 text-emerald-400 bg-emerald-500/5">
                <BellRing className="w-3 h-3" /> إشعارات تيليجرام مفعّلة
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] gap-1 border-zinc-700 text-zinc-400 bg-zinc-900">
                <BellOff className="w-3 h-3" /> تيليجرام غير مفعّل بعد
              </Badge>
            )}
            <Badge variant="outline" className="text-[10px] gap-1 border-amber-500/40 text-amber-300 bg-amber-500/5">
              <Radar className="w-3 h-3" /> فحص كل 10 دقائق
            </Badge>
            {data?.lastCheckedAt && (
              <span className="text-[10px] text-zinc-400 flex items-center gap-1 tabular-nums">
                <Clock className="w-3 h-3" /> آخر فحص: {timeAr(data.lastCheckedAt)}
              </span>
            )}
            <button
              onClick={() => load()}
              className="text-zinc-400 hover:text-amber-400 transition-colors"
              aria-label="تحديث السجل"
            >
              <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
            </button>
          </div>
        </div>

        {/* الإحصاءات */}
        {st && (
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mt-4">
            <StatBox label="إجمالي الصفقات" value={String(st.total)} />
            <StatBox label="قيد المتابعة" value={String(st.open)} color="text-amber-300" pulse={st.open > 0} />
            <StatBox label="رابحة" value={String(st.wins)} color="text-emerald-400" />
            <StatBox label="نسبة الفوز" value={st.winRate != null ? `${st.winRate}%` : "—"} color="text-emerald-400" />
            <StatBox
              label="صافي النتيجة"
              value={`${st.totalR >= 0 ? "+" : ""}${st.totalR}R`}
              color={st.totalR >= 0 ? "text-emerald-400" : "text-rose-400"}
            />
          </div>
        )}
      </div>

      {/* الجسم */}
      <div className="p-4 sm:p-5 flex flex-col gap-4">
        {error && (
          <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {error} — السجل يُقرأ من المستودع، سيتوفر بعد أول تشغيل للمراقب
          </div>
        )}

        {/* الصفقات المفتوحة */}
        {openTrades.length > 0 && (
          <div>
            <h3 className="text-xs font-bold text-zinc-300 mb-2.5 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-pulse" />
              صفقات مفتوحة تحت التتبع الآن
            </h3>
            <div className="grid gap-2.5 md:grid-cols-2">
              {openTrades.map((t) => (
                <OpenTradeCard key={t.id} t={t} />
              ))}
            </div>
          </div>
        )}

        {/* الصفقات المغلقة */}
        {closedTrades.length > 0 ? (
          <div>
            <h3 className="text-xs font-bold text-zinc-300 mb-2.5 flex items-center gap-1.5">
              <Trophy className="w-3.5 h-3.5 text-amber-400" />
              الصفقات المغلقة ({closedTrades.length})
            </h3>
            <div className="overflow-x-auto rounded-xl border border-zinc-800">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-zinc-400 border-b border-zinc-800 bg-zinc-900/60">
                    <th className="text-right px-3 py-2 font-medium">الوقت</th>
                    <th className="text-right px-3 py-2 font-medium">الاتجاه</th>
                    <th className="text-right px-3 py-2 font-medium">الدخول</th>
                    <th className="text-right px-3 py-2 font-medium">الإغلاق</th>
                    <th className="text-right px-3 py-2 font-medium">النتيجة</th>
                    <th className="text-right px-3 py-2 font-medium">الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {closedTrades.slice(0, 20).map((t) => (
                    <tr key={t.id} className="border-b border-zinc-800/60 last:border-0">
                      <td className="px-3 py-2 text-zinc-300 tabular-nums whitespace-nowrap">{timeAr(t.openedAt)}</td>
                      <td className="px-3 py-2">
                        <span
                          className={cn(
                            "font-bold",
                            t.direction === "BUY" ? "text-emerald-400" : "text-rose-400"
                          )}
                        >
                          {t.direction === "BUY" ? "شراء" : "بيع"}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-zinc-200 tabular-nums" dir="ltr">${t.entry}</td>
                      <td className="px-3 py-2 text-zinc-200 tabular-nums" dir="ltr">
                        {t.closePrice != null ? `$${t.closePrice}` : "—"}
                      </td>
                      <td className="px-3 py-2 tabular-nums" dir="ltr">
                        <span
                          className={cn(
                            "font-bold",
                            (t.resultR ?? 0) > 0 ? "text-emerald-400" : (t.resultR ?? 0) < 0 ? "text-rose-400" : "text-zinc-400"
                          )}
                        >
                          {t.resultR != null ? `${t.resultR > 0 ? "+" : ""}${t.resultR}R` : "—"}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <StatusBadge status={t.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {closedTrades.length > 20 && (
              <p className="text-[10px] text-zinc-400 mt-1.5">
                يعرض آخر 20 صفقة من أصل {closedTrades.length} — السجل الكامل محفوظ في المستودع
              </p>
            )}
          </div>
        ) : (
          !error && (
            <div className="py-8 text-center">
              <Radar className="w-10 h-10 text-zinc-400 mx-auto mb-3" />
              <p className="text-sm text-zinc-300">
                لم تُسجَّل صفقات بعد — المراقب يعمل ويفتح الصفقة الأولى تلقائياً
                عند ظهور إشارة قوية (ثقة 65%+) خلال جلسات لندن ونيويورك
              </p>
              <p className="text-[11px] text-zinc-400 mt-1.5">
                البوت لا يفتح صفقات في الساعات الميتة أو أثناء إغلاق السوق — هذه حماية مبنية على التدريب
              </p>
            </div>
          )
        )}
      </div>
    </section>
  );
}

function StatBox({ label, value, color, pulse }: { label: string; value: string; color?: string; pulse?: boolean }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-center">
      <div className={cn("text-[9px] text-zinc-400 mb-0.5 flex items-center justify-center gap-1", pulse && "text-amber-300")}>
        {pulse && <span className="w-1 h-1 bg-amber-400 rounded-full animate-pulse" />}
        {label}
      </div>
      <div className={cn("text-base font-black tabular-nums", color ?? "text-zinc-100")} dir="ltr">
        {value}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: Trade["status"] }) {
  if (status === "win")
    return (
      <Badge variant="outline" className="text-[9px] gap-1 border-emerald-500/40 text-emerald-400 bg-emerald-500/10">
        <Trophy className="w-3 h-3" /> ربح TP
      </Badge>
    );
  if (status === "loss")
    return (
      <Badge variant="outline" className="text-[9px] gap-1 border-rose-500/40 text-rose-400 bg-rose-500/10">
        <XCircle className="w-3 h-3" /> خسارة SL
      </Badge>
    );
  if (status === "timeout")
    return (
      <Badge variant="outline" className="text-[9px] gap-1 border-amber-500/40 text-amber-400 bg-amber-500/10">
        <Timer className="w-3 h-3" /> إغلاق زمني
      </Badge>
    );
  return (
    <Badge variant="outline" className="text-[9px] gap-1 border-zinc-600 text-zinc-400 bg-zinc-900">
      <Clock className="w-3 h-3" /> مفتوحة
    </Badge>
  );
}

function OpenTradeCard({ t }: { t: Trade }) {
  const isBuy = t.direction === "BUY";
  return (
    <div
      className={cn(
        "rounded-xl border p-3.5",
        isBuy ? "border-emerald-500/30 bg-emerald-500/[0.04]" : "border-rose-500/30 bg-rose-500/[0.04]"
      )}
    >
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <div className="flex items-center gap-2">
          {isBuy ? <TrendingUp className="w-4 h-4 text-emerald-400" /> : <TrendingDown className="w-4 h-4 text-rose-400" />}
          <span className={cn("text-sm font-black", isBuy ? "text-emerald-400" : "text-rose-400")}>
            {isBuy ? "شراء" : "بيع"} XAU/USD
          </span>
          <Badge variant="outline" className="text-[9px] border-zinc-700 text-zinc-400 bg-zinc-900">
            ثقة {t.confidence}%
          </Badge>
        </div>
        <span className="text-[10px] text-zinc-400 flex items-center gap-1">
          <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-pulse" />
          قيد المتابعة
        </span>
      </div>
      <div className="grid grid-cols-4 gap-2 text-center">
        <MiniLevel label="الدخول" value={`$${t.entry}`} cls="text-amber-300" />
        <MiniLevel label="الوقف" value={`$${t.sl}`} cls="text-rose-400" />
        <MiniLevel label="هدف ١" value={`$${t.tp1}`} cls="text-emerald-400" />
        <MiniLevel label="هدف ٢" value={`$${t.tp2}`} cls="text-emerald-400" />
      </div>
      <p className="text-[10px] text-zinc-400 mt-2 leading-relaxed">
        فُتحت: {timeAr(t.openedAt)} · الجلسة: {t.sessionLabel?.slice(0, 50) ?? "-"}
      </p>
    </div>
  );
}

function MiniLevel({ label, value, cls }: { label: string; value: string; cls: string }) {
  return (
    <div className="rounded-lg bg-zinc-900/70 border border-zinc-800 px-2 py-1.5">
      <div className="text-[9px] text-zinc-400">{label}</div>
      <div className={cn("text-xs font-bold tabular-nums", cls)} dir="ltr">
        {value}
      </div>
    </div>
  );
}
