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

// --- Çok yıllı tarihsel taşkın arşivi ---
// Tek bir 2022 senaryosu yerine, her biri 5 hidrolojik faz taşıyan senaryolar.
const SCENARIOS = floodArchive.scenarios;
const PHASES = floodArchive.phases;
const COMPOSITE = floodArchive.composite;
const DEFAULT_SCENARIO_ID = "composite_average";

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
const BACKUP_FEED_COLOR = "#eab308";

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
const BASINS = {
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
 *
 * Önce Türkçe yerelde küçültülür (tr-TR: "I" → "ı", "İ" → "i"), ardından
 * ASCII'ye katlanır. İkinci adım şart: tr-TR tek başına "RISK" kelimesini
 * "rısk" yapar ve 'risk' anahtarını kaçırır — büyük harfle yazılan her
 * yabancı kökenli sözcükte aynı sorun oluşur. Katlama sonrası her iki yazım
 * da aynı forma iner ("TAŞKIN" ve "taskin" → "taskin").
 */
const normalizeQuery = (text) =>
  text
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

/**
 * Mühendislik bilgi havuzu — tamamı istemci tarafında, dış servis yok.
 *
 * Sıra bilinçli olarak SPESİFİKTEN GENELE dizilmiştir: "Ayamama'da risk
 * nedir?" sorusu hem havza hem genel-risk anahtarlarını taşır; genel bloklar
 * önce denense havza analizlerine hiç ulaşılamazdı.
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
    // \bsel\b sınırı şart: sınırsız arama "selam", "sele" gibi sözcükleri yakalar.
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

const ANSWER_FALLBACK = `HydroTwin 17 Yıllık Model Verisi: Avrupa Yakası vadi çanaklarındaki ${TOTAL_CRITICAL_UNITS} kritik ünite proaktif izolasyon ve yük aktarımı protokolüyle güvenceye alınmıştır. Belirli bir havza (Ayamama, Haramidere, Cendere), altyapı yatırımları (GIS, platform yükseltme) veya kriz lojistiği hakkında detay sorabilirsiniz.`;

/** Yerel karar motoru — dış servis, anahtar veya ağ çağrısı yoktur. */
function getBotResponse(question) {
  const q = normalizeQuery(question);
  const match = KNOWLEDGE_BASE.find((entry) => entry.test.test(q));
  return match ? match.reply : ANSWER_FALLBACK;
}

/** Yapay zekâ düşünme simülasyonu süresi. */
const BOT_THINKING_MS = 400;

const CHAT_WELCOME = `🤖 HydroTwin İklim Danışmanı: 17 yıllık İstanbul afet hafızası (2009-2026) ve Avrupa Yakası topografik DEM risk modeli devrede. Vadi tabanlarındaki ${TOTAL_CRITICAL_UNITS} kritik trafo, geleceğe dönük GIS yatırımları veya bölgesel taşkın riskleri hakkında dilediğinizi sorabilirsiniz.`;

const CHAT_HINTS = [
  "Basın Ekspres Koridoru",
  "GIS Trafo Yatırımı",
  "Avrupa Yakası E-80 Lojistik Ringi",
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
  const [selectedScenarioId, setSelectedScenarioId] = useState(DEFAULT_SCENARIO_ID);
  const [selectedPhase, setSelectedPhase] = useState("peak");
  // null ise yağış NASA ölçümünden gelir; sayı ise kullanıcı kaydırıcıyla ezmiştir.
  const [manualRainfall, setManualRainfall] = useState(null);
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

  // Yeni mesaj geldiğinde pencereyi en alta kaydır.
  useEffect(() => {
    const el = chatScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chatMessages, isBotTyping]);

  const sendChatMessage = (event) => {
    event.preventDefault();
    const question = chatInput.trim();
    if (!question || isBotTyping) return;

    setChatInput("");
    setChatMessages((previous) => [...previous, { role: "user", text: question }]);
    setIsBotTyping(true);
    window.setTimeout(() => {
      setChatMessages((previous) => [
        ...previous,
        { role: "bot", text: getBotResponse(question) },
      ]);
      setIsBotTyping(false);
    }, BOT_THINKING_MS);
  };

  const currentBasin = BASINS[selectedBasinKey];

  const scenario =
    SCENARIOS.find((s) => s.id === selectedScenarioId) ?? SCENARIOS[0];
  const currentDay =
    scenario.days.find((d) => d.phase === selectedPhase) ?? scenario.days[0];

  const archiveRainfall = currentDay.PRECTOTCORR;
  const humidity = currentDay.RH2M;
  const isManual = manualRainfall !== null;
  const rainfallMm = isManual ? manualRainfall : archiveRainfall;

  const band = rainBand(rainfallMm);
  const isFloodEvent = band.key === "EXTREME";
  const isPeakActive = selectedPhase === "peak" && !isManual;
  const isComposite = scenario.id === "composite_average";

  // Seçili senaryonun pik gününe atlar / kuru güne döner.
  const triggerStormForecast = () => {
    setSelectedPhase(isPeakActive ? "dry" : "peak");
    setManualRainfall(null);
  };

  const selectPhase = (phaseId) => {
    setSelectedPhase(phaseId);
    setManualRainfall(null); // faz seçimi manuel ezmeyi iptal eder
  };

  const selectScenario = (scenarioId) => {
    const next = SCENARIOS.find((s) => s.id === scenarioId);
    setSelectedScenarioId(scenarioId);
    setSelectedPhase("peak");
    setManualRainfall(null);
    setIsolation(
      scenarioId === "ayazaga_2026"
        ? { active: true, basinKey: "ayazaga" }
        : { active: false, basinKey: null }
    );
    // Senaryonun bağlı olduğu havzaya otomatik geçilir; harita MapController
    // üzerinden oraya uçar. Kompozitin bağlı havzası yoktur (basin: null),
    // o durumda kullanıcının seçtiği havza korunur.
    if (next?.basin) setSelectedBasinKey(next.basin);
  };

  const criticalTransformers = currentBasin.transformers.filter(
    (tr) => calculateRisk(tr, rainfallMm, selectedPhase).level === "CRITICAL"
  );

  // İzolasyon yalnızca kesilecek kritik ünite varken ve tetiklendiği havzada
  // anlamlıdır. Türetilmiş olduğu için faz/havza değişince manevra
  // kendiliğinden geri alınır — ayrı bir effect ile state sıfırlamaya gerek yok.
  const isolationActive =
    !isComposite &&
    isolation.active &&
    isolation.basinKey === selectedBasinKey &&
    criticalTransformers.length > 0;

  const toggleIsolation = () =>
    setIsolation((previous) =>
      previous.active && previous.basinKey === selectedBasinKey
        ? { active: false, basinKey: null }
        : { active: true, basinKey: selectedBasinKey }
    );
  const isolatedIds = new Set(
    isolationActive ? criticalTransformers.map((tr) => tr.id) : []
  );
  const backupSource = isolationActive
    ? backupFeedSource(currentBasin, rainfallMm, selectedPhase)
    : null;
  const backupLines = isolationActive
    ? criticalTransformers.map((transformer) => ({ transformer, source: backupSource }))
    : [];

  // --- Tahliye rotası & AI danışmanı (havzaya göre uyarlanır) ---
  const route = evacuationRoute(currentBasin);
  const historicalMatches = rankHistoricalMatches(rainfallMm);
  const closestEvent = historicalMatches[0];
  // --- Havzaya özel direnç metrikleri (hepsi currentBasin'den türer) ---
  // NOT: Bu liste statiktir (isCritical bayrağı). Yukarıdaki
  // criticalTransformers ise yağış ve hidrolojik faza bağlı olarak değişir ve
  // SCADA izolasyonunu sürer — ikisi karıştırılmamalı.
  // Tanım sırası korunur (TR-xxx-01, -02, -03) ki liste okunabilir kalsın.
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
    ? COMPOSITE_VIEW
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

  /** Ağ servisi kullanmadan iki güvenli uç arasında yaklaşık eksen üretir. */
  const calculateSafeRoute = () => {
    if (routeReady) {
      setRouteState(IDLE_ROUTE);
      return;
    }

    const basinKey = selectedBasinKey;
    const [startLat, startLon] = route.origin.pos;
    const [endLat, endLon] = route.destination.pos;
    const positions = Array.from({ length: 13 }, (_, index) => {
      const ratio = index / 12;
      return [
        startLat + (endLat - startLat) * ratio,
        startLon + (endLon - startLon) * ratio,
      ];
    });
    const radians = Math.PI / 180;
    const latitudeDelta = (endLat - startLat) * radians;
    const longitudeDelta = (endLon - startLon) * radians;
    const meanLatitude = ((startLat + endLat) / 2) * radians;
    const straightDistance =
      6371000 *
      Math.sqrt(
        latitudeDelta ** 2 +
          (Math.cos(meanLatitude) * longitudeDelta) ** 2
      );
    const estimatedDistance = straightDistance * 1.2;
    setRouteState({
      status: "ready",
      basinKey,
      positions,
      distance: estimatedDistance,
      duration: estimatedDistance / WALKING_SPEED_MS,
      source: "Yerel yaklaşık eksen (sokak rotası değildir)",
      isFootProfile: true,
      error: null,
    });
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-slate-950 text-slate-100 font-sans">
      {/* Üst Bar / Header */}
      <header className="h-16 bg-slate-900 border-b border-slate-800 px-6 flex items-center justify-between z-10">
        <div className="flex items-center space-x-3">
          <div className="w-3 h-3 rounded-full bg-cyan-400 animate-ping" />
          <h1 className="text-xl font-bold tracking-tight text-cyan-400">
            HydroTwin <span className="text-white font-light">AI</span>
          </h1>
          <span className="text-xs bg-cyan-950 text-cyan-300 border border-cyan-800 px-2 py-0.5 rounded">
            Siemens Grid Resilience
          </span>
        </div>

        {/* Havza Seçici & Aksiyon Butonu */}
        <div className="flex items-center space-x-4">
          {/* Tek entegre kontrol: vaka seçimi havzayı, haritayı, zaman
              çizelgesini ve meteoroloji değerlerini birlikte sürer. */}
          <label htmlFor="case-select" className="text-xs text-slate-400">
            İncelenen Vaka / Havza Senaryosu:
          </label>
          <select
            id="case-select"
            value={selectedScenarioId}
            onChange={(e) => selectScenario(e.target.value)}
            className="bg-slate-800 border border-slate-700 text-sm rounded px-3 py-1.5 focus:outline-none focus:border-cyan-500 min-w-[380px]"
          >
            {SCENARIOS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.icon} {item.label} ({item.peak_rainfall} mm)
              </option>
            ))}
          </select>

          {!isComposite && (
            <button
              onClick={triggerStormForecast}
              className={`text-xs font-semibold px-4 py-2 rounded transition-all shadow-md flex items-center space-x-1.5 ${
                isPeakActive
                  ? "bg-red-600 hover:bg-red-700 text-white animate-pulse"
                  : "bg-cyan-600 hover:bg-cyan-500 text-white"
              }`}
            >
              <span>
                {isPeakActive
                  ? `🚨 Pik Gün Aktif (${scenario.peak_rainfall} mm/gün)`
                  : `⚡ Pik Güne Atla (${scenario.peak_rainfall} mm/gün)`}
              </span>
            </button>
          )}
        </div>
      </header>

      {/* Aktif Senaryo Banner'ı */}
      <div className="bg-red-950/70 border-b border-red-800 px-6 py-2 flex items-center justify-between">
        <p className="text-xs font-semibold text-red-200">
          {isComposite
            ? `🚨 17 Yıllık Kompozit İstanbul Modeli (2009-2026) Aktif — Ortalama Pik: ${COMPOSITE.peak_rainfall} mm/gün`
            : `${scenario.icon} ${scenario.label} Senaryosu Aktif (Pik: ${scenario.peak_rainfall} mm/gün)`}
        </p>
        <div className="flex items-center space-x-3 text-[11px] whitespace-nowrap">
          <span className="text-red-300/80">
            Havza:{" "}
            <span className="font-semibold text-red-100">{currentBasin.valleyLabel}</span>
          </span>

          <span className="text-red-300/80">
            Faz: <span className="font-semibold text-red-100">{PHASE_LABEL[selectedPhase]}</span>
          </span>
          <span
            className={`px-2 py-0.5 rounded border ${
              scenario.measured
                ? "bg-emerald-950/60 border-emerald-700 text-emerald-300"
                : "bg-amber-950/60 border-amber-700 text-amber-300"
            }`}
          >
            {scenario.measured ? "NASA POWER ölçümü" : "Modellenmiş profil"}
          </span>
        </div>
      </div>

      {/* Sekmeler */}
      <nav className="bg-slate-900 border-b border-slate-800 px-6 flex items-end space-x-1">
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
      </nav>

      {/* Ana Çalışma Alanı (Harita + Kontrol Paneli) */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sol Panel: İklim Adaptasyonu & Kayıp Önleme Metrikleri (COP standardı) */}
        {activeTab === "advisor" && (
          <aside className="w-80 bg-slate-900 border-r border-slate-800 p-5 overflow-y-auto space-y-4">
            <div>
              <h2 className="text-base font-semibold text-slate-200">
                Şebeke Direnci &amp; Altyapı Risk Analizi
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {isComposite
                  ? `İstanbul geneli · ${TOTAL_CRITICAL_UNITS} vadi tabanı kritik ünitesi`
                  : `${currentBasin.name} · ${riskCount} riskli ünite`}
              </p>
            </div>

            {/* Metrikler aktif manevranın projeksiyonudur; izolasyon
                başlatılmadıysa bu durum açıkça belirtilir. */}
            {!isolationActive && (
              <div className="bg-slate-800/50 border border-slate-700 rounded px-3 py-2">
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Aşağıdaki değerler proaktif izolasyon manevrası uygulandığında
                  elde edilecek projeksiyondur. Manevra henüz başlatılmadı.
                </p>
              </div>
            )}

            {/* 🛡️ Şebeke Dayanıklılık İndeksi */}
            <div className="bg-slate-800/60 border border-slate-700/80 rounded-lg p-3.5 space-y-2">
              <div className="flex items-start justify-between">
                <div className="text-[11px] text-slate-400 leading-tight pr-2">
                  🛡️ {isComposite ? "Kümülatif Şebeke Direnci" : "Şebeke Dayanıklılık İndeksi"}
                  <br />
                  <span className="text-[10px] text-slate-500">(Resilience Score)</span>
                </div>
                <div className="text-2xl font-bold text-emerald-400 leading-none">
                  %{resilienceScore}
                </div>
              </div>
              <div className="h-1.5 bg-slate-700/70 rounded">
                <div
                  className="h-full rounded bg-emerald-500"
                  style={{ width: `${resilienceScore}%` }}
                />
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                {isComposite
                  ? "2009-2026 arası 6 büyük afet boyunca İstanbul genelinde proaktif korunan altyapı."
                  : `${currentBasin.name} havzasında taşkın dalgasına karşı proaktif korunan altyapı.`}
              </p>
            </div>

            {/* ⚡ Önlenen Ekipman Hasarı */}
            <div className="bg-slate-800/60 border border-slate-700/80 rounded-lg p-3.5 space-y-1.5">
              <div className="flex items-start justify-between">
                <div className="text-[11px] text-slate-400 pr-2">
                  ⚡ {isComposite ? "Kümülatif Önlenen Ekipman Riski" : "Önlenen Ekipman Hasarı"}
                </div>
                <div className="text-xl font-bold text-cyan-400 leading-none whitespace-nowrap">
                  ~{preventedDamage}M $
                </div>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                {isComposite
                  ? `${COMPOSITE_METRICS.unitSummary} genelinde kümülatif onarım ve plansız kesinti riski.`
                  : `${riskCount} ünitede (${criticalIds}) su altı kısa devre ve izolasyon yağı/SF6 sızıntı hasarı engellendi.`}
              </p>
            </div>

            {/* 🚇 Kritik Yük Koruma Durumu */}
            <div className="bg-emerald-950/30 border border-emerald-800/60 rounded-lg p-3.5 space-y-1.5">
              <div className="text-[11px] font-semibold text-emerald-300">
                🚇 {isComposite ? "Kritik Altyapı Koruma Durumu" : "Kritik Yük Koruma Durumu"}
              </div>
              <p className="text-[11px] text-slate-300 leading-relaxed">
                {isComposite
                  ? COMPOSITE_METRICS.criticalLoad
                  : currentBasin.criticalLoadNote}
              </p>
              <p className="text-[10px] text-slate-500 border-t border-emerald-800/60 pt-1.5 leading-relaxed">
                {isComposite
                  ? `${visibleBasins.length} havzada yüksek kot ring beslemesi tanımlı`
                  : `Yedek kaynak: ${backupTransformer.name} (${backupTransformer.elevation} m)`}
              </p>
            </div>

            {/* 🏗️ Uzun Vadeli Altyapı Tavsiyesi */}
            <div className="bg-slate-800/40 border border-slate-700/60 rounded-lg p-3.5 space-y-1.5">
              <div className="text-[11px] font-semibold text-cyan-300">
                {isComposite
                  ? COMPOSITE_METRICS.recommendationTitle
                  : "🏗️ Uzun Vadeli Altyapı Tavsiyesi"}
              </div>
              {isComposite ? (
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  {COMPOSITE_METRICS.recommendation}
                </p>
              ) : (
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  {/* Seçili havzanın gerçek riskli üniteleri adlandırılır. */}
                  <span className="font-semibold text-white">{criticalIds}</span>{" "}
                  üniteleri taşkın seviyesinden en az{" "}
                  <span className="font-mono text-cyan-400">+1.8 m</span> çelik
                  platform üzerine yükseltilmeli veya su geçirmez hücre
                  modifikasyonu yapılmalıdır.
                </p>
              )}
            </div>

            {isComposite ? (
              <div className="rounded-lg border border-orange-800/70 bg-orange-950/30 p-3.5 space-y-2">
                <h3 className="text-xs font-semibold text-orange-300">
                  🚛 Avrupa Yakası Kriz Lojistik Koridoru
                </h3>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  17 yıllık afet frekansı, vadi tabanı otoyollarının (E-5 ve Basın Ekspres) ilk kilitlenen noktalar olduğunu doğrulamaktadır. Sahra mobil jeneratör intikalleri için Kuzey Çevre Yolu (E-80 / TEM) güvenli lojistik omurgası olarak tanımlanmıştır.
                </p>
              </div>
            ) : (
              <div className="bg-slate-800/40 border border-slate-700/60 rounded-lg p-3.5 space-y-2">
                <h3 className="text-xs font-semibold text-cyan-300">
                  🚧 Saha Ekibi Erişim Ekseni
                </h3>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  {route.origin.label} ({route.origin.elevation} m) →{" "}
                  {route.destination.label} ({route.destination.elevation} m)
                </p>

                <button
                  onClick={calculateSafeRoute}
                  className={`w-full text-xs font-semibold px-3 py-2 rounded transition-all ${
                    routeReady
                      ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                      : "bg-cyan-600 hover:bg-cyan-500 text-white"
                  }`}
                >
                  {routeReady
                    ? "✅ Yaklaşık Erişim Ekseni Haritada (Gizle)"
                    : "🧭 Yaklaşık Erişim Ekseni Hesapla"}
                </button>

                {routeReady && (
                  <div className="space-y-1.5">
                    <div className="grid grid-cols-2 gap-2 text-center">
                      <div className="bg-slate-900/70 rounded p-1.5">
                        <div className="text-[10px] text-slate-500">Mesafe</div>
                        <div className="text-xs font-bold text-slate-100 font-mono">
                          {(routeState.distance / 1000).toFixed(2)} km
                        </div>
                      </div>
                      <div className="bg-slate-900/70 rounded p-1.5">
                        <div className="text-[10px] text-slate-500">Yürüyüş</div>
                        <div className="text-xs font-bold text-slate-100 font-mono">
                          {formatDuration(routeState.duration)}
                        </div>
                      </div>
                    </div>
                    <p className="text-[10px] text-slate-500 leading-relaxed">
                      Kaynak: {routeState.source} · {routeState.positions.length} nokta
                    </p>
                  </div>
                )}
              </div>
            )}
          </aside>
        )}

        {/* Harita */}
        <div className="flex-1 relative">
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

            {/* Su Baskını Poligonları (yağış 25 mm/gün üzerine çıktığında).
                visibleBasins kompozitte 5 havzayı, tekil vakada yalnızca
                seçili havzayı içerir. */}
            {!isComposite && isFloodEvent &&
              visibleBasins.map((basin) => (
                <Polygon
                  key={`flood-${basin.name}`}
                  positions={basin.floodPolygon}
                  pathOptions={{
                    color: "#0284c7",
                    fillColor: "#0284c7",
                    fillOpacity: 0.45,
                    weight: 2,
                    dashArray: "4",
                  }}
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

            {/* Yedek Enerji Hatları — yüksek kottan izole edilen yüklere */}
            {!isComposite && backupLines.map(({ transformer, source }) => (
                <Polyline
                  key={`backup-${transformer.id}`}
                  positions={[source.pos, transformer.pos]}
                  pathOptions={{
                    color: BACKUP_FEED_COLOR,
                    dashArray: "8, 8",
                    weight: 3,
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

            {/* Yerel tahliye ekseni — yaklaşık, sokak navigasyonu değildir. */}
            {!isComposite && routeReady && (
              <Polyline
                positions={routeState.positions}
                pathOptions={{
                  color: "#10b981",
                  weight: 5,
                  className: "hydro-route",
                }}
              >
                <Popup>
                  <div className="text-slate-900 text-xs leading-relaxed">
                    <p className="font-bold text-sm border-b pb-1 mb-1">
                      Yaklaşık Tahliye Ekseni
                    </p>
                    <p><b>Başlangıç:</b> {route.origin.label} ({route.origin.elevation} m)</p>
                    <p><b>Hedef:</b> {route.destination.label} ({route.destination.elevation} m)</p>
                    <p><b>Yürüyüş mesafesi:</b> {(routeState.distance / 1000).toFixed(2)} km</p>
                    <p><b>Tahmini süre:</b> {formatDuration(routeState.duration)}</p>
                    <p className="mt-1 text-green-800">
                      Dere yatağından uzaklaşıp yükselen yönde ilerleyin.
                    </p>
                  </div>
                </Popup>
              </Polyline>
            )}

            {/* Trafolar — kompozitte beş havzanın tamamı */}
            {!isComposite &&
              visibleBasins.flatMap((basin) => basin.transformers).map((tr) => {
              const risk = calculateRisk(tr, rainfallMm, selectedPhase);
              // İzolasyon yalnızca manevranın tetiklendiği havzada geçerlidir.
              const isolated = isolatedIds.has(tr.id);
              const style = markerStyle(risk, isolated);
              return (
                <CircleMarker
                  // Leaflet setStyle className'i güncellemez; sınıf değişince
                  // işaretçinin yeniden kurulması için anahtara durum eklenir,
                  // yoksa izole edilen ünite nabız atmaya devam eder.
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
                      {/* Dereye mesafe yalnızca etüdü yapılmış havzalarda var. */}
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

            {/* Güvenli Toplanma Noktaları — kompozitte beş havzanın tamamı */}
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

        {/* Sağ Panel: Karar Destek & SCADA Komuta */}
        {activeTab === "scada" && (
        <aside className="w-96 bg-slate-900 border-l border-slate-800 p-5 flex flex-col justify-between overflow-y-auto">
          {isComposite ? (
            <div className="space-y-4">
              <div>
                <h2 className="text-sm font-semibold text-slate-100">
                  Gelecek Seller İçin Proaktif Şebeke Yönetim Reçetesi
                </h2>
                <p className="mt-1 text-[11px] text-slate-500">
                  İTÜ-AKOM sentezi · 17 yıllık afet hafızası
                </p>
              </div>

              <section className="rounded-md border border-red-900/70 bg-red-950/20 p-3.5 space-y-2">
                <h3 className="text-xs font-semibold text-red-300">
                  📍 Kentsel Risk Dağılımı (İTÜ-AKOM Sentezi)
                </h3>
                <p className="text-[11px] leading-relaxed text-slate-300">
                  İstanbul&apos;un sadece %10&apos;u yüksek taşkın tehlikesindedir. Kırmızı ve turuncu alanlar yüksek geçirimsizlik (%85+ beton) nedeniyle risk taşırken, yeşil alanlar sırt kotlarında yer alan güvenli bölgelerdir.
                </p>
                <div className="grid grid-cols-3 gap-1.5 border-t border-red-900/50 pt-2 text-center">
                  <div>
                    <p className="text-sm font-semibold text-cyan-300">%91</p>
                    <p className="text-[9px] leading-tight text-slate-500">Kümülatif risk indeksi</p>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-orange-300">12</p>
                    <p className="text-[9px] leading-tight text-slate-500">Vadi trafosu</p>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-emerald-300">&lt;15 m</p>
                    <p className="text-[9px] leading-tight text-slate-500">Kritik rakım eşiği</p>
                  </div>
                </div>
              </section>

              <section className="rounded-md border border-orange-900/70 bg-orange-950/20 p-3.5 space-y-2">
                <h3 className="text-xs font-semibold text-orange-300">
                  ⚡ Gelecek Seller İçin Proaktif Şebeke Senaryosu
                </h3>
                <p className="text-[11px] text-slate-300">Olası pik fırtına (80+ mm) gerçekleştiğinde:</p>
                <ul className="list-disc space-y-1.5 pl-4 text-[11px] leading-relaxed text-slate-300">
                  <li>Kırmızı/turuncu çanaklardaki kritik pompalar (metro, tahliye) yeşil güvenli sırtlardaki (İTÜ Maslak, Kuyumcukent, Başakşehir) indirici merkezlere ring beslemesiyle bağlanır.</li>
                  <li>Taşkın anında su seviyesi yükselen vadi köşkleri kontrollü izole edilerek ark/infilak riski önlenir.</li>
                </ul>
              </section>

              <section className="rounded-md border border-emerald-900/70 bg-emerald-950/20 p-3.5 space-y-2">
                <h3 className="text-xs font-semibold text-emerald-300">
                  🛠️ Yapısal Dayanıklılık Çözümleri
                </h3>
                <ul className="list-disc space-y-1.5 pl-4 text-[11px] leading-relaxed text-slate-300">
                  <li>+2.0 m çelik platform yükseltmesi (vadi tabanı trafoları için)</li>
                  <li>Su geçirmez GIS (Gaz İzoleli Şalt) dönüşümü</li>
                  <li>Doğa Temelli Çözümler (NBS): Geçirimli zeminler ve yağmur hendekleri</li>
                </ul>
              </section>
            </div>
          ) : (
          <>
          <div className="space-y-5">
            <div>
              <h2 className="text-base font-semibold text-slate-200">
                Proaktif Afet Karar Destek
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                NASA POWER & Copernicus Topografik Modelleme
              </p>
            </div>

            {/* 5 Günlük Hidrolojik Faz Çizelgesi */}
            <div className="bg-slate-800/60 border border-slate-700/80 rounded-lg p-3.5 space-y-2.5">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400">Olay Zaman Çizelgesi</span>
                <span className="text-slate-500 font-mono truncate pl-2">
                  {scenario.label}
                </span>
              </div>

              <div className="grid grid-cols-5 gap-1.5">
                {scenario.days.map((day) => {
                  const active = day.phase === selectedPhase;
                  const dayColor = rainBand(day.PRECTOTCORR).color;
                  return (
                    <button
                      key={day.phase}
                      onClick={() => selectPhase(day.phase)}
                      aria-pressed={active}
                      title={`${PHASE_LABEL[day.phase]} · ${day.date}`}
                      className={`rounded px-1 py-1.5 text-center transition-all border ${
                        active
                          ? "bg-slate-700 border-cyan-500"
                          : "bg-slate-900/60 border-slate-700 hover:border-slate-500"
                      }`}
                    >
                      <div className="text-[10px] font-semibold text-slate-300 leading-tight">
                        {PHASE_SHORT[day.phase]}
                      </div>
                      <div className="text-[9px] text-slate-500 font-mono leading-tight">
                        {formatDay(day.date)}
                      </div>
                      <div
                        className="text-[10px] font-mono font-bold mt-0.5"
                        style={{ color: dayColor }}
                      >
                        {day.PRECTOTCORR.toFixed(1)}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Hidrolojik Zemin Uyarıları — faza özel */}
            {selectedPhase === "antecedent" && (
              <div className="bg-amber-950/40 border border-amber-700/70 rounded-lg p-3">
                <p className="text-xs text-amber-200 leading-relaxed">
                  ⚠️ <span className="font-semibold">Antecedent Saturation:</span> Zemin
                  suya doyuyor, pik gün yağışı doğrudan yüzey akışına geçecek.
                </p>
              </div>
            )}

            {selectedPhase === "recession" && (
              <div className="bg-amber-950/40 border border-amber-700/70 rounded-lg p-3">
                <p className="text-xs text-amber-200 leading-relaxed">
                  ⚠️ <span className="font-semibold">Trafo Hücrelerinde Nem:</span>{" "}
                  Çekilme evresinde yalıtım kontrolü (meger testi) tamamlanmadan
                  enerjiyi yeniden vermeyin.
                </p>
                <p className="text-[10px] text-amber-300/80 mt-1.5 leading-relaxed border-t border-amber-800/60 pt-1.5">
                  Yağış düşse de su almış üniteler bu fazda yeşile dönmez.
                </p>
              </div>
            )}

            {/* Meteoroloji ve Yağış Kontrolü */}
            <div className="bg-slate-800/60 border border-slate-700/80 rounded-lg p-3.5 space-y-3">
              <div className="flex justify-between items-start text-xs">
                <span className="text-slate-400 leading-tight">
                  Günlük Yağış
                  <br />
                  <span className="text-[10px] text-slate-500">
                    (mm/gün - NASA POWER Standardı)
                  </span>
                </span>
                <span className="font-mono font-bold text-cyan-400 text-sm whitespace-nowrap">
                  {rainfallMm.toFixed(2)} mm/gün
                </span>
              </div>

              <input
                type="range"
                min="0"
                max={SLIDER_MAX_MM}
                step="0.1"
                value={rainfallMm}
                onChange={(e) => setManualRainfall(Number(e.target.value))}
                className="w-full accent-cyan-400 cursor-pointer"
              />

              <div className="flex justify-between items-center text-[10px] text-slate-500 font-mono -mt-1.5">
                <span>0</span>
                <span>{RAIN_MODERATE_MM} orta</span>
                <span>{RAIN_EXTREME_MM} ekstrem</span>
                <span>{SLIDER_MAX_MM}</span>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold" style={{ color: band.color }}>
                  {band.label}
                </span>
                {isManual ? (
                  <button
                    onClick={() => setManualRainfall(null)}
                    className="text-[10px] text-cyan-400 hover:text-cyan-300 underline underline-offset-2"
                  >
                    NASA ölçümüne dön
                  </button>
                ) : (
                  <span className="text-[10px] text-slate-500">NASA ölçümü</span>
                )}
              </div>

              <div className="flex justify-between text-xs text-slate-400 pt-1 border-t border-slate-700/50">
                <span>Havadaki Bağıl Nem (RH2M):</span>
                <span className="font-mono text-slate-200 font-semibold">
                  {humidity === null ? "—" : `%${humidity.toFixed(2)}`}
                </span>
              </div>
            </div>

            {/* Siemens SCADA Aksiyon Kartı */}
            <div
              className={`rounded-lg p-4 border transition-all ${
                criticalTransformers.length === 0 || isolationActive
                  ? "bg-emerald-950/30 border-emerald-800/60"
                  : "bg-red-950/40 border-red-800/80"
              }`}
            >
              <div className="flex items-center space-x-2">
                <span className="text-lg">
                  {criticalTransformers.length === 0 ? "✅" : isolationActive ? "🛡️" : "⚠️"}
                </span>
                <h3 className="text-sm font-semibold text-slate-100">
                  {criticalTransformers.length === 0
                    ? "Şebeke Güvenli Durumda"
                    : isolationActive
                      ? `${criticalTransformers.length} Trafo İzole Edildi — Manevra Tamamlandı`
                      : `${criticalTransformers.length} Trafo İçin Acil Eylem Gerekli!`}
                </h3>
              </div>

              {criticalTransformers.length > 0 ? (
                <div className="mt-3 space-y-2 text-xs">
                  <p className={isolationActive ? "text-emerald-300" : "text-red-300"}>
                    {isolationActive
                      ? "Aşağıdaki üniteler su yükselmeden önce enerjisiz bırakıldı; yükleri yedek hatta taşındı:"
                      : "Önümüzdeki saatlerde vadi çanağındaki su seviyesi trafo tabanını aşabilir. Can güvenliği için şu adımları uygulayın:"}
                  </p>
                  <ul className="list-disc pl-4 space-y-1 text-slate-300">
                    {criticalTransformers.map((tr) => (
                      <li key={tr.id}>
                        <span className="font-bold text-white">{tr.name}:</span>{" "}
                        {isolationActive
                          ? "Devre kesici açık — akım kesildi."
                          : "Uzaktan devre kesici ile enerjiyi kesin (İzolasyon)."}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="text-xs text-slate-400 mt-2">
                  Yağış miktarı kritik su baskını eşiğinin altında. Enerji iletimi
                  kesintisiz sürdürülebilir.
                </p>
              )}
            </div>

            {/* Proaktif İzolasyon & Yük Aktarımı Tetikleyicisi */}
            <button
              onClick={toggleIsolation}
              disabled={criticalTransformers.length === 0}
              className={`w-full text-xs font-semibold px-4 py-3 rounded transition-all shadow-md text-left ${
                criticalTransformers.length === 0
                  ? "bg-slate-800/60 text-slate-500 border border-slate-700 cursor-not-allowed"
                  : isolationActive
                    ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                    : "bg-amber-500 hover:bg-amber-400 text-slate-950 animate-pulse"
              }`}
            >
              {criticalTransformers.length === 0
                ? "⚡ Siemens SCADA: İzolasyon gerektiren kritik ünite yok"
                : isolationActive
                  ? "↩️ Siemens SCADA: İzolasyonu Geri Al (Şebekeyi Normale Döndür)"
                  : "⚡ Siemens SCADA: Proaktif İzolasyon & Yük Aktarımı Başlat"}
            </button>

            {/* Karar Destek Raporu — manevra sonrası başarı metrikleri */}
            {isolationActive && (
              <div className="bg-emerald-950/30 border border-emerald-800/60 rounded-lg p-4 space-y-3">
                <h3 className="text-sm font-semibold text-emerald-300">
                  Grid Resilience — Manevra Sonuç Raporu
                </h3>

                <div className="space-y-2.5 text-xs">
                  <div className="flex space-x-2">
                    <span>🛡️</span>
                    <p className="text-slate-300">
                      <span className="font-bold text-white">
                        {criticalTransformers.length} Trafo Güvenle Devre Dışı:
                      </span>{" "}
                      Adım gerilimi ve elektrik çarpılma riski %0&apos;a indirildi.
                    </p>
                  </div>

                  <div className="flex space-x-2">
                    <span>⚡</span>
                    <p className="text-slate-300">
                      <span className="font-bold text-white">Kesintisiz Arz:</span>{" "}
                      Kritik altyapı yükü{" "}
                      <span className="text-emerald-400 font-medium">
                        {backupSource.name}
                      </span>{" "}
                      ({backupSource.elevation} m) üzerinden yedek hatta aktarıldı.
                    </p>
                  </div>

                  <div className="flex space-x-2">
                    <span>💰</span>
                    <p className="text-slate-300">
                      <span className="font-bold text-white">Varlık Koruması:</span>{" "}
                      {criticalTransformers.length} adet trafo ünitesinin su altında
                      patlaması/kısa devresi önlendi.
                    </p>
                  </div>
                </div>

                {!backupSource.isTransformer && (
                  <p className="text-[10px] text-amber-300/90 border-t border-emerald-800/60 pt-2 leading-relaxed">
                    Not: Bu havzada güvenli kotta kalan trafo bulunmuyor. Yedek besleme
                    dayanağı olarak yüksek kotlu toplanma alanı kullanıldı — saha
                    uygulamasında buraya mobil jeneratör/ring besleme konumlandırılmalı.
                  </p>
                )}
              </div>
            )}

            {/* Güvenli Tahliye ve Kaçış Yönlendirmesi */}
            <div className="bg-slate-800/40 border border-slate-700/60 rounded-lg p-3.5 space-y-2">
              <h4 className="text-xs font-semibold text-cyan-300 flex items-center space-x-1">
                <span>🛡️</span>
                <span>Saha Ekipleri & Vatandaş Yönlendirmesi</span>
              </h4>
              <p className="text-xs text-slate-300">
                Dere yatağı ve alt geçit akslarından kaçının. Önerilen toplanma noktası:
              </p>
              <div className="bg-slate-900 p-2 rounded text-xs border border-slate-800 font-medium text-emerald-400">
                📍 {currentBasin.safeZone.name} (Rakım: {currentBasin.safeZone.elevation} m)
              </div>
            </div>
          </div>

          {/* Alt Bilgi */}
          <div className="pt-4 border-t border-slate-800 text-[11px] text-slate-500 text-center">
            HydroTwin AI • Climathon 2026 İstanbul • Proaktif Afet Yönetimi
          </div>
          </>
          )}
        </aside>
        )}

        {/* Sağ Panel: HydroTwin AI Danışmanı */}
        {activeTab === "advisor" && (
          <aside className="w-96 bg-slate-900 border-l border-slate-800 p-5 flex flex-col justify-between overflow-y-auto">
            <div className="space-y-5">
              <div>
                <h2 className="text-base font-semibold text-slate-200">
                  AI Grid Copilot
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  SCADA & mühendislik karar desteği · 17 yıllık taşkın bilgi bankası
                  (2009-2026)
                </p>
              </div>

              {/* Anlık yağış ↔ geçmiş olay kıyaslaması */}
              <div className="bg-slate-800/60 border border-slate-700/80 rounded-lg p-3.5 space-y-3">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-400">Anlık Yağış</span>
                  <span className="font-mono font-bold text-cyan-400 text-sm">
                    {rainfallMm.toFixed(2)} mm/gün
                  </span>
                </div>

                <div className="bg-slate-900/70 border border-slate-700 rounded p-2.5">
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Şu anki{" "}
                    <span className="font-mono text-cyan-400">
                      {rainfallMm.toFixed(2)} mm
                    </span>{" "}
                    değeri{" "}
                    <span className="font-semibold text-white">
                      {closestEvent.date.slice(0, 4)} {closestEvent.name}
                    </span>{" "}
                    olayıyla{" "}
                    <span
                      className="font-bold"
                      style={{ color: rainBand(rainfallMm).color }}
                    >
                      %{closestEvent.match}
                    </span>{" "}
                    örtüşüyor.
                  </p>
                  <p className="text-[11px] text-slate-400 mt-1.5 leading-relaxed">
                    {closestEvent.impact}
                  </p>
                </div>

                {/* Tüm olaylar, örtüşmeye göre sıralı */}
                <div className="space-y-1.5">
                  {historicalMatches.map((event) => (
                    <div key={event.date} className="text-[11px]">
                      <div className="flex justify-between items-center">
                        <span className="text-slate-300 truncate pr-2">
                          <span className="font-mono text-slate-500">
                            {event.date.slice(0, 4)}
                          </span>{" "}
                          {event.name}
                        </span>
                        <span className="font-mono text-slate-400 whitespace-nowrap">
                          {event.rainfall} mm · %{event.match}
                        </span>
                      </div>
                      <div className="h-1 bg-slate-700/70 rounded mt-1">
                        <div
                          className="h-full rounded bg-cyan-500"
                          style={{ width: `${event.match}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Kompozit modda serbest metinli danışman; tekil afetlerde
                  mevcut hızlı soru butonları aynen korunur. */}
              {isComposite ? (
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold text-cyan-300">
                    HydroTwin İklim Danışmanı
                  </h3>

                  <div
                    ref={chatScrollRef}
                    className="max-h-[380px] overflow-y-auto space-y-2 bg-slate-950/50 border border-slate-700/80 rounded-lg p-3"
                  >
                    {chatMessages.map((message, index) => (
                      <div
                        key={index}
                        className={`flex ${
                          message.role === "user" ? "justify-end" : "justify-start"
                        }`}
                      >
                        <div
                          // whitespace-pre-line: analitik yanıtlar çok satırlı,
                          // \n karakterleri olmadan tek blok hâlinde akardı.
                          className={`max-w-[85%] rounded-lg px-3 py-2 text-[11px] leading-relaxed whitespace-pre-line ${
                            message.role === "user"
                              ? "bg-blue-900 text-blue-50 rounded-br-sm"
                              : "bg-emerald-950/60 border border-emerald-800/70 text-slate-200 rounded-bl-sm"
                          }`}
                        >
                          {message.text}
                        </div>
                      </div>
                    ))}
                    {isBotTyping && (
                      <div className="flex justify-start" aria-live="polite">
                        <div className="max-w-[85%] rounded-lg rounded-bl-sm border border-emerald-800/70 bg-emerald-950/60 px-3 py-2 text-[11px] text-emerald-200">
                          HydroTwin düşünüyor...
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Tıklanınca girdi alanını dolduran ipucu rozetleri */}
                  <div className="flex flex-wrap gap-1.5">
                    {CHAT_HINTS.map((hint) => (
                      <button
                        key={hint}
                        type="button"
                        onClick={() => setChatInput(hint)}
                        className="text-[10px] px-2 py-1 rounded-full border border-slate-600 bg-slate-800/70 text-slate-300 hover:border-cyan-500 hover:text-cyan-300 transition-all"
                      >
                        {hint}
                      </button>
                    ))}
                  </div>

                  {/* form onSubmit sayesinde Enter tuşu da gönderir */}
                  <form onSubmit={sendChatMessage} className="flex gap-2">
                    <input
                      type="text"
                      value={chatInput}
                      disabled={isBotTyping}
                      onChange={(e) => setChatInput(e.target.value)}
                      placeholder="Avrupa Yakası gelecek şebeke riskleri hakkında bir soru sorun..."
                      aria-label="HydroTwin İklim Danışmanı'na soru"
                      className="flex-1 min-w-0 bg-slate-800 border border-slate-700 rounded px-2.5 py-2 text-[11px] text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-500"
                    />
                    <button
                      type="submit"
                      disabled={!chatInput.trim() || isBotTyping}
                      className="text-[11px] font-semibold px-3 py-2 rounded bg-cyan-600 hover:bg-cyan-500 text-white disabled:bg-slate-700 disabled:text-slate-500 transition-all"
                    >
                      Gönder
                    </button>
                  </form>
                </div>
              ) : (
              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-cyan-300">
                  Hızlı Sorular
                </h3>
                {QUICK_QUESTIONS.map((item) => (
                  <button
                    key={item.id}
                    onClick={() =>
                      setActiveQuestionId((previous) =>
                        previous === item.id ? null : item.id
                      )
                    }
                    aria-pressed={activeQuestionId === item.id}
                    className={`w-full text-left text-xs px-3 py-2.5 rounded border transition-all ${
                      activeQuestionId === item.id
                        ? "bg-cyan-950/60 border-cyan-700 text-cyan-200"
                        : "bg-slate-800/50 border-slate-700 text-slate-300 hover:border-slate-500"
                    }`}
                  >
                    {item.question}
                  </button>
                ))}

                {activeQuestion && (
                  <div className="bg-slate-800/70 border border-cyan-800/60 rounded-lg p-3.5 space-y-1.5">
                    <div className="flex items-center space-x-1.5">
                      <span>🤖</span>
                      <span className="text-[11px] font-semibold text-cyan-300">
                        HydroTwin AI yanıtı
                      </span>
                    </div>
                    <p className="text-xs text-slate-200 leading-relaxed">
                      {activeQuestion.answer}
                    </p>
                  </div>
                )}
              </div>
              )}
            </div>

            {/* Alt Bilgi */}
            <div className="pt-4 border-t border-slate-800 text-[11px] text-slate-500 text-center">
              HydroTwin AI Karar Destek Çekirdeği • SCADA Kural Motoru Aktif
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
