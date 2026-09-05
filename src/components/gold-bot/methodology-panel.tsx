"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BookOpen, ChevronDown, ChevronUp, Fingerprint, Scale, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * لوحة "كيف يعمل البوت" — شرح المنهجية الكاملة
 * الشفافية هنا إثبات أن التحليل مدروس وليس عشوائياً
 */
export function MethodologyPanel({ fingerprint }: { fingerprint: string }) {
  const [open, setOpen] = useState(false);

  return (
    <Card className="border-zinc-800 bg-[#101013]">
      <CardHeader
        className="cursor-pointer select-none"
        onClick={() => setOpen(!open)}
      >
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-amber-400" />
            كيف يعمل البوت؟ (المنهجية الكاملة — بدون عشوائية)
          </CardTitle>
          {open ? <ChevronUp className="w-4 h-4 text-zinc-500" /> : <ChevronDown className="w-4 h-4 text-zinc-500" />}
        </div>
      </CardHeader>
      {open && (
        <CardContent className="flex flex-col gap-4">
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-bold text-amber-300 flex items-center gap-1.5">
              <Scale className="w-3.5 h-3.5" />
              نظام الأعمدة السبعة الموزونة (Confluence Engine)
            </h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              البوت يجلب شموع الذهب الحقيقية (GC=F من Yahoo Finance) على 5 أطر: 5 دقائق، 15 دقيقة، ساعة، 4 ساعات،
              يومي — ثم يحسب 12 مؤشراً رياضياً قياسياً (EMA 9/21/50/200، RSI-14 بطريقة Wilder، MACD، بولينجر
              باندز، ATR-14، ستوكاستك، ADX، VWAP). كل مؤشر يصدر إشارة موثقة برقم، وتُجمع الإشارات في 7 أعمدة:
            </p>
            <ul className="text-xs text-zinc-400 flex flex-col gap-1.5">
              {[
                ["الاتجاه متعدد الأطر — وزن 24%", "ترتيب EMAs + اتجاه الإطار الأعلى + ADX: التداول مع التيار فقط"],
                ["الزخم والمذبذبات — وزن 20%", "RSI بمناطقه وميله + MACD + ستوكاستك + كشف التباعدات"],
                ["الموقع من الدعم/المقاومة — وزن 14%", "المسافة للمستويات بمقياس ATR + البيفوت + فيبو 61.8% + النطاق الآسيوي"],
                ["حركة السعر والشموع — وزن 10%", "أنماط الابتلاع والمطرقة والشموع الزخمية + موقع VWAP"],
                ["الارتباط الكلي — وزن 10%", "مؤشر الدولار DXY (علاقة عكسية) + الفضة (علاقة موجبة) + أداء 5 أيام"],
                ["الجلسة والتوقيت — وزن 12%", "جودة السيولة (تداخل لندن/نيويورك ذروتها) + اتجاه اليوم من الافتتاح"],
                ["التقلب وبولينجر — وزن 10%", "نظام ATR + ضغط/توسع بولينجر + سير الحزام Band Walk"],
              ].map(([t, d]) => (
                <li key={t} className="leading-relaxed">
                  <span className="text-zinc-200 font-semibold">• {t}</span>
                  <br />
                  <span className="text-zinc-500">{d}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-bold text-amber-300">معادلة الثقة (ليست رقماً عشوائياً)</h3>
            <div className="rounded-lg bg-zinc-900/70 border border-zinc-800 p-3 font-mono text-[11px] text-zinc-300 leading-relaxed" dir="ltr">
              score = Σ(pillar_score × weight) / 100 &nbsp;…&nbsp; range [-100, +100]
              <br />
              direction = BUY if score ≥ +15 | SELL if score ≤ -15 | WAIT otherwise
              <br />
              confidence = 50 + |score| × 0.45 × qualityGate &nbsp;…&nbsp; capped at 95%
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed">
              بوابة الجودة (qualityGate) تخفض الثقة تلقائياً عند: تقلب ميت (×0.78)، تعارض الاتجاه مع الزخم (×0.82)،
              خارج جلسات السيولة (×0.88)، أو بيانات غير كافية (×0.85). هذه القواعد مستمدة من أبحاث سلوك الذهب
              الفعلي.
            </p>
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-bold text-amber-300 flex items-center gap-1.5">
              <Fingerprint className="w-3.5 h-3.5" />
              إثبات الحتمية
            </h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              التحليل دالة رياضية نقية من بيانات السعر — لا يوجد أي مولّد أرقام عشوائية في أي مكان في المحرك.
              البصمة الحالية لبيانات هذا التحليل:
              <Badge variant="outline" className="mx-1 font-mono text-[10px] border-zinc-700 text-zinc-300" dir="ltr">
                #{fingerprint}
              </Badge>
              — نفس البيانات ستنتج دائماً نفس البصمة ونفس الدرجة ونسبة الثقة.
            </p>
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-bold text-amber-300">مصادر المنهجية</h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              محرك التقييم مبني على قواعد موثقة من: كورس استراتيجيات الذهب المربحة (ATR + EMA + فيبوناتشي)، أبحاث
              عميقة في سلوك XAUUSD الحديث (2024-2026): أفضل أوقات التداول (تداخل الجلسات 13:00-17:00 GMT)، كسر
              النطاق الآسيوي (هدف 1.5-2×)، ارتداد بولينجر+RSI، نظام EMA50/200 الترندي، كنس السيولة SMC، وقواعد
              إدارة المخاطر (1-2% لكل صفقة، وقف 1.35-2.2×ATR، عائد/مخاطرة ≥ 1:2).
            </p>
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-bold text-amber-300 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5" />
              ما لا يفعله البوت (بصدق)
            </h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              البوت لا يعرف المستقبل ولا يملك كرة بلورية — لا يوجد نظام على وجه الأرض يضمن الربح. ما يفعله هو
              تحويل قرارات المشاعر إلى قواعد رياضية منضبطة: دخول فقط عند تزامن شروط عالية الاحتمال، وقف خسارة
              محسوب على التقلب الفعلي، وأهداف بمقاس عائد/مخاطرة موجب. الالتزام بالمنهجية على المدى الطويل هو
              إياها ما يصنع الفارق بين المضارب والمحترف.
            </p>
          </section>
        </CardContent>
      )}
    </Card>
  );
}
