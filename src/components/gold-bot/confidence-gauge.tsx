"use client";

interface GaugeProps {
  value: number; // 0..100
  label: string;
  direction: "BUY" | "SELL" | "WAIT";
}

/**
 * عداد الثقة — قوس SVG نصف دائري متدرج
 */
export function ConfidenceGauge({ value, label, direction }: GaugeProps) {
  const clamped = Math.max(0, Math.min(100, value));
  // هندسة القوس: نصف دائرة نصف قطرها 80
  const radius = 80;
  const cx = 100;
  const cy = 95;
  const startAngle = Math.PI;
  const endAngle = 0;
  const angle = startAngle - (clamped / 100) * Math.PI;
  const x = cx + radius * Math.cos(angle);
  const y = cy - radius * Math.sin(angle);

  const arcPath = `M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${x} ${y}`;

  const color =
    direction === "BUY" ? "#10b981" : direction === "SELL" ? "#f43f5e" : "#f59e0b";

  return (
    <div className="flex flex-col items-center gap-1 select-none">
      <svg viewBox="0 0 200 110" className="w-44 h-24">
        {/* مسار الخلفية */}
        <path
          d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`}
          fill="none"
          stroke="#27272a"
          strokeWidth="12"
          strokeLinecap="round"
        />
        {/* المسار الفعلي */}
        <path
          d={arcPath}
          fill="none"
          stroke={color}
          strokeWidth="12"
          strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 6px ${color}66)` }}
        />
        <text
          x={cx}
          y={cy - 14}
          textAnchor="middle"
          fill="#fafafa"
          fontSize="28"
          fontWeight="700"
          fontFamily="inherit"
        >
          {clamped}%
        </text>
      </svg>
      <p className="text-xs text-zinc-400">{label}</p>
    </div>
  );
}
