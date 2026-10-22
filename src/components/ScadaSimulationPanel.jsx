import React from "react";
import {
  ShieldAlert,
  ShieldCheck,
  Zap,
  CloudRain,
  Droplets,
  MapPin,
  ChevronDown,
  ChevronUp,
  FileText,
  AlertTriangle,
  RotateCcw,
} from "lucide-react";

export default function ScadaSimulationPanel({
  currentBasin,
  scenario,
  selectedPhase,
  selectPhase,
  waterLevelCm,
  handleWaterLevelChange,
  isolationActive,
  isolationTargets,
  protectedAssetUsd,
  toggleIsolation,
  rainfallMm,
  setManualRainfall,
  band,
  humidity,
  weatherFloodActive,
  SLIDER_MAX_MM,
  RAIN_MODERATE_MM,
  RAIN_EXTREME_MM,
  isManual,
  showOpsLog,
  setShowOpsLog,
  crisisEventLog,
  onOpenReport,
  onResetSimulation,
  PHASE_SHORT,
  PHASE_LABEL,
  formatDay,
}) {
  return (
    <div className="space-y-3.5">
      {/* ⚡ Başlık & Çıkış Butonu */}
      <div className="border-b border-slate-800 pb-2.5 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-1.5">
            <span className="flex h-5 w-5 items-center justify-center rounded bg-rose-950 text-rose-300 border border-rose-800 text-[11px] font-bold">
              ⚡
            </span>
            <h2 className="text-xs font-bold text-white uppercase tracking-tight">
              SCADA Afet Komuta
            </h2>
          </div>
          <span className="text-[10px] text-slate-400 block mt-0.5 font-medium">
            {currentBasin?.name} · {scenario?.label}
          </span>
        </div>

        <button
          type="button"
          onClick={onResetSimulation}
          className="inline-flex items-center gap-1 rounded bg-slate-800 hover:bg-slate-700 px-2 py-1 text-[10px] font-semibold text-slate-300 border border-slate-700 transition"
          title="Simülasyonu sonlandırıp canlı duruma dön"
        >
          <RotateCcw size={11} />
          <span>Normale Dön</span>
        </button>
      </div>

      {/* 🌊 Taşkın Su Seviyesi & Kritiklik Seçici */}
      <section className="rounded-xl border border-slate-800 bg-slate-950/70 p-3 space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold text-slate-200 flex items-center gap-1.5">
            <Droplets size={13} className="text-cyan-400" />
            <span>Taşkın Su Seviyesi</span>
          </span>
          <span
            className={`font-mono text-sm font-bold ${
              waterLevelCm >= 90
                ? "text-rose-400"
                : waterLevelCm >= 50
                  ? "text-amber-400"
                  : "text-cyan-300"
            }`}
          >
            {waterLevelCm} cm
          </span>
        </div>

        {/* 3 Kademeli Su Seviyesi Butonları */}
        <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="Su Seviyesi">
          {[
            { value: 10, label: "10 cm", tag: "Taban" },
            { value: 50, label: "50 cm", tag: "Kaide Eşiği" },
            { value: 90, label: "90 cm", tag: "Pik Taşkın" },
          ].map((lvl) => {
            const isSelected = waterLevelCm === lvl.value;
            const activeColor =
              lvl.value >= 90
                ? "border-rose-500 bg-rose-950 text-rose-200 shadow-[0_0_10px_rgba(244,63,94,0.2)]"
                : lvl.value >= 50
                  ? "border-amber-500 bg-amber-950 text-amber-200"
                  : "border-cyan-500 bg-cyan-950 text-cyan-200";

            return (
              <button
                key={lvl.value}
                type="button"
                onClick={() => handleWaterLevelChange(lvl.value)}
                className={`py-2 px-1 rounded-lg border text-center transition ${
                  isSelected
                    ? activeColor
                    : "border-slate-800 bg-slate-900/60 text-slate-400 hover:border-slate-700"
                }`}
              >
                <div className="font-mono text-xs font-bold">{lvl.label}</div>
                <div className="text-[9px] opacity-80 mt-0.5">{lvl.tag}</div>
              </button>
            );
          })}
        </div>
      </section>

      {/* ⚡ Siemens SCADA: Manevra Sonuç Özeti (Yalnızca İzolasyon Devreye Girdiğinde) */}
      {isolationActive && (
        <section className="space-y-1.5">
          <div className="grid grid-cols-3 gap-1.5 p-2 rounded-lg border border-emerald-800/60 bg-emerald-950/40 text-center">
            <div className="p-1">
              <span className="font-mono text-xs font-bold text-emerald-300 block">
                {isolationTargets.length}
              </span>
              <span className="text-[9px] text-emerald-200/80 block">Trafo İzole</span>
            </div>
            <div className="p-1 border-x border-emerald-800/60">
              <span className="font-mono text-xs font-bold text-cyan-300 block">
                ~${(protectedAssetUsd / 1_000_000).toFixed(1)}M
              </span>
              <span className="text-[9px] text-emerald-200/80 block">Korunan Varlık</span>
            </div>
            <div className="p-1">
              <span className="font-mono text-xs font-bold text-amber-300 block">Ring</span>
              <span className="text-[9px] text-emerald-200/80 block">Metro Pompaları</span>
            </div>
          </div>
        </section>
      )}

      {/* 📅 5 Günlük Olay Zaman Çizelgesi (Hidrolojik Fazlar) */}
      <section className="rounded-xl border border-slate-800 bg-slate-950/70 p-3 space-y-2">
        <div className="flex items-center justify-between text-[11px]">
          <span className="font-bold text-slate-300">Olay Zaman Çizelgesi</span>
          <span className="text-[9px] font-mono text-cyan-400">5 Hidrolojik Faz</span>
        </div>

        <div className="grid grid-cols-5 gap-1">
          {scenario?.days?.map((day) => {
            const active = day.phase === selectedPhase;
            return (
              <button
                key={day.phase}
                onClick={() => selectPhase(day.phase)}
                disabled={weatherFloodActive}
                className={`p-1 rounded-md text-center border transition ${
                  active
                    ? "bg-cyan-950 border-cyan-500 text-cyan-100 shadow-[0_0_8px_rgba(6,182,212,0.3)]"
                    : "bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700"
                }`}
              >
                <div className="text-[9px] font-bold truncate">
                  {PHASE_SHORT?.[day.phase] || day.phase}
                </div>
                <div className="text-[8px] text-slate-500 font-mono">
                  {formatDay?.(day.date)}
                </div>
                <div className="text-[10px] font-mono font-bold text-slate-200 mt-0.5">
                  {day.PRECTOTCORR.toFixed(0)}
                </div>
              </button>
            );
          })}
        </div>

        {/* Faz Uyarı Şeridi */}
        {selectedPhase === "antecedent" && (
          <div className="p-2 rounded bg-amber-950/60 border border-amber-800 text-[10px] text-amber-200">
            ⚠️ <b>Zemin Doygunluğu:</b> Yağış doğrudan yüzey akışına geçecek.
          </div>
        )}
        {selectedPhase === "recession" && (
          <div className="p-2 rounded bg-amber-950/60 border border-amber-800 text-[10px] text-amber-200">
            ⚠️ <b>Çekilme:</b> Meger yalıtım testi tamamlanmadan enerji vermeyin.
          </div>
        )}
      </section>

      {/* 🌧️ Meteorolojik Stres Seviyesi (Sadeleştirilmiş Slider & Nem) */}
      <section className="rounded-xl border border-slate-800 bg-slate-950/70 p-3 space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-300 font-medium flex items-center gap-1">
            <CloudRain size={13} className="text-cyan-400" />
            <span>Stres Girdisi</span>
          </span>
          <span className="font-mono font-bold text-xs" style={{ color: band?.color || "#ef4444" }}>
            {rainfallMm.toFixed(1)} mm/gün
          </span>
        </div>

        <input
          type="range"
          min="0"
          max={SLIDER_MAX_MM}
          step="0.5"
          value={rainfallMm}
          onChange={(e) => setManualRainfall(Number(e.target.value))}
          disabled={weatherFloodActive}
          className="w-full accent-cyan-400 cursor-pointer h-1.5"
        />

        <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-800/80">
          <span className="font-semibold" style={{ color: band?.color }}>
            {band?.label}
          </span>
          <span className="font-mono text-slate-300">
            Bağıl Nem: %{humidity?.toFixed(1) || "85"}
          </span>
        </div>
      </section>

      {/* 🛡️ Saha Ekipleri & Güvenli Toplanma Noktası (Öne Çıkarılmış) */}
      <section className="rounded-xl border border-emerald-900/50 bg-emerald-950/30 p-3 space-y-1.5">
        <div className="flex items-center gap-1.5 text-emerald-300 text-xs font-bold">
          <MapPin size={13} className="text-emerald-400" />
          <span>Güvenli Sırt Kotu Toplanma Alanı</span>
        </div>
        <div className="p-2 rounded-lg bg-slate-900/80 border border-emerald-800/60 font-mono text-xs font-semibold text-emerald-300">
          📍 {currentBasin?.safeZone?.name || "İTÜ Maslak Sırtı"} ({currentBasin?.safeZone?.elevation || 85} m)
        </div>
        <p className="text-[10px] text-slate-400 leading-tight">
          Dere yatağı, alt geçit ve vadi çanaklarından derhal sırt kotuna tahliye sağlayın.
        </p>
      </section>

      {/* 📋 Operasyonel Günlük (Olay Akışı) Accordion */}
      <section className="space-y-1.5">
        <button
          type="button"
          onClick={() => setShowOpsLog((prev) => !prev)}
          className="w-full flex items-center justify-between p-2 rounded-lg border border-slate-800 bg-slate-900/60 text-xs font-semibold text-slate-300 hover:border-slate-700 transition"
        >
          <span>📋 Operasyonel Olay Günlüğü</span>
          {showOpsLog ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </button>

        {showOpsLog && (
          <div className="p-3 rounded-lg border border-slate-800 bg-slate-950/80 space-y-2 text-[10px]">
            {crisisEventLog?.length > 0 ? (
              <ol className="space-y-1.5 border-l border-cyan-800/70 pl-3">
                {crisisEventLog.map((entry, idx) => (
                  <li key={idx} className="relative text-slate-300 leading-relaxed">
                    <span className="absolute -left-[17px] top-1 h-2 w-2 rounded-full bg-cyan-400" />
                    <span className="font-mono font-bold text-cyan-300 mr-1.5">
                      T+{String(entry.minute).padStart(2, "0")} dk:
                    </span>
                    {entry.text}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-slate-500">Manevra başlatıldığında olay akışı buraya işlenir.</p>
            )}
          </div>
        )}
      </section>

      {/* Rapor Butonu */}
      <div className="pt-2 border-t border-slate-800/80">
        <button
          type="button"
          onClick={onOpenReport}
          className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-cyan-800/80 bg-cyan-950/50 hover:bg-cyan-900/60 px-3 py-2 text-xs font-semibold text-cyan-200 transition"
        >
          <FileText size={13} />
          <span>📄 Resmi AFAD &amp; BEDAŞ İklim Raporu</span>
        </button>
      </div>
    </div>
  );
}
