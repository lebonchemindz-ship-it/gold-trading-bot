// ============================================================
// محرك الأخبار — أحداث اليوم الاقتصادية + عناوين الذهب الحية
// المصادر (مجانية بلا مفاتيح):
//   • تقويم ForexFactory (nfs.faireconomy.media) — أحداث الأسبوع
//   • RSS: ForexLive / Investing.com (ذهب) / Kitco / FXStreet
// مع فرز حسب الصلة بالذهب وإزالة التكرار وكاش 5 دقائق
// ============================================================

import type { NewsEvent } from "./types";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export interface CalendarEvent extends NewsEvent {
  forecast: string | null;
  previous: string | null;
}

export interface NewsHeadline {
  title: string;
  link: string;
  source: string;
  time: number; // ms UTC
  relevant: boolean;
  score: number;
}

const cache = new Map<string, { data: unknown; ts: number }>();
function fromCache<T>(key: string, ttl: number): T | null {
  const e = cache.get(key);
  if (e && Date.now() - e.ts < ttl) return e.data as T;
  return null;
}
function toCache(key: string, data: unknown) {
  cache.set(key, { data, ts: Date.now() });
}

// ---------- التقويم الاقتصادي (أسبوعي مع التفاصيل) ----------
export async function fetchCalendarWeek(): Promise<CalendarEvent[]> {
  const cached = fromCache<CalendarEvent[]>("cal:week", 10 * 60_000);
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
      forecast?: string;
      previous?: string;
    }[];
    const events: CalendarEvent[] = json
      .filter((e) => (e.country === "USD" || e.country === "ALL") && e.impact && e.title)
      .map((e) => ({
        time: new Date(e.date ?? 0).getTime(),
        title: e.title as string,
        impact: (e.impact as NewsEvent["impact"]) ?? "Low",
        currency: e.country ?? "USD",
        forecast: e.forecast?.trim() || null,
        previous: e.previous?.trim() || null,
      }))
      .filter((e) => !isNaN(e.time))
      .sort((a, b) => a.time - b.time);
    toCache("cal:week", events);
    return events;
  } catch {
    return [];
  }
}

/** أحداث يوم معين (UTC) — كل درجات التأثير، مرتبة زمنياً */
export function eventsOfToday(events: CalendarEvent[], now = new Date()): CalendarEvent[] {
  const dayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const dayEnd = dayStart + 86_400_000;
  return events.filter((e) => e.time >= dayStart && e.time < dayEnd);
}

// ---------- عناوين RSS ----------
const FEEDS: { url: string; source: string; gold?: boolean }[] = [
  {
    // بحث مخصص عن الذهب والدولار والفيدرالي — أقوى مصدر مباشر
    url: "https://news.google.com/rss/search?q=gold+price+OR+xau/usd+OR+federal+reserve&hl=en-US&gl=US&ceid=US:en",
    source: "Google News",
    gold: true,
  },
  { url: "https://www.forexlive.com/feed/news", source: "ForexLive" },
  { url: "https://www.investing.com/rss/news.rss", source: "Investing.com" },
  {
    url: "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=20910258",
    source: "CNBC",
  },
  { url: "https://feeds.a.dj.com/rss/RSSMarketsMain.xml", source: "WSJ" },
];

// كلمات الصلة بالذهب — قوية + متوسطة
const STRONG = /gold|xau|bullion|precious metal/gi;
const MEDIUM =
  /fed|fomc|powell|cpi|inflation|nfp|nonfarm|payroll|dollar|dxy|greenback|rate (cut|hike)|yields?|treasur|tariff|trade war|geopolit|central bank|haven|risk-off|stimulus|jobs report|pce|gdp|pmi data/gi;

function stripTags(s: string): string {
  return s
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extract(xml: string, tag: string): string {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i");
  const m = xml.match(re);
  return m ? stripTags(m[1]) : "";
}

function parseRss(xml: string, source: string): NewsHeadline[] {
  const out: NewsHeadline[] = [];
  const items = xml.split(/<item[\s>]/i).slice(1);
  for (const raw of items) {
    const item = raw.slice(0, 4000);
    const title = extract(item, "title");
    if (!title || title.length < 8) continue;
    const link = extract(item, "link");
    const pub = extract(item, "pubDate") || extract(item, "published") || extract(item, "updated");
    const t = pub ? Date.parse(pub) : NaN;

    const strong = (title.match(STRONG) ?? []).length;
    const medium = (title.match(MEDIUM) ?? []).length;
    const score = strong * 3 + medium;
    out.push({
      title: title.slice(0, 220),
      link: link.slice(0, 300),
      source,
      time: isNaN(t) ? Date.now() : t,
      relevant: score >= 1,
      score,
    });
  }
  return out;
}

export async function fetchHeadlines(): Promise<NewsHeadline[]> {
  const cached = fromCache<NewsHeadline[]>("news:rss", 5 * 60_000);
  if (cached) return cached;

  const results = await Promise.allSettled(
    FEEDS.map((f) =>
      fetch(f.url, {
        headers: { "User-Agent": UA, Accept: "application/rss+xml, application/xml, text/xml, */*" },
        signal: AbortSignal.timeout(8_000),
        cache: "no-store",
      }).then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const parsed = parseRss(await res.text(), f.source);
        if (f.gold) for (const h of parsed) h.relevant = true; // مصدر ذهب مخصص
        return parsed;
      })
    )
  );

  let all: NewsHeadline[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") all = all.concat(r.value);
  }

  // إزالة التكرار (أول 48 حرفاً أبجدية-رقمية)
  const seen = new Set<string>();
  const dedup: NewsHeadline[] = [];
  for (const h of all) {
    const k = h.title.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 48);
    if (seen.has(k)) continue;
    seen.add(k);
    dedup.push(h);
  }

  // المرتبطة بالذهب أولاً ثم الأحدث
  dedup.sort((a, b) => {
    if (a.relevant !== b.relevant) return a.relevant ? -1 : 1;
    return b.time - a.time;
  });

  const top = dedup.slice(0, 14);
  if (top.length) toCache("news:rss", top);
  return top;
}
