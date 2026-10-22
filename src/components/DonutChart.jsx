import React from "react";

/**
 * Tek Değerli Dairesel Halka Gösterge (Circular Gauge / Radial Progress)
 */
export function CircularGauge({
  value = 0,
  size = 80,
  strokeWidth = 8,
  gradientId,
  colorStart = "#10b981",
  colorEnd = "#06b6d4",
  trackColor = "rgba(51, 65, 85, 0.35)",
  label,
  sublabel,
  showValue = true,
  unit = "%",
  className = "",
}) {
  const clampedValue = Math.min(100, Math.max(0, value));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (clampedValue / 100) * circumference;
  const gid = gradientId || `gauge-grad-${Math.round(size)}-${Math.round(value)}`;

  return (
    <div className={`relative inline-flex items-center justify-center shrink-0 ${className}`}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="transform -rotate-90 transition-all duration-700 ease-out"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={gid} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={colorStart} />
            <stop offset="100%" stopColor={colorEnd} />
          </linearGradient>
        </defs>

        {/* Arka plan halkası */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={trackColor}
          strokeWidth={strokeWidth}
          fill="none"
        />

        {/* Dolu ön halka */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={`url(#${gid})`}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          fill="none"
          className="transition-all duration-700 ease-out"
        />
      </svg>

      {/* Merkezdeki değer ve etiket */}
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none px-1">
        {showValue && (
          <span className="font-mono font-bold leading-none text-white tracking-tight" style={{ fontSize: size * 0.24 }}>
            {Math.round(clampedValue)}
            {unit && <span className="text-[0.65em] opacity-80 ml-0.5">{unit}</span>}
          </span>
        )}
        {label && (
          <span
            className="font-medium text-slate-300 leading-none mt-0.5 uppercase tracking-wider"
            style={{ fontSize: Math.max(8, size * 0.11) }}
          >
            {label}
          </span>
        )}
        {sublabel && (
          <span
            className="text-slate-400 leading-none mt-0.5"
            style={{ fontSize: Math.max(7, size * 0.09) }}
          >
            {sublabel}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Çok Segmentli Donut Grafik (Örn: %10 Yüksek Risk, %25 Orta Risk, %65 Güvenli Sırt)
 */
export function MultiSegmentDonut({
  segments = [],
  size = 130,
  strokeWidth = 14,
  centerTitle,
  centerSubtitle,
  showLegend = true,
  className = "",
}) {
  const total = segments.reduce((sum, s) => sum + s.value, 0) || 100;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  let accumulatedPercent = 0;

  return (
    <div className={`flex flex-col items-center gap-3 ${className}`}>
      <div className="relative inline-flex items-center justify-center shrink-0">
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="transform -rotate-90"
        >
          {/* Arka plan halkası */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="rgba(30, 41, 59, 0.7)"
            strokeWidth={strokeWidth}
            fill="none"
          />

          {segments.map((seg, idx) => {
            const percent = (seg.value / total) * 100;
            const strokeDashoffset = circumference - (percent / 100) * circumference;
            const rotationOffset = (accumulatedPercent / 100) * 360;
            accumulatedPercent += percent;

            return (
              <circle
                key={idx}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                stroke={seg.color}
                strokeWidth={strokeWidth}
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="butt"
                fill="none"
                style={{
                  transformOrigin: "center",
                  transform: `rotate(${rotationOffset}deg)`,
                  transition: "stroke-dashoffset 0.6s ease",
                }}
              />
            );
          })}
        </svg>

        {/* Merkez Yazısı */}
        {(centerTitle || centerSubtitle) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none px-2">
            {centerTitle && (
              <span
                className="font-mono font-bold text-white leading-none tracking-tight"
                style={{ fontSize: size * 0.2 }}
              >
                {centerTitle}
              </span>
            )}
            {centerSubtitle && (
              <span
                className="text-slate-400 font-medium leading-tight mt-1"
                style={{ fontSize: Math.max(9, size * 0.09) }}
              >
                {centerSubtitle}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Lejant (Açıklama) */}
      {showLegend && (
        <div className="w-full grid grid-cols-1 gap-1.5 text-xs">
          {segments.map((seg, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between py-1 px-2 rounded bg-slate-900/60 border border-slate-800/80"
            >
              <div className="flex items-center gap-2 truncate pr-2">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: seg.color }}
                />
                <span className="text-slate-300 truncate text-[11px] font-medium">
                  {seg.label}
                </span>
              </div>
              <span className="font-mono font-bold text-slate-100 text-[11px] shrink-0">
                %{seg.value}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Mini Rozet Gösterge (Listeler için kompakt circular progress badge)
 */
export function MiniCircularBadge({
  value = 0,
  size = 32,
  strokeWidth = 3.5,
  color = "#22d3ee",
  trackColor = "rgba(51, 65, 85, 0.4)",
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (Math.min(100, Math.max(0, value)) / 100) * circumference;

  return (
    <div className="relative inline-flex items-center justify-center shrink-0">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="transform -rotate-90"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={trackColor}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          fill="none"
        />
      </svg>
      <span className="absolute text-[10px] font-mono font-bold text-white">
        {Math.round(value)}
      </span>
    </div>
  );
}
