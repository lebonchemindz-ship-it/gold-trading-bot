"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { RefreshCw, Radio, TrendingUp, TrendingDown, Coins, Newspaper, AlertTriangle, Github, Globe } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SignalCard } from "@/components/gold-bot/signal-card";
import { PillarsPanel } from "@/components/gold-bot/pillars-panel";
import { TFTable } from "@/components/gold-bot/tf-table";
import { LevelsPanel } from "@/components/gold-bot/levels-panel";
import { RiskCalculator } from "@/components/gold-bot/risk-calculator";
import { MethodologyPanel } from "@/components/gold-bot/methodology-panel";
import { TradingViewChart, TradingViewTechnicalGauge } from "@/components/gold-bot/tradingview-chart";
import type { SignalResponse } from "@/lib/engine/types";
import { cn } from "@/lib/utils";

const REFRESH_INTERVAL = 60; // ثانية

export default function GoldBotPage() {
  const [mode, setMode] = useState<"scalping" | "day">("scalping");
  const [signal, setSignal] = useState<SignalResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL);
  const [lastUpdate, setLastUpdate] = useState<string>("");
  const modeRef = useRef(mode);
  modeRef.current = mode;

  const load = useCallback(
    async (isManual = false) => {
      if (isManual) setRefreshing(true);
      try {
        const res = await fetch(`/api/signal?mode=${modeRef.current}`, { cache: "no-store" });
        const json = await res.json();
        if (!json.success) {
          throw new Error(json.error ?? "فشل جلب التحليل");
        }
        setSignal(json.data as SignalResponse);
        setError(null);
        setLastUpdate(new Date().toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
      } catch (e) {
        setError(e instanceof Error ? e.message : "خطأ في الاتصال");
      } finally {
        setLoading(false);
        setRefreshing(false);
        setCountdown(REFRESH_INTERVAL);
      }
    },
    []
  );

  // تحميل أولي + عند تغيير النمط
  useEffect(() => {
    setLoading(true);
    load();
  }, [mode, load]);

  // التحديث التلقائي
  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          load();
          return REFRESH_INTERVAL;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [load]);

  const price = signal?.price;
  const changePct = signal?.change24hPct ?? 0;
  const up = changePct >= 0;

  return (
    <div className="min-h-screen flex flex-col bg-[#09090b]">
      {/* ===== الترويسة ===== */}
      <header className="sticky top-0 z-40 border-b border-zinc-800/80 bg-[#09090b]/95 backdrop-blur supports-[backdrop-filter]:bg-[#09090b]/75">
        <div className="mx-auto max-w-7xl px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-yellow-600 flex items-center justify-center shadow-lg shadow-amber-500/20">
              <Coins className="w-5.5 h-5.5 text-zinc-900" />
            </div>
            <div>
              <h1 className="text-lg font-black tracking-tight text-zinc-50 leading-tight">
                بوت الذهب <span className="text-amber-400">XAU/USD</span>
              </h1>
              <p className="text-[11px] text-zinc-500">تحليل احترافي حتمي — سكالبينج + تداول يومي</p>
            </div>
          </div>

          {/* السعر الحي */}
          <div className="flex items-center gap-3 flex-wrap">
            {price != null ? (
              <>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-black tabular-nums text-zinc-50" dir="ltr">
                    ${price.toFixed(2)}
                  </span>
                  <span
                    className={cn(
                      "text-xs font-bold tabular-nums flex items-center gap-0.5",
                      up ? "text-emerald-400" : "text-rose-400"
                    )}
                    dir="ltr"
                  >
                    {up ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                    {up ? "+" : ""}
                    {signal?.change24h.toFixed(2)}$ ({up ? "+" : ""}
                    {changePct.toFixed(2)}%)
                  </span>
                </div>
                {(signal?.dayHigh || signal?.dayLow) && (
                  <div className="hidden md:flex items-center gap-2 text-[11px] text-zinc-500" dir="ltr">
                    <span>
                      H: <span className="text-emerald-500">{signal?.dayHigh}</span>
                    </span>
                    <span>
                      L: <span className="text-rose-500">{signal?.dayLow}</span>
                    </span>
                  </div>
                )}
              </>
            ) : (
              <Skeleton className="h-8 w-40" />
            )}

            <div className="flex items-center gap-2">
              <span className="text-[10px] text-zinc-600 tabular-nums hidden sm:inline">
                تحديث تلقائي خلال {countdown}ث
              </span>
              <Button
                variant="outline"
                size="icon"
                onClick={() => load(true)}
                disabled={refreshing}
                className="h-8 w-8 border-zinc-700 hover:border-amber-500/50 hover:text-amber-400"
                aria-label="تحديث التحليل"
              >
                <RefreshCw className={cn("w-3.5 h-3.5", refreshing && "animate-spin")} />
              </Button>
            </div>
          </div>
        </div>

        {/* شريط الجلسة */}
        {signal && (
          <div className="border-t border-zinc-800/60 bg-zinc-900/40">
            <div className="mx-auto max-w-7xl px-4 py-1.5 flex items-center gap-2 flex-wrap text-[11px]">
              <Radio className="w-3 h-3 text-amber-400" />
              <span className="text-zinc-300">{signal.session.label}</span>
              <span className="text-zinc-600">|</span>
              <span className="text-zinc-500" dir="ltr">
                ATR: 15m {signal.atr15m}$ · 1h {signal.atr1h}$ · 4h {signal.atr4h}$
              </span>
              {signal.session.active.length > 0 && (
                <>
                  <span className="text-zinc-600">|</span>
                  {signal.session.active.map((s) => (
                    <Badge key={s} variant="outline" className="text-[9px] px-1.5 py-0 border-zinc-700 text-zinc-400">
                      {s}
                    </Badge>
                  ))}
                </>
              )}
              {lastUpdate && (
                <span className="text-zinc-600 mr-auto tabular-nums">آخر تحديث: {lastUpdate}</span>
              )}
            </div>
          </div>
        )}
      </header>

      {/* ===== المحتوى ===== */}
      <main className="flex-1 mx-auto max-w-7xl w-full px-4 py-5 flex flex-col gap-5">
        {error && (
          <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error} — سيُعاد المحاولة تلقائياً خلال دقيقة.</span>
          </div>
        )}

        {loading && !signal ? (
          <div className="flex flex-col gap-4">
            <Skeleton className="h-56 w-full rounded-xl" />
            <div className="grid gap-4 lg:grid-cols-2">
              <Skeleton className="h-72 w-full rounded-xl" />
              <Skeleton className="h-72 w-full rounded-xl" />
            </div>
          </div>
        ) : signal ? (
          <AnimatePresence mode="wait">
            <motion.div
              key={mode}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
              className="flex flex-col gap-5"
            >
              {/* التبويبات */}
              <Tabs value={mode} onValueChange={(v) => setMode(v as "scalping" | "day")}>
                <TabsList className="bg-zinc-900 border border-zinc-800 w-full max-w-md mx-auto grid grid-cols-2 h-11">
                  <TabsTrigger
                    value="scalping"
                    className="data-[state=active]:bg-amber-500/15 data-[state=active]:text-amber-300 text-zinc-400 text-sm gap-1.5"
                  >
                    ⚡ سكالبينج (5 دقائق)
                  </TabsTrigger>
                  <TabsTrigger
                    value="day"
                    className="data-[state=active]:bg-amber-500/15 data-[state=active]:text-amber-300 text-zinc-400 text-sm gap-1.5"
                  >
                    📊 تداول يومي (ساعة + 4 ساعات)
                  </TabsTrigger>
                </TabsList>

                <TabsContent value={mode} className="mt-5">
                  <div className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr] items-start">
                    {/* العمود الأيمن: التوصية + الأعمدة */}
                    <div className="flex flex-col gap-5 min-w-0">
                      <SignalCard signal={signal} />
                      <div>
                        <h2 className="text-sm font-bold text-zinc-300 mb-2.5 flex items-center gap-2">
                          <span className="w-1 h-4 bg-amber-400 rounded-full" />
                          أعمدة التقييم السبعة (تفصيل الأسباب)
                        </h2>
                        <PillarsPanel pillars={signal.pillars} />
                      </div>
                    </div>

                    {/* العمود الأيسر: الجدول + الشارت + الحاسبة */}
                    <div className="flex flex-col gap-5 min-w-0">
                      <TFTable signal={signal} />
                      <div>
                        <h2 className="text-sm font-bold text-zinc-300 mb-2.5 flex items-center gap-2">
                          <span className="w-1 h-4 bg-amber-400 rounded-full" />
                          شارت الذهب المباشر — TradingView
                        </h2>
                        <TradingViewChart interval={mode === "scalping" ? "5" : "60"} height={460} />
                      </div>
                      <RiskCalculator entry={signal.levels?.entry ?? null} sl={signal.levels?.sl ?? null} />
                    </div>
                  </div>

                  {/* المستويات */}
                  <div className="mt-5">
                    <h2 className="text-sm font-bold text-zinc-300 mb-2.5 flex items-center gap-2">
                      <span className="w-1 h-4 bg-amber-400 rounded-full" />
                      خريطة المستويات الهيكلية
                    </h2>
                    <LevelsPanel signal={signal} />
                  </div>

                  {/* تقييم TradingView المستقل */}
                  <div className="mt-5">
                    <h2 className="text-sm font-bold text-zinc-300 mb-2.5 flex items-center gap-2">
                      <span className="w-1 h-4 bg-amber-400 rounded-full" />
                      التقييم الفني المستقل من TradingView (مذبذبات + متوسطات)
                    </h2>
                    <TradingViewTechnicalGauge />
                  </div>

                  {/* الأخبار */}
                  {signal.news.upcoming.length > 0 && (
                    <div className="mt-5 rounded-xl border border-zinc-800 bg-[#101013] p-4">
                      <h2 className="text-sm font-bold text-zinc-300 mb-3 flex items-center gap-2">
                        <Newspaper className="w-4 h-4 text-amber-400" />
                        أخبار أمريكية عالية التأثير قادمة (تؤثر مباشرة على الذهب)
                      </h2>
                      <ul className="flex flex-col gap-2">
                        {signal.news.upcoming.map((n, i) => {
                          const mins = Math.round((n.time - Date.now()) / 60000);
                          return (
                            <li key={i} className="flex items-center justify-between gap-2 text-xs bg-zinc-900/60 border border-zinc-800 rounded-lg px-3 py-2">
                              <span className="text-zinc-300">{n.title}</span>
                              <span className="text-amber-300 tabular-nums shrink-0" dir="ltr">
                                {mins > 60 ? `${Math.floor(mins / 60)}س ${mins % 60}د` : `${mins}د`}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}

                  {/* المنهجية */}
                  <div className="mt-5">
                    <MethodologyPanel fingerprint={signal.fingerprint} />
                  </div>
                </TabsContent>
              </Tabs>
            </motion.div>
          </AnimatePresence>
        ) : null}
      </main>

      {/* ===== التذييل ===== */}
      <footer className="mt-auto border-t border-zinc-800/80 bg-[#0c0c0f]">
        <div className="mx-auto max-w-7xl px-4 py-5 flex flex-col gap-3">
          <div className="flex items-center justify-between flex-wrap gap-2 text-[11px] text-zinc-600">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
              مصدر البيانات: {signal?.dataSource ?? "Yahoo Finance + ForexFactory"}
            </span>
            <span className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <Github className="w-3 h-3" /> مفتوح المصدر
              </span>
              <span className="flex items-center gap-1">
                <Globe className="w-3 h-3" /> يعمل 24/5 مع تفتح السوق
              </span>
            </span>
          </div>
          <p className="text-[10px] leading-relaxed text-zinc-600 border-t border-zinc-800/60 pt-3">
            ⚠️ إخلاء مسؤولية: هذا البوت أداة تحليل تعليمية تعرض قراءة رياضية منضبطة للبيانات الفنية، وهو ليس
            نصيحة استثمارية مالية. تداول الذهب بالرافعة ينطوي على مخاطر خسارة عالية وقد لا يناسب جميع المستثمرين.
            الأداء السابق لا يضمن النتائج المستقبلية — أي مسؤولية عن قرارات التداول تقع على المتداول وحده. خاطر
            فقط برأس مال تستطيع تحمل خسارته.
          </p>
        </div>
      </footer>
    </div>
  );
}
