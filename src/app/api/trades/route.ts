import { NextResponse } from "next/server";

// ============================================================
// سجل الصفقات الآلي — يقرأ data/trades.json من مستودع GitHub
// المراقب (GitHub Actions) يحدّثه كل 5 دقائق حتى وأنت offline
// ============================================================

export const dynamic = "force-dynamic";

const RAW_URL =
  "https://raw.githubusercontent.com/lebonchemindz-ship-it/gold-trading-bot/main/data/trades.json";

interface RawTrade {
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
  score?: number;
  sessionLabel?: string;
  status: "open" | "win" | "loss" | "timeout";
  closedAt?: string | null;
  closePrice?: number | null;
  resultR?: number | null;
}

interface RawFile {
  updatedAt?: string | null;
  lastCheckedAt?: string | null;
  telegramEnabled?: boolean;
  trades?: RawTrade[];
}

export async function GET() {
  try {
    const r = await fetch(RAW_URL, {
      cache: "no-store",
      headers: { "User-Agent": "gold-trading-bot-site" },
    });
    if (!r.ok) throw new Error(`GitHub raw status ${r.status}`);
    const raw: RawFile = await r.json();

    const trades = raw.trades ?? [];
    const closed = trades.filter((t) => t.status !== "open");
    const wins = closed.filter((t) => t.status === "win").length;
    const losses = closed.filter((t) => t.status === "loss").length;
    const totalR = closed.reduce((a, t) => a + (t.resultR ?? 0), 0);

    return NextResponse.json({
      success: true,
      updatedAt: raw.updatedAt ?? null,
      lastCheckedAt: raw.lastCheckedAt ?? null,
      telegramEnabled: Boolean(raw.telegramEnabled),
      monitorInterval: "كل 5 دقائق (GitHub Actions)",
      stats: {
        total: trades.length,
        open: trades.length - closed.length,
        wins,
        losses,
        winRate: closed.length ? Math.round((wins / closed.length) * 1000) / 10 : null,
        totalR: Math.round(totalR * 10) / 10,
      },
      trades,
    });
  } catch (e) {
    return NextResponse.json(
      {
        success: false,
        error: "تعذر جلب سجل الصفقات من المستودع",
        detail: e instanceof Error ? e.message : String(e),
      },
      { status: 502 }
    );
  }
}
