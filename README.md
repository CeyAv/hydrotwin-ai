# 🌊 SurgeTwin AI — Şebeke Direnci & Taşkın Dijital İkizi
> **İklim Adaptasyonu ve Kentsel Elektrik Dağıtım Şebekesi Direnç Platformu**

SurgeTwin AI; aşırı yağış ve kentsel sel olaylarında elektrik dağıtım altyapısının (trafo merkezleri, şalt sahaları ve kritik pompalar) operasyonel sürekliliğini sağlamak amacıyla geliştirilmiş mekânsal bir karar destek simülatörüdür. 

Platform, 17 yıllık afet hafızasını (2009–2026), topografik çanak analizlerini ve çok kriterli karar modellerini bir araya getirerek şebeke operatörlerine proaktif manevra kabiliyeti kazandırır.

---

## 📌 Temel Özellikler & Modüller

### 1. 🗺️ Makro Risk Haritası (İTÜ & AKOM Metodolojisi)
* **Akademik Referans:** Doç. Dr. Ömer Ekmekcioğlu yürütücülüğünde, İTÜ Afet Yönetimi Enstitüsü ve AKOM ortaklığıyla geliştirilen *Bulanık AHP/ANP ve VIKOR* tabanlı ilçe risk modeli esas alınmıştır.
* **Mekânsal Kırılganlık Analizi:** İstanbul yüzey alanının en kritik %10'luk yüksek tehlike kuşağını (Fatih, Gaziosmanpaşa, Bağcılar, Güngören, Beyoğlu) ve DEM tabanlı alüvyon vadi tabanlarını (< 15 m rakım) harita üzerinde dinamik olarak modeller.
* **Geçirimsiz Yüzey Baskısı:** Asfalt ve betonlaşma nedeniyle yüzey akış katsayısının fırladığı koridorlarda trafo varlıklarını koruma altına alır.

### 2. ⚡ Mikro/Taktiksel SCADA Simülatörü (Geçmiş Afet Senaryoları)
* **Tarihsel Olay Odakları:** 2009 Ayamama, 2022 Esenyurt, 2023 Başakşehir ve 2026 Ayazağa gibi geçmiş pik afet olayları üzerinden anlık simülasyon.
* **Proaktif FLISR İzolasyonu:** Su baskını başlamadan önce riskli vadi trafolarının uzaktan enerjisiz bırakılması ve kritik yüklerin (hastane, metro drenaj pompaları) sırtlardaki yüksek kot ring merkezlerine aktarılması.
* **Saha Lojistiği:** Taşkın anında kapanan arterler (E-5 / Basın Ekspres) yerine güvenli sırt güzergâhları ve sahra ekibi erişim koridorları.

### 3. 🤖 AI Grid Copilot & İklim Uyum Danışmanı
* Dış API bağımlılığı olmadan çalışan yerel karar motoru.
* Gaz İzoleli Şalt (GIS) dönüşümü, +2.0 m çelik podyum kot yükseltmeleri ve yüksek kot besleme hatları üzerine teknik şebeke mühendisliği tavsiyeleri üretir.

---

## 🛠️ Teknoloji Yığını

* **Frontend:** React 19, Vite
* **Harita & CBS:** Leaflet, OpenStreetMap, Özel Vektör Poligon Katmanları
* **Analitik & Karar Motoru:** Yerel LLM/Kural Tabanlı Mühendislik Motoru, Mekânsal Risk Matrisi
* **Stil:** Modern Siber/Karanlık Kontrol Odası UI (Dark Control Room Interface)

---

##