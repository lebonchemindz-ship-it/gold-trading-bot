"use client";

import { useEffect, useRef, useState } from "react";

interface TradingViewChartProps {
  symbol?: string;
  interval?: "5" | "15" | "60" | "240" | "D";
  height?: number;
}

/**
 * شارت TradingView المتقدم — Embed رسمي
 * OANDA:XAUUSD (ذهب مقابل الدولار)
 */
export function TradingViewChart({ symbol = "OANDA:XAUUSD", interval = "15", height = 500 }: TradingViewChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    container.innerHTML = "";

    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.type = "text/javascript";
    script.async = true;
    script.onerror = () => setFailed(true);
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol,
      interval,
      timezone: "Etc/UTC",
      theme: "dark",
      style: "1",
      locale: "ar_AE",
      backgroundColor: "rgba(9, 9, 11, 1)",
      gridColor: "rgba(63, 63, 70, 0.3)",
      hide_side_toolbar: false,
      allow_symbol_change: false,
      withdateranges: true,
      studies: ["STD;EMA", "STD;RSI", "STD;BB"],
      support_host: "https://www.tradingview.com",
    });
    container.appendChild(script);

    const timeout = setTimeout(() => {
      if (!container.querySelector("iframe")) setFailed(true);
    }, 12000);

    return () => {
      clearTimeout(timeout);
      container.innerHTML = "";
    };
  }, [symbol, interval]);

  return (
    <div className="relative w-full rounded-xl border border-zinc-800 bg-[#0d0d10] overflow-hidden" style={{ height }}>
      <div ref={containerRef} className="tradingview-widget-container h-full w-full" />
      {failed && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#0d0d10] text-zinc-400 p-6 text-center">
          <p className="text-lg font-semibold text-amber-400/90">شارت TradingView</p>
          <p className="text-sm leading-relaxed">
            تعذر تحميل الشارت المباشر في هذه البيئة.
            <br />
            يمكنك مشاهدة الشارت مباشرة على{" "}
            <a
              href={`https://www.tradingview.com/chart/?symbol=${encodeURIComponent(symbol)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-amber-400 underline underline-offset-4"
            >
              TradingView.com
            </a>
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * أدوات التحليل الفني من TradingView — تقييمهم المستقل للمذبذبات والمتوسطات
 */
export function TradingViewTechnicalGauge() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    container.innerHTML = "";

    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-technical-analysis.js";
    script.type = "text/javascript";
    script.async = true;
    script.onerror = () => setFailed(true);
    script.innerHTML = JSON.stringify({
      interval: "1h",
      width: "100%",
      isTransparent: true,
      height: "100%",
      symbol: "OANDA:XAUUSD",
      showIntervalTabs: true,
      displayMode: "single",
      locale: "ar_AE",
      colorTheme: "dark",
    });
    container.appendChild(script);

    const timeout = setTimeout(() => {
      if (!container.querySelector("iframe")) setFailed(true);
    }, 12000);

    return () => {
      clearTimeout(timeout);
      container.innerHTML = "";
    };
  }, []);

  return (
    <div className="relative w-full h-[420px] rounded-xl border border-zinc-800 bg-[#0d0d10] overflow-hidden">
      <div ref={containerRef} className="tradingview-widget-container h-full w-full" />
      {failed && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#0d0d10] text-zinc-500 p-6 text-center text-sm">
          أدوات TradingView التحليلية تحتاج اتصالاً خارجياً — ستظهر تلقائياً عند النشر على الإنترنت.
        </div>
      )}
    </div>
  );
}
