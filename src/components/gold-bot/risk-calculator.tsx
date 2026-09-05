"use client";

import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Calculator } from "lucide-react";

/**
 * حاسبة حجم المركز — معادلة إدارة المخاطر القياسية للذهب
 * لوت واحد = 100 أونصة → حركة 1$ = ربح/خسارة 100$
 */
export function RiskCalculator({ entry, sl }: { entry: number | null; sl: number | null }) {
  const [account, setAccount] = useState("1000");
  const [riskPct, setRiskPct] = useState("1");

  const result = useMemo(() => {
    const acc = parseFloat(account) || 0;
    const pct = parseFloat(riskPct) || 0;
    if (!entry || !sl || acc <= 0 || pct <= 0) return null;

    const riskUsd = Math.abs(entry - sl);
    if (riskUsd <= 0) return null;

    const riskAmount = (acc * pct) / 100;
    // الذهب: 1 لوت = 100 أونصة، حركة 1$ = 100$ لكل لوت
    const lots = riskAmount / (riskUsd * 100);
    const ounces = lots * 100;

    return {
      riskAmount: riskAmount.toFixed(2),
      riskUsd: riskUsd.toFixed(2),
      pips: Math.round(riskUsd * 10),
      lots: lots.toFixed(3),
      ounces: Math.round(ounces),
      microLots: Math.round(lots * 100),
      lossPerLot: (riskUsd * 100).toFixed(0),
    };
  }, [account, riskPct, entry, sl]);

  return (
    <Card className="border-zinc-800 bg-[#101013]">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Calculator className="w-4 h-4 text-amber-400" />
          حاسبة حجم المركز (إدارة رأس المال)
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="account" className="text-xs text-zinc-400">
              حجم الحساب ($)
            </Label>
            <Input
              id="account"
              type="number"
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              min={0}
              className="bg-zinc-900 border-zinc-700 focus-visible:ring-amber-500/40 [direction:ltr]"
              dir="ltr"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="risk" className="text-xs text-zinc-400">
              المخاطرة لكل صفقة (%)
            </Label>
            <Input
              id="risk"
              type="number"
              value={riskPct}
              onChange={(e) => setRiskPct(e.target.value)}
              min={0.1}
              max={5}
              step={0.1}
              className="bg-zinc-900 border-zinc-700 focus-visible:ring-amber-500/40 [direction:ltr]"
              dir="ltr"
            />
          </div>
        </div>

        {result ? (
          <div className="grid grid-cols-2 gap-2 text-center">
            <StatBox label="حجم اللوت الموصى به" value={String(result.lots)} unit="لوت" highlight />
            <StatBox label="مبلغ المخاطرة" value={`${result.riskAmount}$`} unit={`(${riskPct}%)`} />
            <StatBox label="مسافة الوقف" value={`${result.riskUsd}$`} unit={`≈ ${result.pips} نقطة`} />
            <StatBox label="أونصات" value={String(result.ounces)} unit="oz" />
            <div className="col-span-2 text-[11px] text-zinc-500 leading-relaxed bg-zinc-900/70 rounded-lg border border-zinc-800 px-3 py-2">
              المعادلة: اللوت = (الحساب × نسبة المخاطرة) ÷ (مسافة الوقف بالدولار × 100$). خسارة اللوت الواحد إذا
              ضُرب الوقف = <span dir="ltr">{result.lossPerLot}$</span>. لا تتجاوز 2% لكل صفقة أبداً — قاعدة
              المحترفين في سوق يتحرك 30-60$ يومياً.
            </div>
          </div>
        ) : (
          <p className="text-xs text-zinc-500 leading-relaxed bg-zinc-900/70 rounded-lg border border-zinc-800 px-3 py-2.5">
            أدخل حجم الحساب ونسبة المخاطرة. تُستخدم مسافة الوقف من توصية البوت الحالية
            {entry && sl ? (
              <>
                {" "}
                (<span dir="ltr">{entry}$ → {sl}$</span>)
              </>
            ) : (
              " — لا توجد صفقة نشطة حالياً (وضع انتظار)"
            )}
            .
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function StatBox({
  label,
  value,
  unit,
  highlight,
}: {
  label: string;
  value: string;
  unit: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border px-2 py-2 ${
        highlight ? "border-amber-500/40 bg-amber-500/5" : "border-zinc-800 bg-zinc-900/60"
      }`}
    >
      <div className="text-[10px] text-zinc-500">{label}</div>
      <div className={`text-lg font-bold tabular-nums ${highlight ? "text-amber-300" : "text-zinc-200"}`} dir="ltr">
        {value} <span className="text-[10px] font-normal text-zinc-500">{unit}</span>
      </div>
    </div>
  );
}
