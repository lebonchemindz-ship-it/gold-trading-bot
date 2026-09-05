// ============================================================
// جلب بيانات السوق — Yahoo Finance (GC=F ذهب، DX-Y.NYB دولار، SI=F فضة)
// + تقويم الأخبار ForexFactory — مع تخزين مؤقت لتجنب حدود المعدل
// ============================================================

import type { Candle, NewsEvent } from "./types";
import { MarketDataError } from "./types";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

interface CacheEntry {
  data: unknown;
  ts: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 55_000; // 55 ثانية

function fromCache<T>(key: string): T | null {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.ts < CACHE_TTL) return entry.data as T;
  return null;
}

function toCache(key: string, data: unknown) {
  cache.set(key, { data, ts: Date.now() });
}

// ---------- جلب الشموع من Yahoo ----------
export async function fetchCandles(
  symbol: string,
  interval: "5m" | "15m" | "60m" | "1d",
  range: string
): Promise<Candle[]> {
  const key = `c:${symbol}:${interval}:${range}`;
  const cached = fromCache<Candle[]>(key);
  if (cached) return cached;

  const hosts = ["query1.finance.yahoo.com", "query2.finance.yahoo.com"];
  let lastErr: unknown = null;

  for (const host of hosts) {
    try {
      const url = `https://${host}/v8/finance/chart/${encodeURIComponent(
        symbol
      )}?interval=${interval}&range=${range}&includePrePost=false`;
      const res = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/json" },
        signal: AbortSignal.timeout(12_000),
        cache: "no-store",
      });
      if (!res.ok) {
        lastErr = new Error(`HTTP ${res.status} من ${host}`);
        continue;
      }
      const json = (await res.json()) as {
        chart?: {
          result?: {
            timestamp?: number[];
            indicators?: { quote?: { open?: (number | null)[]; high?: (number | null)[]; low?: (number | null)[]; close?: (number | null)[]; volume?: (number | null)[] }[] };
          }[];
          error?: unknown;
        };
      };
      const r = json.chart?.result?.[0];
      const q = r?.indicators?.quote?.[0];
      const ts = r?.timestamp;
      if (!r || !q || !ts || !q.close) {
        lastErr = new MarketDataError(`بيانات غير مكتملة لـ ${symbol}`);
        continue;
      }
      const candles: Candle[] = [];
      for (let i = 0; i < ts.length; i++) {
        const o = q.open?.[i];
        const h = q.high?.[i];
        const l = q.low?.[i];
        const c = q.close?.[i];
        if (o == null || h == null || l == null || c == null) continue;
        candles.push({ t: ts[i] * 1000, o, h, l, c, v: q.volume?.[i] ?? 0 });
      }
      if (candles.length < 30) {
        lastErr = new MarketDataError(`عدد شموع غير كافٍ لـ ${symbol} (${candles.length})`);
        continue;
      }
      toCache(key, candles);
      return candles;
    } catch (err) {
      lastErr = err;
    }
  }
  throw new MarketDataError(
    `تعذر جلب بيانات ${symbol}: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`
  );
}

// ---------- تجميع شموع الساعة إلى 4 ساعات ----------
export function aggregateTo4h(hourly: Candle[]): Candle[] {
  const out: Candle[] = [];
  let bucket: Candle | null = null;
  let bucketStart = -1;

  for (const c of hourly) {
    const hourIdx = Math.floor(c.t / 3600000);
    const idx4 = Math.floor(hourIdx / 4);
    const start = idx4 * 4 * 3600000;
    if (start !== bucketStart) {
      if (bucket) out.push(bucket);
      bucket = { ...c, t: start };
      bucketStart = start;
    } else if (bucket) {
      bucket.h = Math.max(bucket.h, c.h);
      bucket.l = Math.min(bucket.l, c.l);
      bucket.c = c.c;
      bucket.v += c.v;
    }
  }
  if (bucket) out.push(bucket);
  return out;
}

// ---------- جلب تقويم الأخبار الاقتصادية ----------
export async function fetchNews(): Promise<NewsEvent[]> {
  const key = "news:week";
  const cached = fromCache<NewsEvent[]>(key);
  if (cached) return cached;

  try {
    const res = await fetch("https://nfs.faireconomy.media/ff_calendar_thisweek.json", {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    if (!res.ok) return [];
    const json = (await res.json()) as {
      date?: string;
      title?: string;
      country?: string;
      impact?: string;
    }[];
    const events: NewsEvent[] = json
      .filter((e) => (e.country === "USD" || e.country === "ALL") && e.impact && e.title)
      .map((e) => ({
        time: new Date(e.date ?? 0).getTime(),
        title: e.title as string,
        impact: (e.impact as NewsEvent["impact"]) ?? "Low",
        currency: e.country ?? "USD",
      }))
      .filter((e) => !isNaN(e.time));
    toCache(key, events);
    return events;
  } catch {
    return []; // الأخبار تحسين اختياري — لا تفشل التحليل بدونها
  }
}

// ---------- المعلومات السريعة للسعر ----------
export async function fetchTicker(): Promise<{
  price: number;
  change24h: number;
  change24hPct: number;
  dayHigh: number;
  dayLow: number;
  ts: string;
}> {
  const key = "ticker:gcf";
  const cached = fromCache<{ price: number; change24h: number; change24hPct: number; dayHigh: number; dayLow: number; ts: string }>(key);
  if (cached) return cached;

  const candles = await fetchCandles("GC=F", "60m", "2d");
  const price = candles[candles.length - 1].c;

  // آخر 24 ساعة
  const now = candles[candles.length - 1].t;
  const dayAgo = now - 24 * 3600000;
  const window = candles.filter((c) => c.t >= dayAgo);
  const open24 = window.length ? window[0].o : price;

  let dayHigh = -Infinity;
  let dayLow = Infinity;
  for (const c of window) {
    dayHigh = Math.max(dayHigh, c.h);
    dayLow = Math.min(dayLow, c.l);
  }

  const out = {
    price: round2(price),
    change24h: round2(price - open24),
    change24hPct: round2(((price - open24) / open24) * 100),
    dayHigh: round2(dayHigh),
    dayLow: round2(dayLow),
    ts: new Date().toISOString(),
  };
  toCache(key, out);
  return out;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
