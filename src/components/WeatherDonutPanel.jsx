import React, { useState } from "react";
import {
  CloudRain,
  Sun,
  CloudDrizzle,
  CloudLightning,
  RefreshCw,
  Thermometer,
  ShieldCheck,
  AlertTriangle,
  MapPin,
  Layers,
  Zap,
} from "lucide-react";
import { CircularGauge } from "./DonutChart";

export default function WeatherDonutPanel({
  selectedBasinKey,
  currentBasin,
  weatherData = {},
  onRefreshWeather,
  onTriggerFlood,
}) {
  const [testPrecipitation, setTestPrecipitation] = useState(null);
  const [isRotating, setIsRotating] = useState(false);

  // Canlı veriler veya varsayılanlar
  const livePrecip = Number(weatherData.precipitation ?? 0);
  const temperature = Number(weatherData.temperature ?? 19);
  const isRefreshing = Boolean(weatherData.refreshing || isRotating);

  // İnteraktif test değeri seçildiyse onu, yoksa canlı API değerini göster
  const activePrecip = testPrecipitation !== null ? testPrecipitation : livePrecip;

  const isExtreme = activePrecip > 25;
  const isModerate = activePrecip >= 10 && activePrecip <= 25;
  const isCalm = activePrecip < 10;

  // Donut renkleri
  const gaugeColorStart = isExtreme ? "#f43f5e" : isModerate ? "#f59e0b" : "#10b981";
  const gaugeColorEnd = isExtreme ? "#e11d48" : isModerate ? "#fbbf24" : "#06b6d4";

  // Hava durumu ikonu & etiketi
  const weatherIcon = isExtreme ? (
    <CloudLightning size={26} className="text-rose-400" />
  ) : isModerate ? (
    <CloudRain size={26} className="text-amber-400" />
  ) : activePrecip > 0 ? (
    <CloudDrizzle size={26} className="text-cyan-400" />
  ) : (
    <Sun size={26} className="text-amber-300" />
  );

  const statusTitle = isExtreme
    ? "Kritik Taşkın Alarmı"
    : isModerate
      ? "Zemin Doygunluğu Uyarısı"
      : "Şebeke Güvenli Kotunda";

  const statusBadgeColor = isExtreme
    ? "bg-rose-950 text-rose-300 border-rose-800"
    : isModerate
      ? "bg-amber-950 text-amber-300 border-amber-800"
      : "bg-emerald-950 text-emerald-300 border-emerald-800";

  const handleRefreshClick = () => {
    setIsRotating(true);
    setTestPrecipitation(null);
    onRefreshWeather?.();
    setTimeout(() => setIsRotating(false), 800);
  };

  // Havza geçirimsizlik tahmini
  const basinPermeability =
    selectedBasinKey === "ayamama"
      ? 88
      : selectedBasinKey === "esenyurt"
        ? 92
        : selectedBasinKey === "fatih"
          ? 86
          : 84;

  return (
    <aside className="w-80 lg:w-88 bg-slate-900 border-l border-slate-800 p-4 flex flex-col justify-between overflow-y-auto shrink-0 space-y-4">
      <div className="space-y-3.5">
        
        {/* 1. Üst Başlık & Canlı Radar Durumu */}
        <div className="border-b border-slate-800 pb-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-cyan-950 text-cyan-300 border border-cyan-800 text-xs">
              <CloudRain size={14} />
            </span>
            <div>
              <h2 className="text-xs font-bold text-white tracking-tight">
                Canlı Hava &amp; Şebeke Radarı
              </h2>
              <span className="text-[10px] text-slate-400 block font-medium">
                Open-Meteo · Anlık Telemetri
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleRefreshClick}
            disabled={isRefreshing}
            className="flex items-center gap-1 px-2 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-[10px] font-semibold text-slate-300 border border-slate-700 transition"
            title="Hava durumunu yenile"
          >
            <RefreshCw
              size={11}
              className={isRefreshing ? "animate-spin text-cyan-400" : "text-slate-400"}
            />
            <span>{isRefreshing ? "Güncelleniyor" : "Yenile"}</span>
          </button>
        </div>

        {/* 2. Ana "Tatlış" Donut Grafik: Yağış Şiddeti */}
        <section className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4 flex flex-col items-center justify-center relative overflow-hidden shadow-lg">
          {/* Arka plan hafif ışıma */}
          <div
            className={`absolute -top-12 -right-12 w-28 h-28 rounded-full blur-2xl opacity-20 pointer-events-none ${
              isExtreme ? "bg-rose-500" : isModerate ? "bg-amber-500" : "bg-cyan-500"
            }`}
          />

          <div className="w-full flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-slate-300 flex items-center gap-1.5">
              <span>Yağış Baskısı</span>
            </span>
            <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${statusBadgeColor}`}>
              ● {statusTitle}
            </span>
          </div>

          {/* Dairesel Halka Donut Göstergesi */}
          <div className="relative my-2 flex items-center justify-center">
            <CircularGauge
              value={Math.min(100, (activePrecip / 85) * 100)}
              size={130}
              strokeWidth={12}
              colorStart={gaugeColorStart}
              colorEnd={gaugeColorEnd}
              trackColor="rgba(30, 41, 59, 0.6)"
              gradientId="weather-radar-hero-gauge"
              showValue={false}
            />

            {/* Donut İçi Bilgi */}
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
              <div className="mb-0.5 transform transition-transform hover:scale-110">
                {weatherIcon}
              </div>
              <span className="font-mono text-2xl font-extrabold text-white tracking-tight leading-none">
                {activePrecip.toFixed(1)}
              </span>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">
                mm/sa
              </span>
            </div>
          </div>

          <div className="text-center mt-1 space-y-0.5">
            <p className="text-[11px] font-semibold text-slate-200">
              {currentBasin?.name ?? "İstanbul Geneli"}
            </p>
            <p className="text-[9px] text-slate-500">
              Kritik taşkın kret eşiği: <span className="font-mono text-slate-300 font-bold">25 mm/sa</span>
            </p>
          </div>
        </section>

        {/* 3. İkili Mini Donut Göstergeleri: Sıcaklık & Zemin Geçirimsizliği */}
        <section className="grid grid-cols-2 gap-2.5">
          {/* Sıcaklık Donut'ı */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3 flex flex-col items-center text-center space-y-1.5">
            <div className="flex items-center gap-1 text-[10px] font-bold text-slate-400">
              <Thermometer size={12} className="text-cyan-400" />
              <span>Sıcaklık</span>
            </div>

            <CircularGauge
              value={Math.min(100, Math.max(0, ((temperature + 10) / 50) * 100))}
              size={56}
              strokeWidth={6}
              colorStart="#38bdf8"
              colorEnd="#818cf8"
              trackColor="rgba(30, 41, 59, 0.5)"
              gradientId="temp-mini-gauge"
              showValue={false}
            />

            <div className="font-mono text-sm font-bold text-white leading-none">
              {temperature.toFixed(0)}°C
            </div>
            <span className="text-[9px] text-slate-500">Mevsim Normalleri</span>
          </div>

          {/* Vadi Zemin Geçirimsizliği Donut'ı */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3 flex flex-col items-center text-center space-y-1.5">
            <div className="flex items-center gap-1 text-[10px] font-bold text-slate-400">
              <Layers size={12} className="text-amber-400" />
              <span>Geçirimsizlik</span>
            </div>

            <CircularGauge
              value={basinPermeability}
              size={56}
              strokeWidth={6}
              colorStart="#f59e0b"
              colorEnd="#ef4444"
              trackColor="rgba(30, 41, 59, 0.5)"
              gradientId="permeability-mini-gauge"
              showValue={false}
            />

            <div className="font-mono text-sm font-bold text-amber-300 leading-none">
              %{basinPermeability}
            </div>
            <span className="text-[9px] text-slate-500">Betonlaşma Oranı</span>
          </div>
        </section>

        {/* 4. "Tatlış" İnteraktif Radar Test Çipleri */}
        <section className="rounded-xl border border-slate-800 bg-slate-950/70 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-300">
              🎮 İnteraktif Radar Testi
            </span>
            <span className="text-[9px] text-cyan-400 font-mono">Tıkla &amp; Gör</span>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            {[
              { label: "☀️ 0.0 mm (Canlı)", val: 0.0, desc: "Sakin" },
              { label: "🌦️ 12.0 mm (Hafif)", val: 12.0, desc: "Zemin Doygun" },
              { label: "🌧️ 28.0 mm (Sağanak)", val: 28.0, desc: "Eşik Aşıldı" },
              { label: "⚡ 85.0 mm (Pik Sel)", val: 85.0, desc: "Afet Alarmı" },
            ].map((chip) => {
              const isSelected = activePrecip === chip.val;
              return (
                <button
                  key={chip.val}
                  type="button"
                  onClick={() => setTestPrecipitation(chip.val)}
                  className={`p-2 rounded-lg border text-left transition select-none ${
                    isSelected
                      ? "border-cyan-500 bg-cyan-950 text-cyan-100 shadow-[0_0_10px_rgba(6,182,212,0.25)]"
                      : "border-slate-800 bg-slate-900/60 text-slate-400 hover:border-slate-700 hover:text-slate-200"
                  }`}
                >
                  <div className="text-[10px] font-bold truncate">{chip.label}</div>
                  <div className="text-[8px] text-slate-500 mt-0.5">{chip.desc}</div>
                </button>
              );
            })}
          </div>

          {/* Test Değerini Sıfırla veya Afet Başlat */}
          {testPrecipitation !== null && (
            <div className="pt-1.5 flex items-center justify-between border-t border-slate-800 text-[10px]">
              <button
                type="button"
                onClick={() => setTestPrecipitation(null)}
                className="text-slate-400 hover:text-cyan-300 underline"
              >
                Canlı Radara Dön
              </button>

              {activePrecip >= 25 && (
                <button
                  type="button"
                  onClick={() => onTriggerFlood?.(true, activePrecip)}
                  className="px-2.5 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white font-bold transition flex items-center gap-1 shadow"
                >
                  <Zap size={11} />
                  <span>Simülasyonu Başlat</span>
                </button>
              )}
            </div>
          )}
        </section>

        {/* 5. Seçili Havza Varlık Özeti */}
        <section className="rounded-xl border border-slate-800 bg-slate-950/50 p-3 space-y-1.5 text-xs">
          <div className="flex items-center gap-1.5 text-slate-300 font-bold text-[11px]">
            <MapPin size={12} className="text-cyan-400" />
            <span>Topografik Çanak Profili</span>
          </div>

          <div className="grid grid-cols-2 gap-1.5 text-[10px] pt-1">
            <div className="p-1.5 rounded bg-slate-900/80 border border-slate-800">
              <span className="text-slate-500 block">Vadi Tabanı Kotu:</span>
              <span className="font-mono font-bold text-rose-300">
                &lt; 15 m (Kritik)
              </span>
            </div>
            <div className="p-1.5 rounded bg-slate-900/80 border border-slate-800">
              <span className="text-slate-500 block">Güvenli Sırt Kotu:</span>
              <span className="font-mono font-bold text-emerald-300">
                {currentBasin?.safeZone?.elevation ?? 85} m
              </span>
            </div>
          </div>
        </section>

      </div>

      <div className="pt-2 border-t border-slate-800 text-[9px] text-slate-500 text-center">
        SurgeTwin AI • Canlı Radar Karar Desteği
      </div>
    </aside>
  );
}
