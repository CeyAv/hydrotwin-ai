import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CloudRain, Zap, ShieldCheck } from "lucide-react";

const BASIN_WEATHER = {
  ayazaga: {
    label: "Sarıyer Cendere",
    statusLabel: "Maslak / Cendere",
    latitude: 41.108,
    longitude: 28.995,
  },
  ayamama: {
    label: "Küçükçekmece Ayamama",
    statusLabel: "Küçükçekmece / Ayamama",
    latitude: 41.003,
    longitude: 28.815,
  },
  esenyurt: {
    label: "Esenyurt Haramidere",
    statusLabel: "Esenyurt / Haramidere",
    latitude: 41.012,
    longitude: 28.685,
  },
  fatih: {
    label: "Fatih Aksaray",
    statusLabel: "Fatih / Aksaray",
    latitude: 41.015,
    longitude: 28.94,
  },
};

// Meteorolojik afet / ani sel eşiği (Dünya Meteoroloji Örgütü ve AKOM standardı: > 25 mm/saat)
const FLOOD_THRESHOLD_MM = 25;

export default function LiveWeatherAlert({
  selectedBasinKey,
  onSelectBasin,
  onTriggerFlood,
  isFloodActive,
  onWeatherUpdate,
}) {
  const [weather, setWeather] = useState(null);
  const [simulatedBasinKey, setSimulatedBasinKey] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const requestIdRef = useRef(0);
  const callbacksRef = useRef({ onTriggerFlood, onSelectBasin, onWeatherUpdate });

  useEffect(() => {
    callbacksRef.current = { onTriggerFlood, onSelectBasin, onWeatherUpdate };
  }, [onTriggerFlood, onSelectBasin, onWeatherUpdate]);

  useEffect(() => {
    const basin = BASIN_WEATHER[selectedBasinKey] ?? BASIN_WEATHER.ayazaga;
    const controller = new AbortController();
    const requestId = ++requestIdRef.current;
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${basin.latitude}&longitude=${basin.longitude}&current=precipitation,temperature_2m&timezone=Europe%2FIstanbul`;

    const loadWeather = async () => {
      setRefreshing(true);
      setError("");
      try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error(`Meteoroloji servisi HTTP ${response.status}`);
        const data = await response.json();
        const precipitation = Number(data.current?.precipitation);
        const temperature = Number(data.current?.temperature_2m);
        if (!Number.isFinite(precipitation) || !Number.isFinite(temperature)) {
          throw new Error("Seçili havza için canlı meteoroloji verisi okunamadı.");
        }
        if (controller.signal.aborted || requestId !== requestIdRef.current) return;

        setWeather({ basinKey: selectedBasinKey, refreshKey, precipitation, temperature });
        setSimulatedBasinKey(null);
        callbacksRef.current.onTriggerFlood?.(precipitation > FLOOD_THRESHOLD_MM, precipitation);
      } catch (fetchError) {
        if (fetchError.name !== "AbortError" && requestId === requestIdRef.current) {
          setError(fetchError.message || "Canlı meteoroloji verisi alınamadı.");
        }
      } finally {
        if (!controller.signal.aborted && requestId === requestIdRef.current) {
          setRefreshing(false);
        }
      }
    };

    loadWeather();
    const pollTimer = window.setInterval(
      () => setRefreshKey((current) => current + 1),
      5 * 60 * 1000
    );

    return () => {
      controller.abort();
      window.clearInterval(pollTimer);
    };
  }, [selectedBasinKey, refreshKey]);

  const basin = BASIN_WEATHER[selectedBasinKey] ?? BASIN_WEATHER.ayazaga;
  const currentWeather =
    weather?.basinKey === selectedBasinKey && weather?.refreshKey === refreshKey
      ? weather
      : null;
  const simulationActive = simulatedBasinKey === selectedBasinKey && isFloodActive;
  const precipitation = simulationActive
    ? 85
    : currentWeather?.precipitation ?? null;
  const critical = precipitation !== null && precipitation > FLOOD_THRESHOLD_MM;
  const warning = precipitation !== null && precipitation >= 10 && precipitation <= FLOOD_THRESHOLD_MM;

  // Hava durumu güncellendiğinde üst bileşene ilet
  useEffect(() => {
    callbacksRef.current.onWeatherUpdate?.({
      precipitation: precipitation ?? 0,
      temperature: currentWeather?.temperature ?? 19,
      critical,
      warning,
      refreshing,
      error,
      basinKey: selectedBasinKey,
      basinName: basin.label,
      statusLabel: basin.statusLabel,
      onRefresh: () => setRefreshKey((k) => k + 1),
    });
  }, [precipitation, currentWeather, critical, warning, refreshing, error, selectedBasinKey, basin]);

  const toggleFloodMode = () => {
    if (isFloodActive) {
      requestIdRef.current += 1;
      setRefreshing(false);
      setSimulatedBasinKey(null);
      callbacksRef.current.onTriggerFlood?.(false, 0);
      return;
    }

    requestIdRef.current += 1;
    setRefreshing(false);
    setSimulatedBasinKey(selectedBasinKey);
    callbacksRef.current.onTriggerFlood?.(true, 85);
  };

  return (
    <header
      aria-label="SurgeTwin kriz kontrolü"
      className={`relative z-20 flex flex-wrap items-center justify-between gap-3 border-b px-4 py-2.5 transition-colors duration-300 ${
        isFloodActive || critical
          ? "border-rose-700/80 bg-rose-950 text-rose-50"
          : "border-slate-800 bg-slate-900 text-slate-100"
      }`}
    >
      <div className="flex min-w-0 flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-4">
        <div className="flex shrink-0 items-center gap-2.5">
          <span className="relative flex h-8 w-8 items-center justify-center rounded-md bg-cyan-950 text-cyan-300">
            <CloudRain size={18} aria-hidden="true" />
            {(isFloodActive || critical) && (
              <span className="absolute -right-1 -top-1 h-2.5 w-2.5 animate-ping rounded-full bg-rose-400" />
            )}
          </span>
          <h1 className="whitespace-nowrap text-base font-bold text-cyan-300">
            SurgeTwin <span className="font-normal text-white">AI</span>
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2 pl-0 sm:pl-3 border-slate-800 sm:border-l">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1 shrink-0">
            <span className="text-cyan-400">📍</span>
            <span>Geçmiş Sel Havzaları:</span>
          </span>

          <nav className="flex flex-wrap items-center gap-1" aria-label="Geçmiş Sel Havzaları">
            {Object.entries(BASIN_WEATHER).map(([basinKey, basinOption]) => {
              const selected = selectedBasinKey === basinKey;
              return (
                <button
                  key={basinKey}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => callbacksRef.current.onSelectBasin?.(basinKey)}
                  className={`shrink-0 rounded-md border px-2.5 py-1 text-[11px] font-semibold transition sm:text-xs cursor-pointer ${
                    selected
                      ? "border-cyan-400 bg-cyan-950 text-cyan-100 shadow-[0_0_12px_rgb(34_211_238/0.2)]"
                      : "border-slate-700 bg-slate-950/40 text-slate-300 hover:border-cyan-800 hover:text-cyan-100"
                  }`}
                >
                  {basinOption.label}
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Sağ Taraf: Simülasyon Başlatma veya Canlı Radara Dönme Butonu */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={toggleFloodMode}
          className={`inline-flex min-h-9 shrink-0 items-center justify-center gap-2 rounded-md px-3.5 py-1.5 text-xs font-bold transition sm:text-sm cursor-pointer ${
            isFloodActive
              ? "bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 shadow"
              : "bg-rose-600 text-white hover:bg-rose-500 shadow-md"
          }`}
        >
          {isFloodActive ? "↩️ Canlı Radara Dön" : "⚡ Simülasyonu Başlat (85 mm)"}
        </button>
      </div>
    </header>
  );
}
