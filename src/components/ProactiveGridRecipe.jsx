import React, { useState } from "react";
import { MultiSegmentDonut } from "./DonutChart";
import {
  Zap,
  ShieldAlert,
  Truck,
  Building2,
  ShieldCheck,
  Trees,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

export default function ProactiveGridRecipe() {
  const [activeStep, setActiveStep] = useState(null);
  const [activeSolution, setActiveSolution] = useState(null);

  const urbanDistributionSegments = [
    { label: "Kritik Vadi Tabanı", value: 10, color: "#ef4444" },
    { label: "Orta Kırılganlık", value: 25, color: "#f97316" },
    { label: "Güvenli Sırt Kotu", value: 65, color: "#10b981" },
  ];

  const steps = [
    {
      id: 1,
      title: "Yüksek Kot Ring Beslemesi",
      tag: "Metro & Pompalar",
      badgeColor: "text-cyan-400 bg-cyan-950/70 border-cyan-800",
      icon: Zap,
      detail:
        "Vadi çanağındaki metro drenaj ve tahliye pompaları sırtlardaki (İTÜ Maslak, Kuyumcukent, Başakşehir) merkezlere çift yönlü ring ile bağlanır.",
    },
    {
      id: 2,
      title: "Proaktif SCADA İzolasyonu",
      tag: "Ark Önleme",
      badgeColor: "text-rose-400 bg-rose-950/70 border-rose-800",
      icon: ShieldAlert,
      detail:
        "Su seviyesi kaide kotuna (50 cm) ulaşmadan vadi köşkleri uzaktan enerjisiz bırakılarak su altı ark ve trafo patlamaları engellenir.",
    },
    {
      id: 3,
      title: "Sırt Kotu Lojistiği (TEM / E-80)",
      tag: "Kriz Omurgası",
      badgeColor: "text-emerald-400 bg-emerald-950/70 border-emerald-800",
      icon: Truck,
      detail:
        "E-5 ve Basın Ekspres su altında kaldığında mobil sahra jeneratörleri yüksek kotlu Kuzey Çevre Yolu (TEM) üzerinden sevk edilir.",
    },
  ];

  const solutions = [
    {
      id: "platform",
      title: "+2.0 m Çelik Platform",
      tag: "Kritik",
      icon: Building2,
      color: "text-cyan-400",
      detail:
        "12 vadi trafosunun köşk tabanı taşkın seviyesinin en az +2.0m üzerine çıkarılarak suyla doğrudan teması kesilir.",
    },
    {
      id: "gis",
      title: "IP68 Su Geçirmez GIS",
      tag: "Dönüşüm",
      icon: ShieldCheck,
      color: "text-emerald-400",
      detail:
        "Açık hücreler su geçirmez Gaz İzoleli Şalt (GIS) kabinlerine dönüştürülerek su altı kısa devre riski sıfırlanır.",
    },
    {
      id: "nbs",
      title: "Doğa Temelli (NBS)",
      tag: "2026–2030",
      icon: Trees,
      color: "text-teal-400",
      detail:
        "Yüzey akış katsayısını kırmak için vadi yamaçlarında yağmur hendekleri ve %30 geçirimli zemin kaplamaları uygulanır.",
    },
  ];

  return (
    <div className="space-y-3.5">
      {/* Kompakt Başlık */}
      <div className="border-b border-slate-800 pb-2.5 flex items-center justify-between">
        <div>
          <h2 className="text-xs font-bold text-slate-100 flex items-center gap-1.5">
            <span className="text-amber-400">⚡</span> Proaktif Şebeke Yönetim Reçetesi
          </h2>
          <span className="text-[10px] text-slate-500 block mt-0.5">
            İTÜ-AKOM Sentezi · 17 Yıllık Afet Hafızası
          </span>
        </div>
        <span className="rounded bg-slate-800 px-2 py-0.5 text-[9px] font-mono text-cyan-300 border border-slate-700">
          İstanbul Geneli
        </span>
      </div>

      {/* 📍 Kentsel Risk Dağılımı */}
      <section className="rounded-xl border border-slate-800 bg-slate-950/70 p-3 space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold text-slate-200">
            Kentsel Taşkın Tehlikesi Dağılımı
          </span>
          <span className="text-[9px] font-mono text-red-400 bg-red-950/60 px-1.5 py-0.5 rounded border border-red-900/60">
            VIKOR &gt; 0.72
          </span>
        </div>

        {/* Tek Donut Grafik */}
        <div className="flex items-center justify-center">
          <MultiSegmentDonut
            segments={urbanDistributionSegments}
            size={105}
            strokeWidth={12}
            centerTitle="%10"
            centerSubtitle="Kritik Alan"
          />
        </div>

        {/* 3 Sade KPI Rozeti */}
        <div className="grid grid-cols-3 gap-1.5 pt-1 border-t border-slate-800/80 text-center">
          <div className="p-1.5 rounded-lg bg-slate-900/90 border border-slate-800">
            <span className="font-mono text-sm font-bold text-rose-400 block">%91</span>
            <span className="text-[9px] text-slate-400 block leading-tight">Kümülatif Risk</span>
          </div>
          <div className="p-1.5 rounded-lg bg-slate-900/90 border border-slate-800">
            <span className="font-mono text-sm font-bold text-amber-300 block">12</span>
            <span className="text-[9px] text-slate-400 block leading-tight">Vadi Trafosu</span>
          </div>
          <div className="p-1.5 rounded-lg bg-slate-900/90 border border-slate-800">
            <span className="font-mono text-sm font-bold text-emerald-400 block">&lt;15m</span>
            <span className="text-[9px] text-slate-400 block leading-tight">Kritik Kot</span>
          </div>
        </div>
      </section>

      {/* ⚡ Proaktif Şebeke Senaryosu (Başlıklar kesilmeden net okunur) */}
      <section className="rounded-xl border border-slate-800 bg-slate-950/70 p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold text-amber-300 flex items-center gap-1">
            <span>⚡</span> Proaktif Afet Protokolü
          </span>
          <span className="text-[9px] text-slate-500">Tıkla &amp; Detayı Gör</span>
        </div>

        <div className="space-y-1.5">
          {steps.map((step) => {
            const isExpanded = activeStep === step.id;
            return (
              <div
                key={step.id}
                onClick={() => setActiveStep(isExpanded ? null : step.id)}
                className={`p-2 rounded-lg border cursor-pointer transition select-none ${
                  isExpanded
                    ? "bg-slate-900 border-cyan-700/80 shadow"
                    : "bg-slate-900/50 border-slate-800/80 hover:border-slate-700"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-slate-800 text-[10px] font-bold text-white font-mono">
                      {step.id}
                    </span>
                    <span className="text-xs font-semibold text-slate-200 leading-tight">
                      {step.title}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className={`text-[9px] px-1.5 py-0.5 rounded border font-mono ${step.badgeColor}`}>
                      {step.tag}
                    </span>
                    {isExpanded ? (
                      <ChevronUp size={12} className="text-slate-400" />
                    ) : (
                      <ChevronDown size={12} className="text-slate-500" />
                    )}
                  </div>
                </div>

                {isExpanded && (
                  <p className="text-[11px] text-slate-300 leading-relaxed mt-2 pt-2 border-t border-slate-800">
                    {step.detail}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* 🛠️ Yapısal Dayanıklılık Çözümleri */}
      <section className="rounded-xl border border-slate-800 bg-slate-950/70 p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold text-emerald-300 flex items-center gap-1">
            <span>🛠️</span> Yapısal Modernizasyon
          </span>
          <span className="text-[9px] text-slate-500">Mühendislik Reçetesi</span>
        </div>

        <div className="grid grid-cols-1 gap-1.5">
          {solutions.map((sol) => {
            const isExpanded = activeSolution === sol.id;
            const Icon = sol.icon;
            return (
              <div
                key={sol.id}
                onClick={() => setActiveSolution(isExpanded ? null : sol.id)}
                className={`p-2 rounded-lg border cursor-pointer transition select-none ${
                  isExpanded
                    ? "bg-slate-900 border-emerald-700/80 shadow"
                    : "bg-slate-900/50 border-slate-800/80 hover:border-slate-700"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Icon size={14} className={sol.color} />
                    <span className="text-xs font-semibold text-slate-200 leading-tight">
                      {sol.title}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300 font-mono">
                      {sol.tag}
                    </span>
                    {isExpanded ? (
                      <ChevronUp size={12} className="text-slate-400" />
                    ) : (
                      <ChevronDown size={12} className="text-slate-500" />
                    )}
                  </div>
                </div>

                {isExpanded && (
                  <p className="text-[11px] text-slate-300 leading-relaxed mt-2 pt-2 border-t border-slate-800">
                    {sol.detail}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
