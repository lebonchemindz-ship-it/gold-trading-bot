"use client";

import type { SignalResponse } from "@/lib/engine/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Layers } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * جدول الأطر الزمنية — نظرة شاملة على كل إطار
 */
export function TFTable({ signal }: { signal: SignalResponse }) {
  return (
    <Card className="border-zinc-800 bg-[#101013]">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Layers className="w-4 h-4 text-amber-400" />
          لوحة الأطر الزمنية (تزامن المؤشرات)
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-zinc-800 hover:bg-transparent">
                <TableHead className="text-right text-zinc-400 font-medium">الإطار</TableHead>
                <TableHead className="text-right text-zinc-400 font-medium">الاتجاه (EMA)</TableHead>
                <TableHead className="text-center text-zinc-400 font-medium">RSI</TableHead>
                <TableHead className="text-center text-zinc-400 font-medium">MACD</TableHead>
                <TableHead className="text-center text-zinc-400 font-medium">Stoch</TableHead>
                <TableHead className="text-center text-zinc-400 font-medium">الحكم</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {signal.timeframeRows.map((row) => (
                <TableRow key={row.tf} className="border-zinc-800/60">
                  <TableCell className="font-semibold text-zinc-200 py-2.5">{row.tf}</TableCell>
                  <TableCell className="text-zinc-300 text-xs py-2.5">
                    <span
                      className={cn(
                        "inline-block px-2 py-0.5 rounded-md text-[11px]",
                        row.trend.includes("صاعد")
                          ? "bg-emerald-500/10 text-emerald-400"
                          : row.trend.includes("هابط")
                            ? "bg-rose-500/10 text-rose-400"
                            : "bg-zinc-500/10 text-zinc-400"
                      )}
                    >
                      {row.trend}
                    </span>
                  </TableCell>
                  <TableCell className="text-center tabular-nums text-zinc-300 py-2.5" dir="ltr">
                    {row.rsi}
                  </TableCell>
                  <TableCell className="text-center text-xs py-2.5">
                    <span
                      className={cn(
                        row.macd === "إيجابي" ? "text-emerald-400" : row.macd === "سلبي" ? "text-rose-400" : "text-zinc-400"
                      )}
                    >
                      {row.macd}
                    </span>
                  </TableCell>
                  <TableCell className="text-center tabular-nums text-zinc-400 text-xs py-2.5" dir="ltr">
                    {row.stoch}
                  </TableCell>
                  <TableCell className="text-center py-2.5">
                    <span
                      className={cn(
                        "inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold",
                        row.verdict === "شراء"
                          ? "bg-emerald-500 text-zinc-950"
                          : row.verdict === "بيع"
                            ? "bg-rose-500 text-zinc-950"
                            : "bg-zinc-700 text-zinc-300"
                      )}
                    >
                      {row.verdict}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <p className="text-[11px] text-zinc-300 px-4 py-3 border-t border-zinc-800/60 leading-relaxed">
          الحكم يُشتق من 6 مؤشرات لكل إطار (EMA50/200، السعر مقابل EMA، RSI، MACD، Stochastic). التزامن عبر 4 أطر
          أو أكثر = إشارة قوية — هذا جوهر منهجية Confluence.
        </p>
      </CardContent>
    </Card>
  );
}
