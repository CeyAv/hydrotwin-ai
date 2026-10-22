import React from "react";
import {
  ShieldCheck,
  CloudRain,
  Thermometer,
  Zap,
  Radio,
  ArrowRight,
  FileText,
  AlertTriangle,
} from "lucide-react";

export default function OpeningMonitorPanel({
  currentBasin,
  rainfallMm,
  weatherFloodActive,
  onTriggerFlood,
  onOpenReport,
  onSwitchToAiTab,
}) {
  return (
    <div className="space-y-4">
      {/* 📡 Başlık & Canlı Durum */}
      <div className="border-b border-slate-800 pb-3 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-1.5">
            <Radio size={14} className="text-emerald-400 animate-pulse" />
            <h2 className="text-xs font-bold text-white uppercase tracking-wider">
              Canlı Şebeke İzleme
            </h2>
          </div>
          <span className="text-[10px] text-slate-400 block mt-0.5">
            {currentBasin?.name || "İstanbul Geneli"}
          </span>
        </div>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-800/80 text-[10px] font-semibold text-emerald-300 font-mono">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
          Şebeke Güvenli
        </span>
      </div>

      {/* 🌦️ Canlı Telemetri Kartı */}
      <section className="rounded-xl border border-slate-800 bg-slate-950/70 p-3.5 space-y-3">
        <span className="text-[10px] font-mono uppercase text-slate-400 font-bold block">
          Sensör &amp; Meteoroloji Durumu
        </span>

        <div className="grid grid-cols-2 gap-2">
          <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800/90 space-y-1">
            <div className="flex items-center gap-1.5 text-cyan-400 text-xs">
              <CloudRain size={13} />
              <span className="text-[10px] text-slate-400">Canlı Yağış</span>
            </div>
            <div className="font-mono text-base font-bold text-slate-100">
              {rainfallMm.toFixed(1)} <span className="text-xs font-normal text-slate-400">mm/h</span>
            </div>
            <span className="text-[9px] text-emerald-400 font-medium block">
              Risk Yok · Taban Düzeyi
            </span>
          </div>

          <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800/90 space-y-1">
            <div className="flex items-center gap-1.5 text-amber-400 text-xs">
              <Zap size={13} />
              <span className="text-[10px] text-slate-400">Vadi Trafoları</span>
            </div>
            <div className="font-mono text-base font-bold text-slate-100">
              {currentBasin?.transformers?.length || 12} <span className="text-xs font-normal text-slate-400">Ünite</span>
            </div>
            <span className="text-[9px] text-emerald-400 font-medium block">
              100% Aktif &amp; Enerjili
            </span>
          </div>
        </div>
      </section>

      {/* ⚡ Afet Simülatörü Başlatma Eylemi (Focal CTA) */}
      <section className="rounded-xl border border-rose-900/50 bg-gradient-to-b from-rose-950/30 to-slate-950/80 p-3.5 space-y-3 shadow-lg">
        <div>
          <div className="flex items-center gap-1.5 text-rose-300 text-xs font-bold">
            <AlertTriangle size={14} />
            <span>Pik Afet Simülasyonu</span>
          </div>
          <p className="text-[11px] text-slate-300 mt-1 leading-snug">
            85 mm pik yağışta vadi tabanındaki su yükselmesini, kritik trafo risklerini ve SCADA proaktif manevrasını test edin.
          </p>
        </div>

        <button
          type="button"
          onClick={() => onTriggerFlood(true, 85)}
          className="w-full flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 px-4 py-3 text-xs font-bold text-white shadow-lg transition active:scale-[0.99]"
        >
          <Zap size={14} className="fill-white" />
          <span>Afet Simülasyonunu Tetikle (85 mm)</span>
          <ArrowRight size={13} />
        </button>
      </section>

      {/* 💡 AI Copilot Yönlendirmesi */}
      <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-3 space-y-2">
        <p className="text-[11px] text-slate-400 leading-relaxed">
          17 yıllık taşkın hafızası, şebeke direnç analizi ve kentsel risk dağılımı için:
        </p>
        <button
          type="button"
          onClick={onSwitchToAiTab}
          className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700/80 border border-slate-700 text-xs font-semibold text-cyan-300 transition"
        >
          <span>🤖 AI Grid Copilot'a Geç</span>
          <ArrowRight size={12} />
        </button>
      </section>

      {/* Rapor Butonu */}
      <div className="pt-2 border-t border-slate-800/80">
        <button
          type="button"
          onClick={onOpenReport}
          className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-cyan-800/70 bg-cyan-950/50 hover:bg-cyan-900/60 px-3 py-2 text-xs font-semibold text-cyan-200 transition"
        >
          <FileText size={13} />
          <span>📄 Resmi AFAD &amp; BEDAŞ İklim Raporu</span>
        </button>
        <p className="text-[10px] text-slate-500 text-center mt-2">
          SurgeTwin AI • Climathon 2026 İstanbul
        </p>
      </div>
    </div>
  );
}
