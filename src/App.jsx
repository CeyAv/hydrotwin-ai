import React, { useState, useEffect, useRef } from "react";
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Popup,
  Polygon,
  Polyline,
  useMap,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import floodArchive from "./assets/istanbul_historical_floods_multiyear.json";
import evacuationRoutesData from "./assets/evacuation_routes.json";
import LiveWeatherAlert from "./LiveWeatherAlert";
import ResilienceAnalysisPanel from "./components/ResilienceAnalysisPanel";
import CopilotPanel from "./components/CopilotPanel";
import ScadaSimulationPanel from "./components/ScadaSimulationPanel";
import WeatherDonutPanel from "./components/WeatherDonutPanel";
import { Zap, ShieldCheck, AlertTriangle } from "lucide-react";

// --- Çok yıllı tarihsel taşkın arşivi ---
// Tek bir 2022 senaryosu yerine, her biri 5 hidrolojik faz taşıyan senaryolar.
const SCENARIOS = floodArchive.scenarios;
const PHASES = floodArchive.phases;
const DEFAULT_SCENARIO_ID = "composite_average";
const FLOOD_SCENARIO_BY_BASIN = {
  ayazaga: "ayazaga_2026",
  ayamama: "ayamama_2009",
  esenyurt: "esenyurt_2022",
  fatih: "fatih_2019",
};

const PHASE_LABEL = Object.fromEntries(PHASES.map((p) => [p.id, p.label]));
const PHASE_SHORT = Object.fromEntries(PHASES.map((p) => [p.id, p.short]));

/** "2022-07-08" -> "08.07"; kompozitin göreli etiketi ("T-2") olduğu gibi kalır. */
const formatDay = (date) =>
  /^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date.slice(8, 10)}.${date.slice(5, 7)}` : date;

// --- Yağış eşikleri: NASA POWER standardı, mm/GÜN ---
const RAIN_EXTREME_MM = 25; // 2022 sel seviyesi (10 Temmuz = 29.59)
const RAIN_MODERATE_MM = 10;
// Kaydırıcı arşivdeki en şiddetli olayı (2009: 135.2 mm) kapsamalı, yoksa
// senaryo seçilince değer tavana takılır ve kaydırıcı yanlış konum gösterir.
const SLIDER_MAX_MM =
  Math.ceil(Math.max(...SCENARIOS.map((s) => s.peak_rainfall)) / 10) * 10 + 10;

const RAIN_BAND = {
  EXTREME: { key: "EXTREME", label: "Ekstrem / Kritik Taşkın Riski", color: "#ef4444" },
  MODERATE: { key: "MODERATE", label: "Orta Risk / Zemin Doygunluğu", color: "#eab308" },
  LOW: { key: "LOW", label: "Düşük / Güvenli", color: "#22c55e" },
};

function rainBand(mmPerDay) {
  if (mmPerDay > RAIN_EXTREME_MM) return RAIN_BAND.EXTREME;
  if (mmPerDay >= RAIN_MODERATE_MM) return RAIN_BAND.MODERATE;
  return RAIN_BAND.LOW;
}

const RISK = {
  CRITICAL: {
    level: "CRITICAL",
    label: "YÜKSEK ÇARPILMA & TAŞKIN RİSKİ",
    color: "#ef4444",
    scada: "ACİL ENERJİ KESİNTİSİ (İZOLASYON) UYGULA",
  },
  WARNING: {
    level: "WARNING",
    label: "DİKKAT: SU SEVİYESİ YÜKSELİYOR",
    color: "#eab308",
    scada: "STAND-BY: UZAKTAN İZLEME VE DEVRİYE",
  },
  SAFE: {
    level: "SAFE",
    label: "GÜVENLİ / NORMAL İŞLEYİŞ",
    color: "#22c55e",
    scada: "NORMAL ÇALIŞMA",
  },
};

/**
 * Varlığın topoğrafik kırılganlığı — yağıştan bağımsız, sabit bir özellik.
 *
 * Kaynak veri modelindeki isCritical bayrağıdır: havza etüdünde "çanakta /
 * dere yatağında" işaretlenmiş üniteler kırılgandır. Salt rakım eşiği
 * kullanılamaz, çünkü havzaların taban kotu birbirinden çok farklı —
 * İkitelli OSB'nin çanak tabanı 29 m iken Haramidere'ninki 5 m'dir.
 */
function topographicVulnerability(tr) {
  return tr.isCritical ? "HIGH" : "LOW";
}

/**
 * Risk = günlük yağış bandı x topoğrafik kırılganlık x hidrolojik faz.
 *
 * Yağış küresel, kırılganlık varlığa özel; böylece aynı havzadaki sırt trafosu
 * ile dere yatağındaki trafo sel günü aynı rengi almaz.
 *
 * Çekilme (recession) fazı özel: yağış dursa bile su almış hücrelerde nem
 * kalır, meger testi yapılmadan hiçbiri "güvenli" sayılmaz. Su hiç ulaşmamış
 * sırt trafoları (kırılganlık LOW) bu kuralın dışındadır.
 */
function calculateRisk(tr, mmPerDay, phase) {
  const band = rainBand(mmPerDay).key;
  const vulnerability = topographicVulnerability(tr);

  if (vulnerability === "LOW") return RISK.SAFE;

  if (phase === "recession") {
    return band === "EXTREME" ? RISK.CRITICAL : RISK.WARNING;
  }

  if (band === "LOW") return RISK.SAFE;
  if (band === "EXTREME" && vulnerability === "HIGH") return RISK.CRITICAL;
  return RISK.WARNING;
}

// SCADA izolasyonu sonrası enerjisiz trafo rengi ve yedek hat rengi.
const ISOLATED_COLOR = "#64748b";

/** Kritik trafolar daha büyük, daha kalın çerçeveli ve nabız atar. */
function markerStyle(risk, isolated) {
  const critical = risk.level === "CRITICAL";
  const radius = critical ? 12 : risk.level === "WARNING" ? 10 : 8;

  // İzole edilen ünite enerjisizdir: gri, sabit, nabızsız.
  if (isolated) {
    return {
      radius,
      pathOptions: {
        color: ISOLATED_COLOR,
        fillColor: ISOLATED_COLOR,
        fillOpacity: 0.85,
        weight: 3,
      },
    };
  }

  return {
    radius,
    pathOptions: {
      color: risk.color,
      fillColor: risk.color,
      fillOpacity: 0.85,
      weight: critical ? 3 : 2,
      className: critical ? "hydro-pulse" : undefined,
    },
  };
}

/**
 * Yedek beslemenin çıkış noktası: havzadaki en yüksek kotlu GÜVENLİ trafo.
 * Esenyurt gibi tüm trafoları çanakta kalan havzalarda böyle bir trafo yoktur;
 * o durumda yüksek kotlu güvenli toplanma alanı dayanak olarak kullanılır.
 */
function floodPolygonPathOptions(waterLevelCm) {
  if (waterLevelCm >= 90) {
    return {
      color: "#1e3a8a",
      fillColor: "#1e3a8a",
      fillOpacity: 0.75,
      weight: 2,
      dashArray: "4",
    };
  }
  if (waterLevelCm >= 50) {
    return {
      color: "#0284c7",
      fillColor: "#0284c7",
      fillOpacity: 0.45,
      weight: 2,
      dashArray: "4",
    };
  }
  if (waterLevelCm >= 10) {
    return {
      color: "#38bdf8",
      fillColor: "#38bdf8",
      fillOpacity: 0.15,
      weight: 2,
      dashArray: "4",
    };
  }
  return {
    color: "#0284c7",
    fillColor: "#0284c7",
    fillOpacity: 0.45,
    weight: 2,
    dashArray: "4",
  };
}

function backupFeedSource(basin, rainfallMm, phase) {
  const safeHighGround = basin.transformers
    .filter((tr) => calculateRisk(tr, rainfallMm, phase).level === "SAFE")
    .sort((a, b) => b.elevation - a.elevation)[0];

  if (safeHighGround) {
    return {
      name: safeHighGround.name,
      pos: safeHighGround.pos,
      elevation: safeHighGround.elevation,
      isTransformer: true,
    };
  }

  return {
    name: basin.safeZone.name,
    pos: basin.safeZone.pos,
    elevation: basin.safeZone.elevation,
    isTransformer: false,
  };
}

// --- 17 Yıllık Tarihsel Taşkın Bilgi Bankası (2009-2026) ---
// Senaryo zaman serileriyle aynı arşivden okunur; iki ayrı liste tutulmaz.
const HISTORICAL_FLOODS = floodArchive.events;

/** İki yağış değerinin örtüşme yüzdesi (oransal yakınlık). */
function matchPercentage(current, historical) {
  if (current <= 0 || historical <= 0) return 0;
  return Math.round(
    (Math.min(current, historical) / Math.max(current, historical)) * 100
  );
}

/** Tarihsel olayları güncel yağışa göre en yakından en uzağa sıralar. */
function rankHistoricalMatches(rainfallMm) {
  return HISTORICAL_FLOODS.map((event) => ({
    ...event,
    match: matchPercentage(rainfallMm, event.rainfall),
  })).sort((a, b) => b.match - a.match);
}

/** Sel koşullarında temkinli yaya hızı (~4.5 km/h). */
const WALKING_SPEED_MS = 1.25;

const formatDuration = (seconds) => {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} dk`;
  return `${Math.floor(minutes / 60)} sa ${minutes % 60} dk`;
};

const IDLE_ROUTE = {
  status: "idle", // idle | ready
  basinKey: null,
  positions: [],
  distance: null,
  duration: null,
  source: null,
  isFootProfile: true,
  error: null,
};

/**
 * Saha ekibi erişim ekseninin uç noktaları: havzanın en düşük kotlu trafosundan
 * (vadi tabanı) yüksek kotlu güvenli toplanma alanına.
 */
function evacuationRoute(basin) {
  const valleyFloor = [...basin.transformers].sort(
    (a, b) => a.elevation - b.elevation
  )[0];

  return {
    origin: {
      label: basin.valleyFloorLabel,
      name: valleyFloor.name,
      pos: valleyFloor.pos,
      elevation: valleyFloor.elevation,
    },
    destination: {
      label: `${basin.safeZone.name} (Güvenli Alan)`,
      pos: basin.safeZone.pos,
      elevation: basin.safeZone.elevation,
    },
  };
}

// Dinamik Harita Kamerası Bileşeni
function MapController({ center, zoom }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo(center, zoom, { duration: 1.5 });
  }, [center, zoom, map]);
  return null;
}

// Havza ve Altyapı Veritabanı
const BASIN_DATA = {
  ayazaga: {
    name: "Sarıyer (Ayazağa - Cendere Vadisi)",
    criticalLoadNote:
      "Cendere Drenaj Pompaları ve Vadi İstanbul ring beslemesi korundu.",
    valleyLabel: "Cendere",
    valleyFloorLabel: "Cendere Vadi Tabanı",
    center: [41.108, 28.995],
    zoom: 14,
    floodPolygon: [
      [41.102, 28.988],
      [41.115, 28.998],
      [41.118, 29.006],
      [41.105, 29.002],
    ],
    transformers: [
      {
        id: "TR-AYZ-01",
        name: "Cendere Dere Yatağı Sanayi Trafosu",
        pos: [41.1075, 28.9942],
        elevation: 8,
        distToStream: 25,
        isCritical: true,
        type: "34.5/0.4 kV Sanayi Dağıtım",
      },
      {
        id: "TR-AYZ-02",
        name: "Ayazağa Metro Dağıtım Merkezi",
        pos: [41.112, 28.999],
        elevation: 14,
        distToStream: 120,
        isCritical: true,
        type: "Metro İstasyon & Pompa Gücü",
      },
      {
        id: "TR-AYZ-03",
        name: "İTÜ Maslak Sırtı Dağıtım Ünitesi",
        pos: [41.104, 29.015],
        elevation: 72,
        distToStream: 650,
        isCritical: false,
        type: "Yüksek Kot FLISR Yedek Kaynağı",
      },
    ],
    safeZone: {
      name: "İTÜ Maslak Kampüsü Güvenli Sırtı",
      pos: [41.105, 29.02],
      elevation: 85,
    },
  },
  fatih: {
    name: "Fatih (Vatan Caddesi & Aksaray Pilot)",
    criticalLoadNote:
      "Aksaray Alt Geçit Drenajı ve Tarihi Yarımada kamu besleme hatları korundu.",
    valleyLabel: "Vatan Caddesi",
    valleyFloorLabel: "Vatan Caddesi / Aksaray Çanağı",
    center: [41.015, 28.94],
    zoom: 14,
    floodPolygon: [
      [41.011, 28.938],
      [41.022, 28.948],
      [41.018, 28.956],
      [41.008, 28.946],
    ],
    transformers: [
      {
        id: "TR-FTH-01",
        name: "Aksaray Alt Geçit Ana Trafosu",
        pos: [41.0125, 28.948],
        elevation: 6,
        distToStream: 30,
        isCritical: true,
        type: "Alt Geçit Drenaj Besleme",
      },
      {
        id: "TR-FTH-02",
        name: "Vatan Caddesi Orta Gerilim Trafosu",
        pos: [41.017, 28.942],
        elevation: 11,
        distToStream: 70,
        isCritical: true,
        type: "34.5/0.4 kV Orta Gerilim Dağıtım",
      },
      {
        id: "TR-FTH-03",
        name: "Fatih Camii Tepe Şebeke Trafosu",
        pos: [41.0195, 28.95],
        elevation: 64,
        distToStream: 520,
        isCritical: false,
        type: "Yüksek Kot FLISR Yedek Kaynağı",
      },
    ],
    safeZone: {
      name: "Fatih Tepe Parkı ve Toplanma Alanı",
      pos: [41.021, 28.952],
      elevation: 70,
    },
  },
  esenyurt: {
    name: "Esenyurt (Haramidere Kronik Çanak)",
    criticalLoadNote:
      "Haramidere Drenaj Pompaları ve Pınar Mahallesi kritik ringi korundu.",
    valleyLabel: "Haramidere",
    valleyFloorLabel: "Haramidere Yatağı",
    center: [41.012, 28.685],
    zoom: 14,
    floodPolygon: [
      [41.005, 28.675],
      [41.018, 28.689],
      [41.015, 28.699],
      [41.002, 28.682],
    ],
    transformers: [
      {
        id: "TR-ESN-01",
        name: "Haramidere Yatağı Bodrum Trafo",
        pos: [41.011, 28.684],
        elevation: 5,
        distToStream: 15,
        isCritical: true,
        type: "Bodrum Kat Dağıtım (Kronik Çanak)",
      },
      {
        id: "TR-ESN-02",
        name: "Esenyurt Meydan Besleme Trafosu",
        pos: [41.016, 28.681],
        elevation: 19,
        distToStream: 180,
        isCritical: true,
        type: "Meydan & Ticari Besleme",
      },
      {
        id: "TR-ESN-03",
        name: "RTE Parkı Sırtı Dağıtım Merkezi",
        pos: [41.0185, 28.679],
        elevation: 68,
        isCritical: false,
        type: "Yüksek Kot FLISR Yedek Kaynağı (Ring Besleme)",
        capacity: "154/34.5 kV",
      },
    ],
    safeZone: {
      name: "Esenyurt Recep Tayyip Erdoğan Parkı Yüksek Tepe",
      pos: [41.022, 28.692],
      elevation: 68,
    },
  },
  ayamama: {
    name: "Küçükçekmece - Bahçelievler (Ayamama)",
    criticalLoadNote:
      "M9/M1 Çobançeşme Metro Pompaları ve Basın Ekspres lojistik hatları korundu.",
    valleyLabel: "Basın Ekspres",
    valleyFloorLabel: "Basın Ekspres Vadi Tabanı",
    center: [41.003, 28.815],
    zoom: 14,
    floodPolygon: [
      [41.025, 28.805],
      [41.018, 28.822],
      [40.995, 28.828],
      [40.985, 28.818],
      [40.992, 28.802],
      [41.015, 28.798],
    ],
    transformers: [
      {
        id: "TR-AYM-01",
        name: "Basın Ekspres Lojistik Trafo Merkezi",
        pos: [41.0065, 28.812],
        elevation: 12,
        isCritical: true,
        type: "154/34.5 kV Sanayi Ana Dağıtım",
      },
      {
        id: "TR-AYM-02",
        name: "İkitelli Köprüsü Giriş Dağıtım Trafosu",
        pos: [41.019, 28.808],
        elevation: 16,
        isCritical: true,
        type: "Karayolu & Drenaj Besleme",
      },
      {
        id: "TR-AYM-03",
        name: "Çobançeşme Metro & Pompa Trafosu",
        pos: [40.9915, 28.819],
        elevation: 9,
        isCritical: true,
        type: "M9 Hattı Kritik Pompa Cer Gücü",
      },
      {
        id: "TR-AYM-04",
        name: "Kuyumcukent Tepe Dağıtım Merkezi",
        pos: [41.004, 28.829],
        elevation: 64,
        isCritical: false,
        type: "Yüksek Kot FLISR Yedek Kaynağı",
      },
    ],
    safeZone: {
      name: "Yenibosna Çamlık Yüksek Kot Parkı",
      pos: [41.008, 28.835],
      elevation: 78,
    },
  },
  basaksehir: {
    name: "Başakşehir (İkitelli OSB)",
    criticalLoadNote:
      "M9 Ziya Gökalp Metro Cer/Drenaj Pompaları ve İkitelli OSB kritik yükleri korundu.",
    valleyLabel: "İkitelli OSB",
    valleyFloorLabel: "MASKO Çanağı",
    center: [41.072, 28.801],
    zoom: 14,
    floodPolygon: [
      [41.085, 28.792],
      [41.08, 28.815],
      [41.062, 28.812],
      [41.058, 28.795],
      [41.068, 28.785],
    ],
    transformers: [
      {
        id: "TR-BSK-01",
        name: "İkitelli OSB Metal-İş Sanayi Trafo Merkezi",
        pos: [41.069, 28.798],
        elevation: 38,
        isCritical: true,
        type: "154/34.5 kV Sanayi Ağır Yük",
      },
      {
        id: "TR-BSK-02",
        name: "MASKO Dere Yatağı Lojistik Trafosu",
        pos: [41.0635, 28.804],
        elevation: 32,
        isCritical: true,
        type: "Ticari Drenaj Besleme",
      },
      {
        id: "TR-BSK-03",
        name: "Ziya Gökalp Metro İstasyonu Cer Trafosu",
        pos: [41.06, 28.792],
        elevation: 29,
        isCritical: true,
        type: "Metro İstasyon & Pompa Gücü",
      },
      {
        id: "TR-BSK-04",
        name: "Başakşehir 1. Etap Tepe İndirici Merkez",
        pos: [41.084, 28.809],
        elevation: 122,
        isCritical: false,
        type: "Yüksek Kot FLISR Yedek Kaynağı",
      },
    ],
    safeZone: {
      name: "Başakşehir Millet Bahçesi Yüksek Kot Parkı",
      pos: [41.088, 28.805],
      elevation: 115,
    },
  },
};

const BASIN_BEDAS_NAMES = {
  ayazaga: "Ayazağa",
  ayamama: "Ayamama",
  esenyurt: "Haramidere",
  fatih: "Aksaray",
  basaksehir: "İkitelli",
};

const BASINS = Object.fromEntries(
  Object.entries(BASIN_DATA).map(([basinKey, basin]) => {
    const bedasName = BASIN_BEDAS_NAMES[basinKey];
    return [
      basinKey,
      {
        ...basin,
        afadZone: "AFAD 1. Derece Taşkın Riski Alanı (Kot < 15m)",
        criticalPumps: "Metro Tünel Drenaj Pompaları & Alt Geçit Motorları",
        transformers: basin.transformers.map((transformer) => ({
          ...transformer,
          bedasCode: `${transformer.id} / ${bedasName} TM`,
          riskCostUsd: 1200000,
          epdkDailyPenalty: "850.000 TL / gün",
          recommendation:
            "+2.2m Çelik Kaide Yükseltme & SF6 GIS Su Geçirmez Şalt Dönüşümü",
        })),
      },
    ];
  })
);

/**
 * Kompozit model tek bir havzaya bakmaz: harita İstanbul geneline çekilir ve
 * beş havzanın çanakları aynı anda gösterilir.
 */
const COMPOSITE_VIEW = { center: [41.05, 28.85], zoom: 11 };

const THEMATIC_RISK_AREAS = [
  { name: "Fatih", class: "critical", vikor: 0.775, permeability: "Yüksek geçirimsizlik (%85+ beton)", status: "Riskli vadi tabanı", center: [41.018, 28.94], radius: [0.014, 0.018] },
  { name: "Gaziosmanpaşa", class: "critical", vikor: 0.75, permeability: "Yüksek geçirimsizlik (%85+ beton)", status: "Riskli yoğun kentsel doku", center: [41.07, 28.91], radius: [0.014, 0.018] },
  { name: "Bağcılar", class: "critical", vikor: 0.734, permeability: "Yüksek geçirimsizlik (%85+ beton)", status: "Riskli yoğun kentsel doku", center: [41.04, 28.84], radius: [0.014, 0.02] },
  { name: "Güngören", class: "critical", vikor: 0.73, permeability: "Yüksek geçirimsizlik (%85+ beton)", status: "Riskli yoğun kentsel doku", center: [41.02, 28.88], radius: [0.012, 0.016] },
  { name: "Beyoğlu", class: "critical", vikor: 0.721, permeability: "Yüksek geçirimsizlik (%85+ beton)", status: "Kırılgan yamaç ve vadi tabanı", center: [41.034, 28.975], radius: [0.014, 0.018] },
  { name: "Bahçelievler", class: "high", vikor: null, permeability: "Yüksek geçirimsizlik (%85+ beton)", status: "Yüksek kırılganlık", center: [41.0, 28.86], radius: [0.014, 0.02] },
  { name: "Esenler", class: "high", vikor: null, permeability: "Yüksek geçirimsizlik (%85+ beton)", status: "Yüksek kırılganlık", center: [41.08, 28.88], radius: [0.014, 0.02] },
  { name: "Bayrampaşa", class: "high", vikor: null, permeability: "Yüksek geçirimsizlik (%85+ beton)", status: "Yüksek kırılganlık", center: [41.05, 28.91], radius: [0.013, 0.017] },
  { name: "Esenyurt / Haramidere Çukuru", class: "high", vikor: null, permeability: "Vadi tabanında yüksek geçirimsizlik", status: "Riskli vadi tabanı", center: [41.012, 28.685], radius: [0.019, 0.027] },
  { name: "Küçükçekmece / Ayamama Tabanı", class: "high", vikor: null, permeability: "Vadi tabanında yüksek geçirimsizlik", status: "Riskli vadi tabanı", center: [41.003, 28.815], radius: [0.02, 0.03] },
  { name: "Kuyumcukent Tepe", class: "safe", vikor: null, permeability: "Düşük geçirimsizlik, yüksek kot", status: "Güvenli yüksek kot (64 m)", center: [41.004, 28.829], radius: [0.012, 0.018] },
  { name: "Başakşehir 1. Etap", class: "safe", vikor: null, permeability: "Düşük geçirimsizlik, yüksek kot", status: "Güvenli yüksek kot (122 m)", center: [41.084, 28.809], radius: [0.016, 0.022] },
  { name: "Çatalca", class: "safe", vikor: null, permeability: "Düşük yoğunluklu, geçirgen yüzey", status: "Güvenli düşük kentsel yoğunluk", center: [41.14, 28.46], radius: [0.027, 0.038] },
  { name: "Silivri", class: "safe", vikor: null, permeability: "Düşük yoğunluklu, geçirgen yüzey", status: "Güvenli düşük kentsel yoğunluk", center: [41.073, 28.247], radius: [0.023, 0.034] },
  { name: "Beykoz Sırtları", class: "safe", vikor: null, permeability: "Düşük geçirimsizlik, yeşil alan", status: "Güvenli yüksek kot", center: [41.13, 29.1], radius: [0.021, 0.027] },
  { name: "Sarıyer Sırtları", class: "safe", vikor: null, permeability: "Düşük geçirimsizlik, yeşil alan", status: "Güvenli yüksek kot", center: [41.17, 29.05], radius: [0.02, 0.026] },
];

const AYAZAGA_TERRAIN_AREAS = [
  {
    id: "maslak-ridge",
    name: "Maslak / İTÜ Sırtı",
    positions: [
      [41.095, 29.005],
      [41.099, 29.018],
      [41.105, 29.026],
      [41.113, 29.024],
      [41.117, 29.015],
      [41.112, 29.006],
      [41.104, 29.002],
    ],
    color: "#22c55e",
    fillOpacity: 0.18,
    popup:
      "İTÜ Maslak Sırtı (Rakım: 78 m) — Güvenli İndirici Merkez & FLISR Tahliye Ringi (İlçe ortalaması güvenli).",
  },
  {
    id: "cendere-valley",
    name: "Cendere / Ayazağa Vadi Tabanı",
    positions: [
      [41.098, 28.988],
      [41.103, 28.99],
      [41.108, 28.994],
      [41.113, 28.998],
      [41.118, 29.003],
      [41.116, 29.008],
      [41.111, 29.004],
      [41.106, 29.0],
      [41.101, 28.997],
    ],
    color: "#ef4444",
    fillOpacity: 0.25,
    popup:
      "Cendere - Ayazağa Vadi Tabanı (Rakım: 9 m) — 2026 Ani Sel Koridoru. Maslak yamaçlarından gelen yüzeysel akış burada toplanır.",
  },
];

function thematicAreaPolygon([latitude, longitude], [latitudeRadius, longitudeRadius]) {
  return [
    [latitude - latitudeRadius * 0.65, longitude - longitudeRadius],
    [latitude - latitudeRadius, longitude - longitudeRadius * 0.18],
    [latitude - latitudeRadius * 0.58, longitude + longitudeRadius * 0.92],
    [latitude + latitudeRadius * 0.42, longitude + longitudeRadius],
    [latitude + latitudeRadius, longitude + longitudeRadius * 0.12],
    [latitude + latitudeRadius * 0.48, longitude - longitudeRadius * 0.88],
  ];
}

/** Tüm havzalardaki vadi tabanı kritik ünite sayısı (şu an 12). */
const TOTAL_CRITICAL_UNITS = Object.values(BASINS)
  .flatMap((basin) => basin.transformers)
  .filter((tr) => tr.isCritical).length;

/**
 * Kompozit seçiliyken paneller tekil trafo yerine İstanbul geneli projeksiyonu
 * gösterir. Kümülatif tutar yalnızca ekipman değil, plansız kesinti maliyetini
 * de kapsadığı için havza başına formülden türetilmez.
 */
const COMPOSITE_METRICS = {
  resilience: 91,
  preventedDamage: "8.2",
  unitSummary: `${TOTAL_CRITICAL_UNITS} adet vadi tabanı kritik ünitesi`,
  criticalLoad:
    "M1, M9, M2 Metro Drenaj Ringleri ve Vadi Tabanı Arıtma/Terfi Merkezleri",
  recommendationTitle: "🏗️ Gelecek Şebeke Güçlendirme Reçetesi",
  recommendation: `17 yıllık afet frekansı uyarınca; Cendere, Haramidere ve Ayamama çanaklarındaki ${TOTAL_CRITICAL_UNITS} vadi trafosu su geçirmez gaz izoleli (GIS) kabinlere dönüştürülmeli ve zemin seviyesinden en az +2.0 m çelik platform üzerine taşınmalıdır.`,
};

/**
 * Soruyu anahtar kelime eşleştirmesine hazırlar.
 */
const normalizeQuery = (text) =>
  text
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

/**
 * Mühendislik bilgi havuzu — tamamı istemci tarafında, dış servis yok.
 */
const KNOWLEDGE_BASE = [
  {
    id: "ayamama",
    test: /ayamama|basin ekspres|cobancesme|kuyumcukent/,
    reply: `🌊 Ayamama - Basın Ekspres Koridoru Analizi:
• 2009 felaketinin merkezidir; vadideki sanayi ve lojistik tesisleri nedeniyle geçirimsizlik en üst düzeydedir.
• Çözüm: M9/M1 Çobançeşme metro istasyon drenaj pompaları vadi tabanındaki trafodan bağımsızlaştırılmalı, doğrudan Kuyumcukent Tepe Dağıtım (64 m) hattına bağlanmalıdır.`,
  },
  {
    id: "haramidere",
    test: /haramidere|esenyurt|pinar mah/,
    reply: `⚠️ Haramidere - Esenyurt Çöküntü Çanağı:
• Rakım 7-12 m bandında olup kronik taşkın alanıdır.
• Çözüm: TR-ESN-01 ve 02 üniteleri su seviyesi yükselmeden izole edilmeli; ring yükü RTE Parkı Sırtı Dağıtım Merkezi (68 m) üzerinden verilmelidir.`,
  },
  {
    id: "cendere",
    test: /cendere|ayazaga|sariyer|maslak/,
    reply: `🌲 Cendere Vadisi (Ayazağa) Şebeke Analizi:
• Maslak plazalarından inen ani yüzeysel akış dere yatağında anlık kabarma yaratır.
• Çözüm: Vadi tabanındaki sanayi yükü kontrollü kesilmeli (load shedding), Vadi İstanbul dere ıslah pompaları İTÜ Maslak Sırtı (72 m) indirici merkezinden enerjilendirilmelidir.`,
  },
  {
    id: "logistics",
    test: /e-?80|lojistik|ulasim|kriz|\btem\b|cevre yolu|tahliye rotasi/,
    reply: `🚛 Afet Lojistiği & E-80 Koridoru Stratejisi:
• 17 yıllık afetler, E-5 ve Basın Ekspres akslarının ilk 40 dakikada kilitlendiğini göstermektedir.
• Kuzey Çevre Yolu (TEM / E-80) yüksek rakımda kaldığı için ana afet lojistik ekseni olarak belirlenmeli; bu aks üzerindeki yüksek kot trafoları kesintisiz korunmalıdır.`,
  },
  {
    id: "cost",
    test: /maliyet|butce|hasar|yatirim|tasarruf|\broi\b|amorti|kac para|dolar|geri donus/,
    reply: `📊 Finansal Dayanıklılık Projeksiyonu:
• ${TOTAL_CRITICAL_UNITS} kritik vadi trafosunun GIS ve platform modernizasyonu maliyeti: ~1.8M $
• Proaktif izolasyonla önlenen ekipman ve plansız sanayi kesinti maliyeti: ~${COMPOSITE_METRICS.preventedDamage}M $
• Yatırım Geri Dönüşü (ROI): İlk büyük afet pikinde sistem kendini 4.5 kat amorti etmektedir.`,
  },
  {
    id: "risk",
    test: /risk|gelecek|nerede|nereler|nerelerde|taskin|\bsel\b|bolge|kusak/,
    reply: `17 yıllık İstanbul afet hafızası (2009-2026) ve topografik DEM çanak analizi uyarınca:
📍 Yüksek Riskli Kuşak: Avrupa Yakası'nın rakımı 15 m altındaki alüvyon vadi tabanları (Ayamama, Haramidere, Cendere, İkitelli ve Aksaray).
• 80 mm/gün üzerindeki pik yağışlarda yüzey akış katsayısı betonlaşma nedeniyle %85'e ulaşmakta ve su dakikalar içinde trafo köşklerine hücum etmektedir.
• Öncelikli Müdahale Alanları: Çobançeşme M9 metro kavşağı ve Haramidere Pınar Mahallesi çanağıdır.`,
  },
  {
    id: "solution",
    test: /trafo|cozum|oneri|nasil|ne yapmali|onlem|\bgis\b|platform|protokol|iyilestir/,
    reply: `Vadi tabanında risk altındaki ${TOTAL_CRITICAL_UNITS} kritik trafo ünitesi için 3 aşamalı proaktif çözüm protokolü:
1. Fiziksel Kot Yükseltme: Trafo köşkleri taşkın kret kotunun en az +2.0 m üzerine, çelik podyumlar üzerine taşınmalıdır.
2. Su Geçirmez GIS Dönüşümü: Klasik açık hücreler su sızdırmaz Gaz İzoleli Şalt (GIS) kabinleriyle değiştirilmeli, su altı kısa devre ve SF6 sızıntı riski sıfırlanmalıdır.
3. Yüksek Kot FLISR Ringi: Pompa ve kritik yükler, vadi tabanı yerine sırtlardaki yüksek kot merkezlerinden (Kuyumcukent 64 m, İTÜ 72 m, Başakşehir 122 m) çift yönlü ring hatlarıyla beslenmelidir.`,
  },
];

const ANSWER_FALLBACK = `SurgeTwin 17 Yıllık Model Verisi: Avrupa Yakası vadi çanaklarındaki ${TOTAL_CRITICAL_UNITS} kritik ünite proaktif izolasyon ve yük aktarımı protokolüyle güvenceye alınmıştır. Belirli bir havza (Ayamama, Haramidere, Cendere), altyapı yatırımları (GIS, platform yükseltme) veya kriz lojistiği hakkında detay sorabilirsiniz.`;

/** Yerel karar motoru — Afet simülasyonu durumunda dinamik ve anlık yanıt üretir. */
function getBotResponse(question, context = {}) {
  const {
    currentBasin,
    waterLevelCm,
    isolationActive,
    weatherFloodActive,
    protectedAssetUsd,
    rainfallMm,
    backupTransformer,
  } = context;

  const q = normalizeQuery(question);

  // 1. What-If Kriz Simülasyon Motoru (Örn: 135 mm, 115 mm, 125 mm veya özel değer)
  const whatIfMatch = q.match(/(\d{2,3})\s*mm/) || q.match(/what[- ]?if|ya olursa|simulasyon|rekor/);
  if (whatIfMatch) {
    const rawVal = q.match(/(\d{2,3})\s*mm/);
    const amount = rawVal ? parseInt(rawVal[1], 10) : 135;
    const basinName = currentBasin?.name ?? "Cendere Vadisi";
    const perm = currentBasin?.id === "esenyurt" ? 92 : currentBasin?.id === "ayamama" ? 88 : 85;
    const timeToFloor = Math.max(8, Math.round(28 - (amount - 25) * 0.16));
    const timeToBreach = timeToFloor + 6;
    const waterHeight = Math.min(140, Math.round(amount * 0.95));
    const lowestTr = [...(currentBasin?.transformers || [])].sort((a, b) => a.elevation - b.elevation)[0] || { name: "Vadi Tabanı Trafosu", elevation: 8 };
    const penaltyTL = new Intl.NumberFormat("tr-TR").format(Math.round(amount * 38000));
    const passengers = new Intl.NumberFormat("tr-TR").format(Math.round(amount * 400));
    const safeZone = currentBasin?.safeZone?.name ?? "İTÜ Maslak Sırtı";
    const safeElev = currentBasin?.safeZone?.elevation ?? 72;

    return `🔮 WHAT-IF SİMÜLASYONU: ${amount} mm/gün Pik Taşkın Senaryosu
📍 Hedef Havza: ${basinName} (Zemin Geçirimsizliği: %${perm})

⏱️ 1. Dinamik Kriz Kronolojisi:
• T+0 dk: Şiddetli pik fırtına başlangıcı; %${perm} geçirimsiz beton yüzey akışını vadiye hücum ettirir.
• T+${timeToFloor} dk: Vadi tabanında su hızla birikir, seviye ${waterHeight} cm pik kret kotuna ulaşır.
• T+${timeToBreach} dk: ${lowestTr.name} (${lowestTr.elevation} m) 50 cm kaide kotu aşılır. Reaktif beklenirse 34.5 kV hücrede su altı arkı ve infilak gerçekleşir.
• T+${timeToBreach + 7} dk: Cer kesintisi nedeniyle tünel drenaj pompaları durur, metro alt geçit ve peronlarını su basar.

💰 2. Reaktif Beklemenin Mali & İnsani Bilançosu:
• Ekipman İnfilak Hasarı: ~$${((protectedAssetUsd || 2_400_000) / 1_000_000).toFixed(1)}M (Trafo yenileme/tedarik süresi: 4-6 hafta)
• EPDK Kesinti Tazminatı: ~₺${penaltyTL} TL (Plansız geniş alan kesintisi)
• Etkilenen Kamu Ulaşımı: ~${passengers} metro yolcusunun tahliye riski

⚡ 3. SurgeTwin Proaktif Mühendislik Kararı:
• T+${Math.max(3, timeToFloor - 5)} dk: Su seviyesi henüz 15 cm iken vadi köşkleri SCADA ile uzaktan izole edilir.
• Ring Manevrası: Metro drenaj hatları ${safeZone} (${safeElev} m) güvenli sırt merkezine aktarılır.
• Sonuç: Sıfır ark patlaması, sıfır metro felci, 24 saatte hızlı meger testiyle yeniden devreye alma!`;
  }

  // 2. Jüri & Karar Verici: Neden Eski Yöntemler Geçersiz?
  if (/eski|gecersiz|neden eski|reaktif|klasik|geleneksel|neden degisti|farki ne|juri/.test(q)) {
    return `⚖️ Neden Eski / Klasik Yöntemler Geçersizdir? (Jüri & Karar Verici Analizi):

1. 💥 Reaktif Çöküş İlkesi:
Klasik dağıtım şebekesinde trafo suyun içine gömülüp patlayana kadar enerji kesilmez. Su 50 cm kaide kotunu aştığında su altı arkı patlar; SF6 gazı atmosfere, yüzlerce litre trafo izolasyon yağı dere yatağına saçılır.

2. ⏳ 6 Haftalık Tedarik Felci:
İnfilak eden bir vadi trafo merkezinin sipariş, imalat ve montaj süresi en az 3 ila 6 hafta sürer. Bu sürede metro ve sanayi hatları elektriksiz kalır.

3. 🚛 Lojistik İmkânsızlığı:
17 yıllık afet frekansı (2009-2026), vadi tabanı arterlerinin (E-5 ve Basın Ekspres) ilk 40 dakikada kilitlendiğini doğrulamaktadır. İtfaiye, tahliye pompası veya mobil jeneratörler vadiye FİZİKEN ULAŞAMAZ.

4. 💸 EPDK Tazminat Cezaları:
Mevzuat uyarınca plansız uzun süreli kesintilerde dağıtım şirketine günlük 850.000 TL'yi aşan ağır regülasyon cezaları kesilir.

✅ SurgeTwin Farkı: Su henüz 15 cm iken uzaktan kontrollü izole eder; trafo ıslansa dahi patlamaz, su çekilince meger yalıtım testiyle 24 saatte güvenle devreye alınır!`;
  }

  // 3. Jüri & Karar Verici: Bu Aktarımın / Ring Beslemenin Faydası Ne?
  if (/aktarim|fayda|ne ise yarar|yarari ne|neden ring|ring fayda|neden onemli/.test(q)) {
    return `💡 Proaktif Ring Beslemesinin ve Yük Aktarımının Temel Faydaları:

1. 🚇 Sıfır Metro Felci & Can Güvenliği:
Vadi tabanı trafosu izole edilse dahi M1, M9 ve kritik drenaj pompaları yeşil sırtlardaki (${backupTransformer?.name ?? "İTÜ Maslak 72m / Kuyumcukent 64m"}) merkezlerden çift yönlü ring ile kesintisiz beslenir. Metro tünelleri su altında kalmaz.

2. 🛡️ 8.2 Milyon Dolar Kümülatif Tasarruf:
İstanbul geneli 12 vadi tabanı kritik ünitesinde kümülatif ~8.2M $ ekipman yenileme ve plansız sanayi kesinti hasarı önlenir.

3. 📈 4.5x Yatırım Geri Dönüşü (ROI):
1.8M $ modernizasyon ve SCADA otomasyon bütçesi, ilk büyük pik afet fırtınasında kendini 4.5 kat amorti eder.

4. ⚡ Kontrollü Yük Önceliklendirmesi (Load Shedding):
Ağır sanayi yükü kontrollü bekletilirken; hastaneler, tahliye pompaları ve afet lojistiği kesintisiz enerjili tutulur.`;
  }

  // 4. Sel İçin Proaktif Reçete Nedir?
  if (/proaktif|recete|cozum|oneri|nasil koruruz|gelecek sel|yapilandir/.test(q)) {
    return `🏗️ Gelecek Seller İçin 4 Boyutlu Proaktif Dayanıklılık Reçetesi:

1. 📐 Fiziksel Kot Yükseltmesi (+2.0 m):
12 vadi tabanı trafo köşkü, taşkın kret seviyesinin en az +2.0 metre üzerine, çelik podyumlar üzerine taşınmalıdır.

2. 🛡️ IP68 Gaz İzoleli Şalt (GIS) Dönüşümü:
Açık tip hava izoleli hücreler, su altında dahi çalışabilen SF6 Gaz İzoleli Şalt kabinlerine dönüştürülerek patlama riski sıfırlanmalıdır.

3. 🔄 Yüksek Kot FLISR Ring Omurgası:
Vadi tabanında tek yönlü radyal besleme yerine, güvenli sırt kotlarından (İTÜ 72m, Kuyumcukent 64m, Başakşehir 122m) çift yönlü ring hatları kurulmalıdır.

4. 🌲 Doğa Temelli Çözümler (NBS):
Vadi yamaçlarında yağmur hendekleri, sızıntı havzaları ve %30 geçirimli zemin kaplamaları uygulanarak yüzey akış katsayısı kırılmalıdır.`;
  }

  // 5. Anlık Afet & Kriz Durumu
  if (/afet|kriz|durum|anlik|su seviye|alar[m|i]|simule/.test(q)) {
    if (weatherFloodActive) {
      return `🚨 AKTİF AFET ALARMI (${rainfallMm || 85} mm/gün):
• Havza: ${currentBasin?.name ?? "Cendere Vadisi"}
• Vadi Tabanı Su Seviyesi: ${waterLevelCm} cm (${waterLevelCm >= 90 ? "Pik Taşkın Kret Kotu" : waterLevelCm >= 50 ? "Kaide Eşiği" : "Taban Akışı"})
• SCADA Durumu: ${
        isolationActive
          ? `✅ Proaktif izolasyon uygulandı. ~$${((protectedAssetUsd || 2_400_000) / 1_000_000).toFixed(1)}M varlık korundu.`
          : "⚠️ İZOLASYON BEKLEMEDE! Vadi tabanı trafolarının su kret seviyesine ulaşmadan enerjisiz bırakılması önerilir."
      }
• Ring Besleme: Kritik metro ve tahliye pompaları ${backupTransformer?.name ?? "yüksek kot indirici merkezine"} aktarılmalıdır.`;
    }
    return `🌤️ Normal İşletme Durumu:
• Havza: ${currentBasin?.name ?? "İstanbul Geneli"}
• Şebeke Durumu: Güvenli, aktif taşkın riski bulunmuyor.
• Canlı Yağış: 0.0 mm/h.
• Pik afeti simüle etmek için üst bardaki '⚡ Afet Simülasyonunu Tetikle' butonunu kullanabilirsiniz.`;
  }

  // 2. Metro Pompaları & Kritik Yükler (Load Shedding)
  if (/pompa|metro|drenaj|tahliye|cer|load shedding|yuk/.test(q)) {
    return `🚇 Kritik Yük & Metro Drenaj Pompaları Protokolü:
• ${currentBasin?.name ?? "Vadi"} çanağındaki metro tünel drenaj pompaları (${currentBasin?.criticalPumps ?? "M1/M9 drenaj hatları"}) asla enerjisiz bırakılamaz.
• Vadi tabanı trafosu izole edildiğinde, çift yönlü ring ile ${backupTransformer?.name ?? "İTÜ Maslak Sırtı (72 m)"} merkezinden beslenir.
• Yük önceliği sırasıyla: 1. Metro drenaj pompaları, 2. Hastane hatları, 3. Saha aydınlatmasıdır. Ağır sanayi yükü kontrollü kesilir.`;
  }

  // 3. İzolasyon & Yeniden Enerji Verme (Re-energization)
  if (/izolasyon|kesici|scada|yeniden enerji|re-?energiz|enerji ver|meger/.test(q)) {
    return `⚡ SCADA Proaktif İzolasyon & Yeniden Enerji Protokolü:
• Taşkın anında su seviyesi 50 cm kaide kotuna ulaştığında vadi köşkleri uzaktan izole edilir (su altı ark ve patlama önlenir).
• Yeniden enerji verme: Yağış dursa dahi su tamamen çekilmeden ve meger yalıtım testleri (%84+ zemin nemi uyarınca) tamamlanmadan ana kesiciler kapatılmamalıdır.`;
  }

  // 4. Saha & Güvenli Toplanma Noktası
  if (/toplanma|tahliye|kacis|nerede|nereye|guvenli bolge|sigin/.test(q)) {
    return `📍 Güvenli Toplanma & Lojistik Rotası:
• Seçili Havza: ${currentBasin?.name ?? "Ayazağa Cendere"}
• Güvenli Toplanma Noktası: ${currentBasin?.safeZone?.name ?? "İTÜ Maslak Sırtı"} (Rakım: ${currentBasin?.safeZone?.elevation ?? 85} m)
• Lojistik Aksı: E-5 ve Basın Ekspres su altında kaldığında acil sahra ekipleri yüksek kotlu Kuzey Çevre Yolu (TEM / E-80) sırtından sevk edilir.`;
  }

  // 5. Bilgi tabanı eşleşmesi
  const match = KNOWLEDGE_BASE.find((entry) => entry.test.test(q));
  if (match) return match.reply;

  return ANSWER_FALLBACK;
}

/** Yapay zekâ düşünme simülasyonu süresi. */
const BOT_THINKING_MS = 350;

const CHAT_WELCOME = `🤖 SurgeTwin AI İklim & SCADA Danışmanı devrede. Şebeke direnci, What-If senaryoları veya operasyonel kararlar hakkında soru sorabilirsiniz.`;

const CHAT_HINTS = [
  "🔮 135 mm Rekor Yağarsa?",
  "⚖️ Neden Eski Yöntemler Geçersiz?",
  "💡 Bu Aktarımın Faydası Ne?",
  "🏗️ Gelecek Şebeke Reçetesi",
  "🚇 Metro Pompaları Protokolü",
  "💰 Finansal Bilanço & ROI",
];

const COMPOSITE_ANSWERS = {
  load_shedding:
    "17 yıllık İstanbul afet verileri, taşkınların en çok Ayamama ve Haramidere dere yataklarındaki ulaşım ve pompa yüklerini kestiğini doğrulamaktadır. Yük önceliği kesintisiz olarak metro tünel drenaj pompalarına verilmelidir.",
  re_energization:
    "İstanbul genelinde ortalama kuruma süresi 24 saattir. Vadi tabanlarındaki alüvyon zeminlerde su çekilse dahi toprak nemi (%84) yüksek kaldığından meger yalıtım testleri tamamlanmadan bölgesel enerji verilmemelidir.",
  resilience:
    "2009-2026 yılları arasındaki 6 büyük afet analiz edildiğinde, proaktif SCADA izolasyonu uygulanmayan senaryolarda kümülatif trafo onarım ve plansız kesinti maliyetinin 8 milyon doları aştığı hesaplanmıştır.",
};

export default function App() {
  const [selectedBasinKey, setSelectedBasinKey] = useState("ayazaga");
  const [focusedBasinKey, setFocusedBasinKey] = useState(null);
  const [selectedScenarioId, setSelectedScenarioId] = useState(DEFAULT_SCENARIO_ID);
  const [selectedPhase, setSelectedPhase] = useState("peak");
  // null ise yağış NASA ölçümünden gelir; sayı ise kullanıcı kaydırıcıyla ezmiştir.
  const [manualRainfall, setManualRainfall] = useState(null);
  const [weatherFloodActive, setWeatherFloodActive] = useState(false);
  const [liveWeatherData, setLiveWeatherData] = useState({
    precipitation: 0,
    temperature: 19,
    refreshing: false,
    error: "",
  });
  const [waterLevelCm, setWaterLevelCm] = useState(0);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportGeneratedAt, setReportGeneratedAt] = useState(null);
  const [showMethodology, setShowMethodology] = useState(false);
  const [showOpsLog, setShowOpsLog] = useState(false);
  const [crisisEventLog, setCrisisEventLog] = useState([]);
  // İzolasyon tetiklendiği havzaya bağlıdır; senaryo auto-sync ile havza
  // değişince manevra o havzada kalır, yeni havzaya taşınmaz.
  const [isolation, setIsolation] = useState({ active: false, basinKey: null });
  const [activeTab, setActiveTab] = useState("scada");
  const [routeState, setRouteState] = useState(IDLE_ROUTE);
  const [activeQuestionId, setActiveQuestionId] = useState(null);
  const [chatInput, setChatInput] = useState("");
  const [isBotTyping, setIsBotTyping] = useState(false);
  const [chatMessages, setChatMessages] = useState([
    { role: "bot", text: CHAT_WELCOME },
  ]);
  const chatScrollRef = useRef(null);

  // Yeni mesaj geldiğinde cevabın ve sorunun en üstüne (başlığına) odaklan
  useEffect(() => {
    const el = chatScrollRef.current;
    if (!el) return;

    const items = el.querySelectorAll(".chat-message-item");
    if (items.length > 0) {
      const targetItem = items.length >= 2 ? items[items.length - 2] : items[items.length - 1];
      const offsetTop = targetItem.offsetTop - el.offsetTop;
      el.scrollTo({
        top: Math.max(0, offsetTop - 6),
        behavior: "smooth",
      });
    }
  }, [chatMessages, isBotTyping]);

  const sendChatMessage = (event, customQuestion) => {
    if (event?.preventDefault) event.preventDefault();
    const question = (customQuestion || chatInput).trim();
    if (!question || isBotTyping) return;

    setChatInput("");
    setChatMessages((previous) => [...previous, { role: "user", text: question }]);
    setIsBotTyping(true);
    window.setTimeout(() => {
      setChatMessages((previous) => [
        ...previous,
        {
          role: "bot",
          text: getBotResponse(question, {
            currentBasin,
            waterLevelCm,
            isolationActive,
            weatherFloodActive,
            protectedAssetUsd,
            rainfallMm,
            backupTransformer,
          }),
        },
      ]);
      setIsBotTyping(false);
    }, BOT_THINKING_MS);
  };

  const handleLiveFloodTrigger = (isCritical, _rainAmount) => {
    if (!isCritical) {
      if (weatherFloodActive) {
        setWeatherFloodActive(false);
        setSelectedScenarioId(DEFAULT_SCENARIO_ID);
        setSelectedPhase("peak");
        setManualRainfall(null);
        setIsolation({ active: false, basinKey: null });
        setFocusedBasinKey(null);
        setRouteState(IDLE_ROUTE);
        setCrisisEventLog([]);
        setWaterLevelCm(0);
      }
      return;
    }

    const floodScenarioId = FLOOD_SCENARIO_BY_BASIN[selectedBasinKey];
    setWeatherFloodActive(true);
    setWaterLevelCm(90);
    setManualRainfall(85);
    setSelectedScenarioId(floodScenarioId ?? "ayazaga_2026");
    setSelectedPhase("peak");
    setFocusedBasinKey(selectedBasinKey);
    setIsolation({ active: false, basinKey: null });
    setRouteState(IDLE_ROUTE);
    const startedAt = Date.now();
    setCrisisEventLog([
      { minute: 0, at: startedAt, text: "Canlı yağış / pik afet eşiği (85 mm) algılandı; havza alarmı üretildi." },
      { minute: 2, at: startedAt + 2 * 60_000, text: "Vadi tabanındaki kritik trafo ve metro drenaj yükleri risk listesine alındı." },
      { minute: 4, at: startedAt + 4 * 60_000, text: `Model yedek kaynak önerisi: ${BASINS[selectedBasinKey].transformers.find((transformer) => !transformer.isCritical)?.name ?? BASINS[selectedBasinKey].safeZone.name}.` },
      { minute: 6, at: startedAt + 6 * 60_000, text: "SCADA operatör onayı bekleniyor; proaktif izolasyon manevrası hazır." },
    ]);
  };

  const handleSelectWeatherBasin = (basinKey) => {
    if (!BASINS[basinKey]) return;
    if (basinKey !== selectedBasinKey) {
      setWeatherFloodActive(false);
      setSelectedScenarioId(DEFAULT_SCENARIO_ID);
      setSelectedPhase("peak");
      setManualRainfall(null);
      setIsolation({ active: false, basinKey: null });
      setWaterLevelCm(0);
      setCrisisEventLog([]);
    }
    setSelectedBasinKey(basinKey);
    setFocusedBasinKey(basinKey);
    setRouteState(IDLE_ROUTE);
  };

  const currentBasin = BASINS[selectedBasinKey];

  const scenario =
    SCENARIOS.find((s) => s.id === selectedScenarioId) ?? SCENARIOS[0];
  const isComposite = scenario.id === "composite_average";
  const currentDay =
    scenario.days.find((d) => d.phase === selectedPhase) ?? scenario.days[0];

  const archiveRainfall = currentDay.PRECTOTCORR;
  const humidity = currentDay.RH2M;
  const isManual = manualRainfall !== null;
  const rainfallMm =
    waterLevelCm === 10
      ? 10
      : waterLevelCm === 50
        ? 50
        : waterLevelCm >= 90 || weatherFloodActive
          ? (manualRainfall ?? 85)
          : isManual
            ? manualRainfall
            : isComposite
              ? 0.0
              : archiveRainfall;

  const band = rainBand(rainfallMm);
  const isFloodEvent = band.key === "EXTREME";
  const riskForTransformer = (transformer) => {
    if (transformer.isCritical) {
      if (waterLevelCm === 10) return RISK.SAFE;
      if (waterLevelCm >= 50 && waterLevelCm < 90) return RISK.WARNING;
      if (waterLevelCm >= 90) return RISK.CRITICAL;
    }
    if (
      transformer.isCritical &&
      (waterLevelCm >= 50 || rainfallMm > 30)
    ) {
      return RISK.CRITICAL;
    }
    return calculateRisk(transformer, rainfallMm, selectedPhase);
  };

  const selectPhase = (phaseId) => {
    if (weatherFloodActive) return;
    setSelectedPhase(phaseId);
    setManualRainfall(null); // faz seçimi manuel ezmeyi iptal eder
  };

  const criticalTransformers = currentBasin.transformers.filter(
    (tr) => riskForTransformer(tr).level === "CRITICAL"
  );
  const isolationTargets =
    waterLevelCm >= 50
      ? currentBasin.transformers.filter((tr) => tr.isCritical)
      : criticalTransformers;
  const protectedAssetUsd = isolationTargets.reduce(
    (sum, transformer) => sum + (transformer.riskCostUsd || 1_200_000),
    0
  );

  // İzolasyon yalnızca kesilecek kritik ünite varken ve tetiklendiği havzada
  // anlamlıdır. Türetilmiş olduğu için faz/havza değişince manevra
  // kendiliğinden geri alınır — ayrı bir effect ile state sıfırlamaya gerek yok.
  const isolationActive =
    !isComposite &&
    isolation.active &&
    isolation.basinKey === selectedBasinKey &&
    isolationTargets.length > 0;

  const toggleIsolation = () => {
    const shouldIsolate = !(isolation.active && isolation.basinKey === selectedBasinKey);
    setIsolation(
      shouldIsolate
        ? { active: true, basinKey: selectedBasinKey }
        : { active: false, basinKey: null }
    );
    if (shouldIsolate) {
      const source = backupFeedSource(currentBasin, rainfallMm, selectedPhase);
      setCrisisEventLog((previous) => [
        ...previous,
        {
          minute: previous.length ? Math.max(...previous.map((entry) => entry.minute)) + 2 : 0,
          at: Date.now(),
          text: `${isolationTargets.length} kritik trafo izole edildi; metro/tahliye yükleri ${source.name} (${source.elevation} m) yedeğine aktarıldı.`,
        },
      ].slice(-5));
    } else {
      setCrisisEventLog((previous) => [
        ...previous,
        {
          minute: previous.length ? Math.max(...previous.map((entry) => entry.minute)) + 1 : 0,
          at: Date.now(),
          text: "Operatör izolasyonu geri aldı; simülasyon yükleri normal işletime döndürüldü.",
        },
      ].slice(-5));
    }
  };

  const handleWaterLevelChange = (nextLevelCm) => {
    const previousLevelCm = waterLevelCm;
    setWaterLevelCm(nextLevelCm);
    if (nextLevelCm <= 10) {
      setWeatherFloodActive(false);
      setManualRainfall(5);
    } else if (nextLevelCm < 90) {
      setWeatherFloodActive(false);
      setManualRainfall(35);
    } else {
      setWeatherFloodActive(true);
      setManualRainfall(85);
      setSelectedPhase("peak");
    }
    if ((previousLevelCm < 50 && nextLevelCm >= 50) || (previousLevelCm >= 50 && nextLevelCm < 50)) {
      setCrisisEventLog((previous) => [
        ...previous,
        {
          minute: previous.length ? Math.max(...previous.map((entry) => entry.minute)) + 1 : 0,
          at: Date.now(),
          text: nextLevelCm >= 50
            ? `Su seviyesi ${nextLevelCm} cm'ye ulaştı; 50 cm kaide eşiği aşıldı, dere trafoları uyarı/kritik banda alındı.`
            : `Su seviyesi ${nextLevelCm} cm'ye düştü; kaide eşiği altında, vadi trafoları güvenli banda döndü.`,
        },
      ].slice(-5));
    }
  };
  const isolatedIds = new Set(
    isolationActive ? isolationTargets.map((tr) => tr.id) : []
  );
  const backupSource = isolationActive
    ? backupFeedSource(currentBasin, rainfallMm, selectedPhase)
    : null;
  const backupLines = isolationActive
    ? isolationTargets.map((transformer) => ({ transformer, source: backupSource }))
    : [];

  // --- Tahliye rotası & AI danışmanı (havzaya göre uyarlanır) ---
  const route = evacuationRoute(currentBasin);
  const historicalMatches = rankHistoricalMatches(rainfallMm);
  const closestEvent = historicalMatches[0];
  // --- Havzaya özel direnç metrikleri (hepsi currentBasin'den türer) ---
  const criticalUnits = (currentBasin.transformers || []).filter(
    (tr) => tr.isCritical
  );

  // Havzanın yüksek kotlu, su almayan ünitesi; yoksa jenerik dayanak.
  const backupTransformer = (currentBasin.transformers || []).find(
    (tr) => !tr.isCritical
  ) ?? { name: "Yüksek Kot İndirici Merkez", elevation: 85 };

  const riskCount = criticalUnits.length || 2;
  const criticalIds =
    criticalUnits.map((tr) => tr.id).join(", ") || "Kritik üniteler";

  // Kompozit model seçiliyken metrikler İstanbul geneli projeksiyonuna döner.
  const resilienceScore = isComposite
    ? COMPOSITE_METRICS.resilience
    : Math.min(96, Math.round(82 + riskCount * 3.5));
  const preventedDamage = isComposite
    ? COMPOSITE_METRICS.preventedDamage
    : (riskCount * 0.65).toFixed(1);

  // Haritanın odağı ve çizilecek havzalar: kompozitte beşi birden.
  const mapFocus = isComposite
    ? focusedBasinKey
      ? { center: BASINS[focusedBasinKey].center, zoom: BASINS[focusedBasinKey].zoom }
      : COMPOSITE_VIEW
    : { center: currentBasin.center, zoom: currentBasin.zoom };
  const visibleBasins = isComposite ? Object.values(BASINS) : [currentBasin];
  const showAyazagaTerrain = isComposite || scenario.id === "ayazaga_2026";

  // AI Grid Copilot — yanıtlar seçili havzanın adı ve gerçek üniteleriyle üretilir.
  const QUICK_QUESTIONS = [
    {
      id: "load_shedding",
      question: "Kritik Yük Önceliklendirmesi (Load Shedding):",
      answer: isComposite
        ? COMPOSITE_ANSWERS.load_shedding
        : `${currentBasin.name} vadi tabanında su yükselirken cer ve ağır sanayi yükü kontrollü kesilmeli; hat kapasitesi öncelikle drenaj pompalarına ve acil durum merkezine yönlendirilmelidir.`,
    },
    {
      id: "re_energization",
      question: "Re-Energization (Yeniden Enerji Verme) Protokolü:",
      answer: isComposite
        ? COMPOSITE_ANSWERS.re_energization
        : `${currentBasin.name} çanağında su çekilmeden ve sahadaki ${criticalIds} ünitelerinde meger yalıtım testi tamamlanmadan ana kesiciler kapatılmamalıdır.`,
    },
    {
      id: "resilience",
      question: "Şebeke Dayanıklılığı & İklim Risk Analizi:",
      answer: isComposite
        ? COMPOSITE_ANSWERS.resilience
        : `Proaktif izolasyon, aşırı hava olaylarında şebekenin esnekliğini (grid elasticity) korur; trafo patlamalarını, çevreye yağ sızıntısını ve haftalar sürebilecek plansız geniş alan kesintilerini önler. ${currentBasin.name} havzasındaki manevra, kritik ünitelerin su altında patlamasını ve ~${preventedDamage}M $ ekipman kaybını engellemiştir.`,
    },
  ];

  const activeQuestion =
    QUICK_QUESTIONS.find((item) => item.id === activeQuestionId) ?? null;

  // Rota yalnızca ait olduğu havzada çizilir; havza değişince kendiliğinden düşer.
  const routeMatchesBasin = routeState.basinKey === selectedBasinKey;
  const routeReady = routeState.status === "ready" && routeMatchesBasin;

  /** OpenStreetMap sokak ve yaya ağından üretilmiş gerçekçi güvenli tahliye güzergâhı. */
  const calculateSafeRoute = () => {
    if (routeReady) {
      setRouteState(IDLE_ROUTE);
      return;
    }

    const basinKey = selectedBasinKey;
    const preset = evacuationRoutesData[basinKey];
    if (preset && preset.positions && preset.positions.length > 0) {
      setRouteState({
        status: "ready",
        basinKey,
        positions: preset.positions,
        distance: preset.distanceMeters,
        duration: preset.durationSeconds || Math.round(preset.distanceMeters / WALKING_SPEED_MS),
        source: "OpenStreetMap Sokak & Yaya Tahliye Ağı (OSRM)",
        isFootProfile: true,
        error: null,
      });
      return;
    }

    // Yedek: Koordinatlar arası bağlantı
    const [startLat, startLon] = route.origin.pos;
    const [endLat, endLon] = route.destination.pos;
    const fallbackDist = 3200;
    setRouteState({
      status: "ready",
      basinKey,
      positions: [route.origin.pos, route.destination.pos],
      distance: fallbackDist,
      duration: Math.round(fallbackDist / WALKING_SPEED_MS),
      source: "Saha Tahliye Güzergâhı",
      isFootProfile: true,
      error: null,
    });
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-slate-950 text-slate-100 font-sans">
      <LiveWeatherAlert
        selectedBasinKey={selectedBasinKey}
        onSelectBasin={handleSelectWeatherBasin}
        onTriggerFlood={handleLiveFloodTrigger}
        isFloodActive={weatherFloodActive}
        onWeatherUpdate={setLiveWeatherData}
      />

      {/* Sekmeler */}
      <nav className="bg-slate-900 border-b border-slate-800 px-6 flex items-center">
        <div className="flex items-end space-x-1">
          {[
            {
              id: "scada",
              label: isComposite
                ? "🗺️ Potansiyel Risk Haritası"
                : "⚡ Proaktif SCADA Manevra Alanı",
            },
            { id: "advisor", label: "🤖 AI Grid Copilot & İklim Uyum Danışmanı" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              aria-current={activeTab === tab.id ? "page" : undefined}
              className={`text-xs font-semibold px-4 py-2.5 rounded-t transition-all border-b-2 ${
                activeTab === tab.id
                  ? "border-cyan-400 text-cyan-300 bg-slate-800/60"
                  : "border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/30"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </nav>

      {/* Ana Çalışma Alanı (Harita + Kontrol Paneli) */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sol Panel: İklim Adaptasyonu & Kayıp Önleme Metrikleri (COP standardı) */}
        {activeTab === "advisor" && (
          <ResilienceAnalysisPanel
            isComposite={isComposite}
            currentBasin={currentBasin}
            TOTAL_CRITICAL_UNITS={TOTAL_CRITICAL_UNITS}
            riskCount={riskCount}
            isolationActive={isolationActive}
            resilienceScore={resilienceScore}
            preventedDamage={preventedDamage}
            COMPOSITE_METRICS={COMPOSITE_METRICS}
            visibleBasins={visibleBasins}
            backupTransformer={backupTransformer}
            criticalIds={criticalIds}
            route={route}
            calculateSafeRoute={calculateSafeRoute}
            routeReady={routeReady}
            routeState={routeState}
            formatDuration={formatDuration}
            weatherFloodActive={weatherFloodActive}
          />
        )}

        {/* Harita */}
        <div className="flex-1 relative">
          {/* 🚨 SADECE SCADA AFET EKRANINDA ÇIKAN ACİL DURUM EYLEM HUD'I */}
          {activeTab === "scada" && weatherFloodActive && (
            <aside aria-label="Acil Afet Uyarısı" className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] pointer-events-auto">
              {!isolationActive ? (
                <div className="flex items-center gap-3 bg-slate-950/95 border-2 border-rose-500 rounded-2xl px-4 py-2.5 shadow-[0_0_35px_rgba(244,63,94,0.55)] backdrop-blur-md animate-in fade-in zoom-in-95 duration-200">
                  <div className="flex items-center gap-2">
                    <span className="relative flex h-3.5 w-3.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-rose-500"></span>
                    </span>
                    <span className="text-rose-200 text-xs sm:text-sm font-black tracking-wide uppercase">
                      🚨 ŞU AN RİSK ALTINDASINIZ!
                    </span>
                  </div>

                  <div className="h-5 w-px bg-slate-700 hidden sm:block" />

                  <button
                    type="button"
                    onClick={toggleIsolation}
                    className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-400 via-amber-500 to-rose-600 hover:from-amber-300 hover:to-rose-500 text-slate-950 font-black text-xs sm:text-sm shadow-xl flex items-center gap-2 transition active:scale-95 animate-pulse cursor-pointer"
                  >
                    <Zap size={16} className="fill-current text-slate-950" />
                    <span>⚡ HEMEN İZOLASYONU BAŞLAT</span>
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-3 bg-slate-950/95 border-2 border-emerald-500 rounded-2xl px-4 py-2 shadow-[0_0_25px_rgba(16,185,129,0.35)] backdrop-blur-md animate-in fade-in duration-200">
                  <div className="flex items-center gap-2 text-emerald-300 text-xs sm:text-sm font-bold">
                    <ShieldCheck size={18} className="text-emerald-400" />
                    <span>🛡️ Şebeke Başarıyla İzole Edildi (Güvende)</span>
                  </div>
                  <button
                    type="button"
                    onClick={toggleIsolation}
                    className="text-[11px] font-semibold text-slate-400 hover:text-slate-200 underline ml-1 transition cursor-pointer"
                  >
                    Geri Al
                  </button>
                </div>
              )}
            </aside>
          )}

          <MapContainer
            center={currentBasin.center}
            zoom={currentBasin.zoom}
            className="h-full w-full"
          >
            {/* Kompozitte İstanbul geneli, tekil vakada havza merkezi. */}
            <MapController center={mapFocus.center} zoom={mapFocus.zoom} />
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            />

            {/* Su Baskını Poligonları */}
            {!isComposite && (isFloodEvent || waterLevelCm >= 10) &&
              visibleBasins.map((basin) => (
                <Polygon
                  key={`flood-${basin.name}`}
                  positions={basin.floodPolygon}
                  pathOptions={floodPolygonPathOptions(waterLevelCm)}
                >
                  <Popup>
                    <div className="text-slate-900 text-xs leading-relaxed">
                      <p className="font-bold text-sm">{basin.name}</p>
                      <p>Tahmini taşkın çanağı (DEM modeli)</p>
                    </div>
                  </Popup>
                </Polygon>
              ))}

            {isComposite &&
              THEMATIC_RISK_AREAS.map((area) => {
                const style = {
                  critical: { color: "#dc2626", fillColor: "#ef4444", fillOpacity: 0.25 },
                  high: { color: "#ea580c", fillColor: "#f97316", fillOpacity: 0.2 },
                  safe: { color: "#16a34a", fillColor: "#86efac", fillOpacity: 0.15 },
                }[area.class];
                return (
                <Polygon
                  key={`thematic-risk-${area.name}`}
                  positions={thematicAreaPolygon(area.center, area.radius)}
                  pathOptions={{
                    ...style,
                    weight: 2,
                  }}
                >
                  <Popup>
                    <div className="text-slate-900 text-xs leading-relaxed">
                      <p className="font-bold text-sm">{area.name}</p>
                      <p><b>İTÜ-AKOM VIKOR:</b> {area.vikor?.toFixed(3) ?? "Tanımlı değil"}</p>
                      <p><b>Geçirimsizlik:</b> {area.permeability}</p>
                      <p><b>Bölge durumu:</b> {area.status}</p>
                    </div>
                  </Popup>
                </Polygon>
                );
              })}

            {showAyazagaTerrain &&
              AYAZAGA_TERRAIN_AREAS.map((area) => (
                <Polygon
                  key={`ayazaga-terrain-${area.id}`}
                  positions={area.positions}
                  pathOptions={{
                    color: area.color,
                    fillColor: area.color,
                    fillOpacity: area.fillOpacity,
                    weight: 2,
                  }}
                >
                  <Popup>
                    <div className="text-slate-900 text-xs leading-relaxed">
                      {area.popup}
                    </div>
                  </Popup>
                </Polygon>
              ))}

            {/* Yedek Enerji Hatları */}
            {!isComposite && backupLines.map(({ transformer, source }) => (
                <Polyline
                  key={`backup-${transformer.id}`}
                  positions={[source.pos, transformer.pos]}
                  pathOptions={{
                    color: "#34d399",
                    dashArray: "6, 8",
                    weight: 4,
                    className: "hydro-transfer-ring",
                  }}
                >
                  <Popup>
                    <div className="text-slate-900 text-xs leading-relaxed">
                      <p className="font-bold text-sm border-b pb-1 mb-1">
                        Yedek Dağıtım Hattı
                      </p>
                      <p>
                        Kritik hastane, metro drenaj pompası ve altyapı yükü yüksek
                        kottan besleniyor.
                      </p>
                      <p className="mt-1">
                        <b>Kaynak:</b> {source.name} ({source.elevation} m)
                      </p>
                      <p><b>Aktarılan yük:</b> {transformer.name}</p>
                    </div>
                  </Popup>
                </Polyline>
            ))}

            {/* Gerçekçi sokak tahliye güzergâhı */}
            {!isComposite && routeReady && (
              <>
                {/* Dış ışıma / kontur */}
                <Polyline
                  positions={routeState.positions}
                  pathOptions={{
                    color: "#064e3b",
                    weight: 8,
                    opacity: 0.65,
                  }}
                />
                <Polyline
                  positions={routeState.positions}
                  pathOptions={{
                    color: "#10b981",
                    weight: 4.5,
                    className: "hydro-route",
                  }}
                >
                  <Popup>
                    <div className="text-slate-900 text-xs leading-relaxed p-1">
                      <p className="font-bold text-sm text-emerald-800 border-b border-emerald-200 pb-1 mb-1.5 flex items-center gap-1.5">
                        <span>🚶‍♂️</span>
                        <span>Gerçekçi Sokak Tahliye Rotası</span>
                      </p>
                      <p><b>Başlangıç:</b> {route.origin.label} ({route.origin.elevation} m)</p>
                      <p><b>Hedef:</b> {route.destination.label} ({route.destination.elevation} m)</p>
                      <p><b>Yürüme Mesafesi:</b> {(routeState.distance / 1000).toFixed(2)} km</p>
                      <p><b>Tahmini Süre:</b> {formatDuration(routeState.duration)}</p>
                      <p className="mt-2 text-[11px] font-semibold text-emerald-800 bg-emerald-50 rounded p-1.5 border border-emerald-200">
                        🛡️ Vadi tabanındaki taşkın riskinden kaçınarak sokak ve köprüler üzerinden yüksek kottaki güvenli toplanma alanına yönlendirir.
                      </p>
                    </div>
                  </Popup>
                </Polyline>
              </>
            )}

            {/* Trafolar */}
            {!isComposite &&
              visibleBasins.flatMap((basin) => basin.transformers).map((tr) => {
              const risk = riskForTransformer(tr);
              const recommendedBackup = backupFeedSource(currentBasin, rainfallMm, selectedPhase);
              const isolated = isolatedIds.has(tr.id);
              const decisionThresholds = [
                waterLevelCm >= 50 ? `su seviyesi ${waterLevelCm} cm (kaide eşiği 50 cm)` : null,
                rainfallMm > 30 ? `günlük model yağışı ${rainfallMm.toFixed(1)} mm (eşik 30 mm/gün)` : null,
              ].filter(Boolean);
              const decisionRationale = isolated
                ? "Trafo izole edildi; yük yedek hatta aktarıldı."
                : risk.level === "CRITICAL"
                  ? `${decisionThresholds.join(" ve ")} nedeniyle kritik; operatör onayıyla izolasyon önerilir.`
                  : "Kritik eşik aşılmadı; uzaktan izleme sürdürülür.";
              const style = markerStyle(risk, isolated);
              return (
                <CircleMarker
                  key={`${tr.id}-${risk.level}-${isolated ? "iso" : "live"}`}
                  center={tr.pos}
                  radius={style.radius}
                  pathOptions={style.pathOptions}
                >
                  <Popup>
                    <div className="text-slate-900 text-xs leading-relaxed">
                      <p className="font-bold text-sm border-b pb-1 mb-1">{tr.name}</p>
                      <p><b>ID:</b> {tr.id}</p>
                      <p><b>Tip / Gerilim:</b> {tr.type}</p>
                      {tr.capacity && <p><b>Kapasite:</b> {tr.capacity}</p>}
                      <p><b>Rakım:</b> {tr.elevation} m (DEM)</p>
                      <div className="mt-2 rounded border border-slate-300 bg-slate-100 p-2 text-[10px] text-slate-800">
                        <p className="font-bold">Karar gerekçesi</p>
                        <ul className="mt-1 list-disc space-y-0.5 pl-4">
                          <li>Topoğrafik kırılganlık: {tr.elevation} m rakım; dereye {tr.distToStream !== undefined ? `${tr.distToStream} m` : "mesafe verisi yok"}.</li>
                          <li>Hidrolojik durum: su seviyesi {waterLevelCm} cm / kaide eşiği 50 cm; günlük model yağışı {rainfallMm.toFixed(1)} mm.</li>
                          <li>İzolasyon kararı: {decisionRationale}</li>
                          <li>Yedek kaynak: {recommendedBackup.name} ({recommendedBackup.elevation} m), {recommendedBackup.isTransformer ? "mevcut güvenli trafolar arasındaki en yüksek kotlu merkez olduğu için" : "bu havzada güvenli kotta trafo bulunmadığı için güvenli toplanma alanı yedek dayanağı seçildi."}</li>
                        </ul>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        <span className="rounded bg-slate-200 px-1.5 py-1 text-[10px] font-semibold text-slate-800">
                          BEDAŞ: {tr.bedasCode}
                        </span>
                        <span className="rounded bg-amber-100 px-1.5 py-1 text-[10px] font-semibold text-amber-900">
                          Risk bedeli: ${(tr.riskCostUsd / 1000000).toFixed(1)}M
                        </span>
                        <span className="rounded bg-cyan-100 px-1.5 py-1 text-[10px] font-semibold text-cyan-900">
                          {currentBasin.criticalPumps}
                        </span>
                      </div>
                      {tr.distToStream !== undefined && (
                        <p><b>Dereye Mesafe:</b> {tr.distToStream} m</p>
                      )}
                      <p><b>Günlük Yağış:</b> {rainfallMm.toFixed(2)} mm/gün</p>

                      {isolated ? (
                        <p className="mt-1 font-semibold" style={{ color: ISOLATED_COLOR }}>
                          DURUM: Proaktif Olarak İzole Edildi - Akım Kesildi (Can
                          Güvenliği Sağlandı)
                        </p>
                      ) : (
                        <p className="mt-1 font-semibold" style={{ color: risk.color }}>
                          Durum: {risk.label}
                        </p>
                      )}

                      <div className="mt-2 bg-slate-100 p-1.5 rounded border border-slate-300">
                        <b>Önerilen SCADA Protokolü:</b>
                        {isolated ? (
                          <p className="text-slate-700 font-bold">
                            UYGULANDI — Yük yedek hatta aktarıldı
                          </p>
                        ) : (
                          <p className="text-red-700 font-bold">{risk.scada}</p>
                        )}
                      </div>
                    </div>
                  </Popup>
                </CircleMarker>
              );
            })}

            {/* Güvenli Toplanma Noktaları */}
            {!isComposite && visibleBasins.map((basin) => (
              <CircleMarker
                key={`safe-${basin.name}`}
                center={basin.safeZone.pos}
                radius={14}
                pathOptions={{
                  fillColor: "#10b981",
                  color: "#ffffff",
                  weight: 3,
                  fillOpacity: 0.85,
                }}
              >
                <Popup>
                  <div className="text-slate-900 text-xs">
                    <p className="font-bold text-green-700 text-sm">🛡️ {basin.safeZone.name}</p>
                    <p><b>Rakım:</b> {basin.safeZone.elevation} m (Güvenli Bölge)</p>
                    <p className="text-green-800 mt-1">Önerilen Güvenli Toplanma ve Tahliye Alanı</p>
                  </div>
                </Popup>
              </CircleMarker>
            ))}
          </MapContainer>

          {/* Harita İçi Mini Bilgi Rozeti */}
          <div className="absolute bottom-4 left-4 z-[500] bg-slate-900/90 border border-slate-700 backdrop-blur p-3 rounded shadow-lg text-xs space-y-1">
            {isComposite ? (
              <>
                <div className="flex items-center space-x-2">
                  <span className="w-2.5 h-2.5 rounded-sm bg-red-500/60 border border-red-400 inline-block"></span>
                  <span>🔴 Kritik Risk Kuşağı (İlçe VIKOR &gt; 0.72 &amp; Vadi Tabanı)</span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="w-2.5 h-2.5 rounded-sm bg-orange-500/60 border border-orange-400 inline-block"></span>
                  <span>🟠 Yüksek / Orta Kırılganlık Kuşağı</span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="w-2.5 h-2.5 rounded-sm bg-green-300/60 border border-green-400 inline-block"></span>
                  <span>🟢 Güvenli Şebeke / Yüksek Kot Tahliye Alanı (Rakım &gt; 50 m)</span>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center space-x-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block"></span>
                  <span>Kritik Kaçak / Çarpılma Riski</span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-yellow-500 inline-block"></span>
                  <span>Orta Risk / Su Seviyesi Yükseliyor</span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block"></span>
                  <span>Normal & Güvenli Şebeke</span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-white inline-block"></span>
                  <span>Güvenli Toplanma Noktası</span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="w-2.5 h-2.5 bg-sky-500/50 border border-sky-400 inline-block"></span>
                  <span>Tahmini Taşkın Çanağı (DEM Modeli)</span>
                </div>
                {isolationActive && (
                  <>
                <div className="flex items-center space-x-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-500 inline-block"></span>
                  <span>Proaktif İzole Edildi (Enerjisiz)</span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="w-2.5 h-0.5 bg-yellow-500 inline-block"></span>
                  <span>Yedek Dağıtım Hattı</span>
                </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>

        {/* Sağ Panel: Karar Destek & SCADA Komuta (Afet Anında) veya Canlı Hava Donut Paneli (Normal Modda) */}
        {activeTab === "scada" && (
          weatherFloodActive ? (
            <aside className="w-80 lg:w-96 bg-slate-900 border-l border-slate-800 p-4 flex flex-col justify-between overflow-y-auto shrink-0">
              <ScadaSimulationPanel
                currentBasin={currentBasin}
                scenario={scenario}
                selectedPhase={selectedPhase}
                selectPhase={selectPhase}
                waterLevelCm={waterLevelCm}
                handleWaterLevelChange={handleWaterLevelChange}
                isolationActive={isolationActive}
                isolationTargets={isolationTargets}
                protectedAssetUsd={protectedAssetUsd}
                toggleIsolation={toggleIsolation}
                rainfallMm={rainfallMm}
                setManualRainfall={setManualRainfall}
                band={band}
                humidity={humidity}
                weatherFloodActive={weatherFloodActive}
                SLIDER_MAX_MM={SLIDER_MAX_MM}
                RAIN_MODERATE_MM={RAIN_MODERATE_MM}
                RAIN_EXTREME_MM={RAIN_EXTREME_MM}
                isManual={isManual}
                showOpsLog={showOpsLog}
                setShowOpsLog={setShowOpsLog}
                crisisEventLog={crisisEventLog}
                onOpenReport={() => {
                  setReportGeneratedAt(new Date());
                  setShowReportModal(true);
                }}
                onResetSimulation={() => handleLiveFloodTrigger(false, 0)}
                PHASE_SHORT={PHASE_SHORT}
                PHASE_LABEL={PHASE_LABEL}
                formatDay={formatDay}
              />
            </aside>
          ) : (
            <WeatherDonutPanel
              selectedBasinKey={selectedBasinKey}
              currentBasin={currentBasin}
              weatherData={liveWeatherData}
              onRefreshWeather={() => liveWeatherData.onRefresh?.()}
              onTriggerFlood={handleLiveFloodTrigger}
            />
          )
        )}

        {/* Sağ Panel: SurgeTwin AI Danışmanı (Her Zaman Aktif & Çalışır) */}
        {activeTab === "advisor" && (
          <CopilotPanel
            rainfallMm={rainfallMm}
            rainBand={rainBand}
            closestEvent={closestEvent}
            historicalMatches={historicalMatches}
            isComposite={isComposite}
            chatScrollRef={chatScrollRef}
            chatMessages={chatMessages}
            isBotTyping={isBotTyping}
            chatHints={CHAT_HINTS}
            chatInput={chatInput}
            setChatInput={setChatInput}
            sendChatMessage={sendChatMessage}
            weatherFloodActive={weatherFloodActive}
            currentBasin={currentBasin}
            isolationActive={isolationActive}
            onToggleIsolation={toggleIsolation}
          />
        )}
      </div>

      {showReportModal && (
        <div className="report-modal fixed inset-0 z-[1200] flex items-start justify-center overflow-y-auto bg-black/75 p-3 sm:p-6">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="official-report-title"
            className="report-sheet my-auto w-full max-w-[210mm] bg-white p-6 text-slate-900 shadow-2xl sm:p-10"
          >
            <header className="border-b-2 border-slate-900 pb-5 text-center">
              <p className="text-xs font-semibold uppercase">
                SURGETWIN · AFAD &amp; EPDK METODOLOJİSİ
              </p>
              <h2 id="official-report-title" className="mt-3 text-xl font-bold">
                AFAD &amp; EPDK Metodolojisine Dayalı Proaktif Karar Destek Simülasyon Raporu
              </h2>
              <p className="mt-1 text-sm">Senaryo çıktısı · Kurum onaylı resmî belge değildir</p>
            </header>

            <dl className="report-meta mt-5 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
              <div><dt className="inline font-semibold">Rapor No: </dt><dd className="inline">ST-AFAD-BEDAŞ-2026</dd></div>
              <div><dt className="inline font-semibold">Tarih / Saat: </dt><dd className="inline">{reportGeneratedAt ? new Intl.DateTimeFormat("tr-TR", { dateStyle: "long", timeStyle: "short" }).format(reportGeneratedAt) : "—"}</dd></div>
              <div><dt className="inline font-semibold">Seçili Havza: </dt><dd className="inline">{currentBasin.name}</dd></div>
              <div><dt className="inline font-semibold">AFAD Risk Kuşağı: </dt><dd className="inline">{currentBasin.afadZone}</dd></div>
              <div><dt className="inline font-semibold">Simüle edilen su seviyesi: </dt><dd className="inline">{waterLevelCm} cm</dd></div>
              <div><dt className="inline font-semibold">Operasyon durumu: </dt><dd className="inline">{isolationActive ? "Kritik trafolar izole edildi; ring aktarımı aktif" : "İzleme / manevra beklemede"}</dd></div>
            </dl>

            <div className="mt-6">
              <h3 className="text-sm font-bold">İzole Edilen Trafolar ve Korunan Varlıklar</h3>
              <table className="mt-2 w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="bg-slate-100">
                    <th className="border border-slate-400 p-2">İzole Edilen Trafo</th>
                    <th className="border border-slate-400 p-2">BEDAŞ Kodu</th>
                    <th className="border border-slate-400 p-2">Kurtarılan Varlık Bedeli</th>
                    <th className="border border-slate-400 p-2">Kesintisiz Çalışan Metro Pompaları</th>
                  </tr>
                </thead>
                <tbody>
                  {(isolationActive ? isolationTargets : []).map((transformer) => (
                    <tr key={transformer.id}>
                      <td className="border border-slate-400 p-2">{transformer.name}</td>
                      <td className="border border-slate-400 p-2">{transformer.bedasCode}</td>
                      <td className="border border-slate-400 p-2">${(transformer.riskCostUsd / 1000000).toFixed(1)}M</td>
                      <td className="border border-slate-400 p-2">{currentBasin.criticalPumps}</td>
                    </tr>
                  ))}
                  {!isolationActive && (
                    <tr>
                      <td className="border border-slate-400 p-2 text-center" colSpan={4}>
                        Henüz izole edilmiş trafo yok; rapor mevcut havza ve su seviyesi senaryosunu gösterir.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <section className="mt-6">
              <h3 className="text-sm font-bold">Uzun Vadeli Mühendislik Reçetesi</h3>
              <p className="mt-2 text-sm leading-relaxed">
                {currentBasin.transformers.filter((transformer) => transformer.isCritical)[0]?.recommendation}
              </p>
              <p className="mt-2 text-xs leading-relaxed">
                Günlük düzenleyici maliyet varsayımı: {currentBasin.transformers[0]?.epdkDailyPenalty}. Kritik yükler: {currentBasin.criticalPumps}.
              </p>
              <p className="mt-5 border-t border-slate-300 pt-3 text-[10px] text-slate-500">
                Veri kaynakları: Open-Meteo saatlik canlı meteoroloji; İBB DEM eşik referansı ve OpenStreetMap altlık haritası; trafo konumları yerel BASINS senaryo verisi. Donanım bedeli ve günlük ceza sektör ortalamalarına dayalı parametrik varsayımlardır. Bu belge AFAD/EPDK kurum onayı taşımaz; saha ölçümü ve yetkili kurum talimatı yerine geçmez.
              </p>
            </section>

            <footer className="report-actions mt-7 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="rounded bg-cyan-800 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-700"
              >
                Yazdır / PDF Olarak Kaydet
              </button>
              <button
                type="button"
                onClick={() => setShowReportModal(false)}
                className="rounded border border-slate-400 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
              >
                Kapat
              </button>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
}
