import React, { useState } from "react";
import { CircularGauge } from "./DonutChart";
import {
  ShieldCheck,
  DollarSign,
  Activity,
  Compass,
  Building2,
  Trees,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

export default function ResilienceAnalysisPanel({
  isComposite,
  currentBasin,
  TOTAL_CRITICAL_UNITS,
  riskCount,
  isolationActive,
  resilienceScore,
  preventedDamage,
  COMPOSITE_METRICS,
  visibleBasins,
  backupTransformer,
  criticalIds,
  route,
  calculateSafeRoute,
  routeReady,
  routeState,
  formatDuration,
  weatherFloodActive,
}) {
  const [selectedBasinRisk, setSelectedBasinRisk] = useState(null);
  const [activeSolution, setActiveSolution] = useState(null);

  // Havza bazlı kırılganlık ve kriz parametreleri (AI Karar Modeli)
  const basinVulnerabilityMatrix = [
    { key: "esenyurt", name: "Haramidere (Esenyurt)", score: 94, note: "Rakım 5m · Kronik çöküntü çanağı" },
    { key: "ayazaga", name: "Cendere (Sarıyer)", score: 92, note: "Rakım 8m · Maslak yüzey akışı toplanması" },
    { key: "ayamama", name: "Ayamama (Basın Ekspres)", score: 88, note: "Rakım 12m · %85+ geçirimsiz sanayi tabanı" },
    { key: "fatih", name: "Vatan Cad. (Aksaray)", score: 82, note: "Rakım 6m · Alt geçit drenaj baskısı" },
    { key: "basaksehir", name: "İkitelli OSB (Başakşehir)", score: 78, note: "Rakım 29m · MASKO dere yatağı ağır yükü" },
  ];

  const structuralSolutions = [
    {
      id: "platform",
      title: "+2.0 m Çelik Platform",
      tag: "Kritik",
      icon: Building2,
      color: "text-cyan-400",
      detail: "12 vadi trafosunun köşk tabanı taşkın kret seviyesinin en az +2.0m üzerine çıkarılarak suyla doğrudan teması kesilir.",
    },
    {
      id: "gis",
      title: "IP68 Su Geçirmez GIS",
      tag: "Dönüşüm",
      icon: ShieldCheck,
      color: "text-emerald-400",
      detail: "Açık tip hücreler su altında çalışabilen SF6 Gaz İzoleli Şalt kabinlerine dönüştürülerek kısa devre riski sıfırlanır.",
    },
    {
      id: "nbs",
      title: "Doğa Temelli Çözümler (NBS)",
      tag: "2026–2030",
      icon: Trees,
      color: "text-teal-400",
      detail: "Yüzey akış katsayısını kırmak için vadi yamaçlarında yağmur hendekleri ve %30 geçirimli zemin kaplamaları uygulanır.",
    },
  ];

  return (
    <aside className="w-80 lg:w-96 bg-slate-900 border-r border-slate-800 p-4 overflow-y-auto space-y-3.5 shrink-0">
      {/* 🛡️ Şebeke Dayanıklılık İndeksi */}
      <section className="rounded-xl border border-slate-800 bg-slate-950/70 p-3 space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold text-emerald-300 flex items-center gap-1">
            <ShieldCheck size={13} className="text-emerald-400" />
            <span>Şebeke Direnç Skoru</span>
          </span>
          <span className="text-[9px] text-slate-400 font-mono">
            Reaktif: <span className="text-rose-400">%35</span>
          </span>
        </div>

        <div className="flex items-center justify-around gap-3 bg-slate-900/60 rounded-lg p-2.5 border border-slate-800/80">
          <CircularGauge
            value={resilienceScore || 91}
            size={72}
            strokeWidth={7}
            colorStart="#10b981"
            colorEnd="#06b6d4"
            gradientId="resilience-mini-hero"
            sublabel="Direnç"
          />

          <div className="space-y-1 text-xs min-w-0">
            <div className="text-emerald-400 font-bold flex items-center gap-1 text-[11px]">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>%{resilienceScore || 91} Korunan Altyapı</span>
            </div>
            <div className="text-[10px] text-cyan-300 font-mono">
              +%{(resilienceScore || 91) - 35} Dayanıklılık Kazancı
            </div>
            <div className="text-[9px] text-slate-400">
              {currentBasin?.name ?? "İstanbul Geneli"} Proaktif Ring
            </div>
          </div>
        </div>
      </section>

      {/* ⚡ Önlenen Hasar & Finansal ROI Analizi */}
      <section className="rounded-xl border border-slate-800 bg-slate-950/70 p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold text-cyan-300 flex items-center gap-1">
            <DollarSign size={13} className="text-cyan-400" />
            <span>Mali Fayda / Önlenen Risk</span>
          </span>
          <span className="rounded bg-cyan-950 border border-cyan-800 px-1.5 py-0.5 text-[9px] font-bold text-cyan-300 font-mono">
            4.5x ROI
          </span>
        </div>

        <div className="flex items-baseline justify-between px-1">
          <div>
            <span className="text-2xl font-mono font-bold text-cyan-300">
              ~{COMPOSITE_METRICS?.preventedDamage || "8.2"}M $
            </span>
            <span className="text-[9px] text-slate-400 block">Kümülatif Önlenen Hasar</span>
          </div>
          <div className="text-right">
            <span className="text-xs font-mono font-bold text-slate-300">
              ~1.8M $
            </span>
            <span className="text-[9px] text-slate-500 block">Modernizasyon Bütçesi</span>
          </div>
        </div>

        {/* Karşılaştırma Çubuğu */}
        <div className="h-2 rounded-full bg-slate-800 overflow-hidden flex">
          <div className="bg-slate-600 h-full w-[22%]" title="1.8M $ Yatırım" />
          <div className="bg-gradient-to-r from-cyan-500 to-emerald-400 h-full w-[78%]" title="8.2M $ Önlenen Hasar" />
        </div>
        <p className="text-[10px] text-slate-400 text-right">
          Yatırım ilk büyük afet pikinde kendini 4.5 kat amorti eder.
        </p>
      </section>

      {/* 📊 Havza Bazlı Kırılganlık Matrisi (Her Zaman Görünür) */}
      <section className="rounded-xl border border-slate-800 bg-slate-950/70 p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold text-slate-200 flex items-center gap-1">
            <Activity size={13} className="text-rose-400" />
            <span>Havza Kırılganlık İndeksi</span>
          </span>
          <span className="text-[9px] text-slate-500">5 Pilot Havza</span>
        </div>

        <div className="space-y-1 text-xs">
          {basinVulnerabilityMatrix.map((item) => {
            const isSelected = selectedBasinRisk === item.key;
            return (
              <div
                key={item.key}
                onClick={() =>
                  setSelectedBasinRisk(isSelected ? null : item.key)
                }
                className={`p-2 rounded-lg border cursor-pointer transition select-none ${
                  isSelected
                    ? "bg-slate-900 border-cyan-800"
                    : "bg-slate-900/40 border-slate-800/80 hover:border-slate-700"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-200 text-xs font-medium">
                    {item.name}
                  </span>
                  <span className="font-mono text-xs font-bold text-slate-100">
                    %{item.score}
                  </span>
                </div>

                <div className="h-1 bg-slate-800 rounded-full mt-1.5 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${item.score >= 90 ? "bg-rose-500" : item.score >= 80 ? "bg-amber-500" : "bg-cyan-500"}`}
                    style={{ width: `${item.score}%` }}
                  />
                </div>

                {isSelected && (
                  <p className="text-[10px] text-slate-400 mt-1.5 pt-1 border-t border-slate-800 leading-tight">
                    {item.note}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* 🧭 Saha Erişim Ekseni (Yalnızca Afet Simülasyonu Tetiklendiğinde Görünür) */}
      {weatherFloodActive && route && (
        <section className="rounded-xl border border-slate-800 bg-slate-950/70 p-3 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-200 flex items-center gap-1">
              <Compass size={13} className="text-cyan-400" />
              <span>Saha Erişim Ekseni</span>
            </span>
            <span className="text-[10px] text-slate-400">
              {route.origin.elevation}m → {route.destination.elevation}m
            </span>
          </div>

          <button
            type="button"
            onClick={calculateSafeRoute}
            className={`w-full text-xs font-semibold py-2 px-3 rounded-lg transition ${
              routeReady
                ? "bg-emerald-700 text-white"
                : "bg-cyan-700 hover:bg-cyan-600 text-white shadow"
            }`}
          >
            {routeReady ? "Haritada Gösteriliyor (Gizle)" : "Yaklaşık Rotayı Çiz"}
          </button>
        </section>
      )}

      {/* 🛠️ Yapısal Dayanıklılık Reçetesi */}
      <section className="rounded-xl border border-slate-800 bg-slate-950/70 p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold text-emerald-300">
            🛠️ Yapısal Güçlendirme Reçetesi
          </span>
          <span className="text-[9px] text-slate-500">Mühendislik Çözümleri</span>
        </div>

        <div className="space-y-1.5">
          {structuralSolutions.map((sol) => {
            const isExpanded = activeSolution === sol.id;
            const Icon = sol.icon;
            return (
              <div
                key={sol.id}
                onClick={() => setActiveSolution(isExpanded ? null : sol.id)}
                className={`p-2 rounded-lg border cursor-pointer transition select-none ${
                  isExpanded
                    ? "bg-slate-900 border-emerald-700/80 shadow"
                    : "bg-slate-900/40 border-slate-800/80 hover:border-slate-700"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <Icon size={13} className={sol.color} />
                    <span className="text-xs font-semibold text-slate-200">
                      {sol.title}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300 font-mono">
                      {sol.tag}
                    </span>
                    {isExpanded ? (
                      <ChevronUp size={11} className="text-slate-400" />
                    ) : (
                      <ChevronDown size={11} className="text-slate-500" />
                    )}
                  </div>
                </div>

                {isExpanded && (
                  <p className="text-[10px] text-slate-300 leading-relaxed mt-1.5 pt-1.5 border-t border-slate-800">
                    {sol.detail}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </aside>
  );
}
