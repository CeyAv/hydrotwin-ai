# SurgeTwin AI: Şebeke Direnci ve Kentsel Taşkın Dijital İkizi

İklim krizine bağlı aşırı yağış ve taşkın olaylarında kentsel elektrik dağıtım altyapısının operasyonel sürekliliğini sağlamak amacıyla geliştirilmiş mekânsal karar destek platformu.

SurgeTwin AI; İstanbul'un 17 yıllık afet hafızasını (2009–2026), topografik çanak analizlerini ve kret kotu telemetrisini bir araya getirerek dağıtım şebekesi operatörlerine proaktif manevra kabiliyeti kazandırır.

---

## Temel Özellikler ve Modüller

### 1. Makro Risk Haritası
* **Metodoloji:** İTÜ Afet Yönetimi Enstitüsü ve AKOM ortaklığıyla geliştirilen çok kriterli mekânsal risk modeli (AHP/ANP ve VIKOR) esas alınmıştır.
* **Mekânsal Kırılganlık Analizi:** İstanbul genelindeki yüksek tehlike kuşağındaki vadi tabanlarını (rakım < 15 m) ve geçirimsiz beton/asfalt yüzey baskısını harita üzerinde dinamik olarak modeller.
* **Havza Kapsamı:** Ayamama (Basın Ekspres), Cendere (Sarıyer), Haramidere (Esenyurt), Aksaray (Fatih) ve MASKO/Ziya Gökalp (Başakşehir) kronik taşkın çanakları.

### 2. Mikro SCADA Afet Simülatörü
* **Proaktif İzolasyon (FLISR):** Su seviyesi kaide kotunu (50 cm) aşıp trafo ark patlamasına yol açmadan önce riskli ünitelerin uzaktan izole edilmesi.
* **Ring Yük Aktarımı:** Tüm şehri karartmak yerine su altındaki trafoların yükünü (metro drenaj pompaları, acil altyapı) yüksek kottaki güvenli ring merkezlerine milisaniyeler içinde aktarma.
* **Canlı Afet Uyarısı:** 85 mm+ pik yağış eşiklerinde otomatik olarak tetiklenen acil durum HUD arayüzü ve su seviyesi telemetrisi.

### 3. Saha Yaya Tahliye Ağı (OSRM)
* **Sokak Bazlı Rota Hesaplama:** Kuş uçuşu düz çizgiler yerine OpenStreetMap yaya ağını kullanarak binaları ve dere yatağındaki taşkın çanağını baypas eden güvenli güzergâh.
* **Kot Tırmanış Telemetrisi:** Vadi tabanından en yakın yüksek sırt toplanma alanına tırmanış profili, net yürüyüş mesafesi ve intikal süresi hesabı.

### 4. Şebeke Direnç Analitiği ve Raporlama
* **Karar Motoru:** Ekstrem yağış miktarlarına göre ekipman patlama süresini, önlenen finansal hasarı ve meger yalıtım testi protokolünü hesaplayan yerel karar destek altyapısı.
* **Resmi Raporlama Modülü:** Kriz anında yapılan manevraları ve korunan varlıkları AFAD ve BEDAŞ standartlarında tek tıkla teknik dokümana dönüştürme.

---

## Sayısal Etki ve Kazanımlar

* **Devreye Alma Süresi:** Reaktif sistemdeki 6 haftalık (42 gün) trafo yenileme süreci, patlama önlendiği için 24 saatlik meger testiyle devreye almaya indirilir (%97.6 hızlanma).
* **Doğrudan Hasar Koruması:** Tek bir ekstrem afette havza başına ortalama 2.4M $ fiziksel donanım hasarı önlenir.
* **Yatırım Geri Dönüşü (ROI):** 1.8M $ modernizasyon yatırımı karşılığında tek bir afette 8.2M $ kümülatif hasar ve kesinti cezası önlenerek 4.55 kat getiri sağlanır.
* **Toplu Taşıma Güvenliği:** Metro drenaj pompalarının kesintisiz beslenmesiyle tünel baskınları ve yüz binlerce yolcunun mahsur kalma riski sıfırlanır.

---

## Teknoloji Yığını

* **Arayüz ve Uygulama Çekirdeği:** React 19, Vite 8, Tailwind CSS v4
* **Harita ve CBS:** Leaflet, React-Leaflet, OpenStreetMap
* **Yönlendirme Servisi:** OSRM (Open Source Routing Machine) Foot Profile
* **İkon ve UI Bileşenleri:** Lucide-React
* **Karar Motoru:** Kural tabanlı hidrolojik mühendislik modeli (Local Heuristic Engine)
* **Dağıtım ve CI/CD:** Vercel, GitHub

---

## Kurulum ve Çalıştırma

Projeyi yerel ortamınızda çalıştırmak için:

```bash
# Depoyu klonlayın
git clone https://github.com/CeyAv/surgetwin-ai.git

# Proje dizinine geçin
cd surgetwin-ai

# Bağımlılıkları yükleyin
npm install

# Geliştirme sunucusunu başlatın
npm run dev
```

Uygulama varsayılan olarak `http://localhost:5173/` adresinde çalışacaktır.

---

## Proje Bilgisi

* **Geliştirici:** Ceyda Avcıoğlu
* **Kapsam:** Climathon & COP31 İklim Uyum Vizyonu
* **Canlı Sürüm:** [SurgeTwin AI on Vercel](https://hydrotwin-ai-public-r9ow76zjl-ceydaavcioglu123-5056s-projects.vercel.app/)
