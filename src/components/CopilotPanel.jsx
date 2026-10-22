import React from "react";
import {
  Bot,
  Send,
  Sparkles,
  Zap,
  ShieldCheck,
} from "lucide-react";

export default function CopilotPanel({
  rainfallMm,
  rainBand,
  closestEvent,
  historicalMatches = [],
  isComposite,
  chatScrollRef,
  chatMessages = [],
  isBotTyping,
  chatHints = [],
  chatInput,
  setChatInput,
  sendChatMessage,
  weatherFloodActive,
  currentBasin,
  isolationActive,
  onToggleIsolation,
}) {
  return (
    <aside className="w-80 lg:w-96 bg-slate-900 border-l border-slate-800 p-4 flex flex-col h-full overflow-hidden shrink-0">
      {/* 1. Üst Başlık */}
      <div className="border-b border-slate-800 pb-2.5 flex items-center justify-between shrink-0 mb-2">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-cyan-950 text-cyan-300 border border-cyan-800 text-xs font-bold">
            <Bot size={14} />
          </span>
          <div>
            <h2 className="text-xs font-bold text-white tracking-tight">
              AI Grid Copilot
            </h2>
            <span className="text-[10px] text-slate-400 block font-medium">
              SCADA &amp; İklim Uyum Danışmanı
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {weatherFloodActive && (
            <span className="flex items-center gap-1 text-[9px] font-mono font-bold text-rose-300 bg-rose-950/80 border border-rose-800/80 px-2 py-0.5 rounded-full animate-pulse">
              <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
              85 mm Afet
            </span>
          )}
          <span className="text-[10px] font-mono text-cyan-400 bg-cyan-950/70 border border-cyan-800/60 px-2 py-0.5 rounded-full">
            {rainfallMm > 0 ? `${rainfallMm.toFixed(1)} mm/gün` : "0.0 mm (Normal)"}
          </span>
        </div>
      </div>

      {/* 2. Chat Terminal Bölümü (Kalan tüm dikey alanı kaplar) */}
      <div className="flex-1 flex flex-col min-h-0 space-y-2 overflow-hidden">
        
        {/* Terminal Durum Şeridi */}
        <div className="flex items-center justify-between shrink-0">
          <span className="text-[11px] font-bold text-cyan-300 flex items-center gap-1.5">
            <Sparkles size={12} className="text-cyan-400" />
            <span>İklim &amp; SCADA Karar Terminali</span>
          </span>
          <span className="text-[9px] font-mono text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded-full border border-emerald-900">
            ● Aktif Karar Motoru
          </span>
        </div>

        {/* Mesaj Listesi (Kaydırılabilir alan) */}
        <div
          ref={chatScrollRef}
          className="flex-1 min-h-0 overflow-y-auto space-y-2.5 bg-slate-950/90 border border-slate-800 rounded-xl p-3 scroll-smooth"
        >
          {chatMessages.map((message, index) => (
            <div
              key={index}
              className={`chat-message-item flex ${
                message.role === "user" ? "justify-end" : "justify-start"
              }`}
            >
              <div
                className={`max-w-[92%] rounded-xl px-3 py-2 text-[11px] leading-relaxed whitespace-pre-line shadow-sm ${
                  message.role === "user"
                    ? "bg-cyan-700 text-white font-medium"
                    : "bg-slate-900 border border-slate-800 text-slate-100"
                }`}
              >
                {message.text}
              </div>
            </div>
          ))}
          {isBotTyping && (
            <div className="text-[10px] text-cyan-400 animate-pulse px-2 py-1 flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-ping" />
              <span>İklim ve SCADA simülasyonu hesaplanıyor...</span>
            </div>
          )}
        </div>

        {/* Hızlı Çipler & Senaryolar (Sabit & Tıklanabilir) */}
        <div className="space-y-1.5 shrink-0 pt-0.5">
          {/* 1. Sıra: What-If Kriz Senaryoları */}
          <div className="flex items-center justify-between text-[10px] px-1 text-slate-400">
            <span className="font-bold text-cyan-400 flex items-center gap-1">
              <span>🔮 What-If Kriz Senaryoları:</span>
            </span>
            <span className="text-[9px] text-slate-500">Tıkla &amp; Simüle Et</span>
          </div>

          <div className="grid grid-cols-2 gap-1 text-[10px]">
            <button
              type="button"
              onClick={() => sendChatMessage(null, "What-If: 135 mm 2009 Ayamama rekoru olursa ne olur?")}
              className="py-1 px-2 rounded-md border border-rose-800/80 bg-rose-950/50 text-rose-200 hover:bg-rose-900/60 font-semibold text-left truncate transition shadow-sm"
              title="2009 Ayamama Pik Afeti Simülasyonu"
            >
              🔮 135 mm (2009 Ayamama)
            </button>
            <button
              type="button"
              onClick={() => sendChatMessage(null, "What-If: 115 mm 2019 Eminönü çöküntüsü olursa ne olur?")}
              className="py-1 px-2 rounded-md border border-amber-800/80 bg-amber-950/50 text-amber-200 hover:bg-amber-900/60 font-semibold text-left truncate transition shadow-sm"
              title="2019 Eminönü Çöküntüsü Simülasyonu"
            >
              ⛈️ 115 mm (2019 Eminönü)
            </button>
            <button
              type="button"
              onClick={() => sendChatMessage(null, "What-If: 125 mm 2023 Başakşehir seli olursa ne olur?")}
              className="py-1 px-2 rounded-md border border-purple-800/80 bg-purple-950/50 text-purple-200 hover:bg-purple-900/60 font-semibold text-left truncate transition shadow-sm"
              title="2023 Başakşehir Fırtınası Simülasyonu"
            >
              🌊 125 mm (2023 Başakşehir)
            </button>
            <button
              type="button"
              onClick={() => sendChatMessage(null, "What-If: 85 mm Cendere pik taşkını olursa ne olur?")}
              className="py-1 px-2 rounded-md border border-cyan-800/80 bg-cyan-950/50 text-cyan-200 hover:bg-cyan-900/60 font-semibold text-left truncate transition shadow-sm"
              title="2026 Cendere Taşkını Simülasyonu"
            >
              ⚡ 85 mm (2026 Cendere)
            </button>
          </div>

          {/* 2. Sıra: Jüri & Karar Verici Soruları */}
          <div className="flex flex-wrap gap-1 pt-0.5">
            {[
              { label: "⚖️ Neden Eski Yöntemler Geçersiz?", q: "Neden eski yöntemler geçersiz?" },
              { label: "💡 Bu Aktarımın Faydası Ne?", q: "Bu aktarımın faydası ne?" },
              { label: "🏗️ Gelecek Şebeke Reçetesi", q: "Sel için proaktif reçete nedir?" },
              { label: "🚇 Metro Pompaları Protokolü", q: "Metro drenaj pompaları durumu nedir?" },
            ].map((chip) => (
              <button
                key={chip.label}
                type="button"
                onClick={() => sendChatMessage(null, chip.q)}
                className="text-[9px] px-2 py-0.5 rounded-full border border-slate-800 bg-slate-950/90 text-slate-300 hover:text-cyan-200 hover:border-cyan-700 hover:bg-cyan-950/50 transition active:scale-95 shadow-sm"
              >
                {chip.label}
              </button>
            ))}
          </div>
        </div>

        {/* Soru Girdisi (Aşağıda Kesinlikle Sabit ve Görünür) */}
        <form onSubmit={sendChatMessage} className="flex gap-1.5 shrink-0 pt-1">
          <input
            type="text"
            value={chatInput}
            disabled={isBotTyping}
            onChange={(e) => setChatInput(e.target.value)}
            placeholder={
              weatherFloodActive
                ? "Afet manevrası veya What-If hakkında sorun..."
                : "Şebeke riski, What-If veya jüri soruları..."
            }
            className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-[11px] text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition shadow-inner"
          />
          <button
            type="submit"
            disabled={!chatInput.trim() || isBotTyping}
            className="px-3.5 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold disabled:bg-slate-800 disabled:text-slate-600 transition shadow flex items-center justify-center shrink-0"
            title="Gönder"
          >
            <Send size={13} />
          </button>
        </form>
      </div>
    </aside>
  );
}
