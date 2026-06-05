# Retrack — Spatial Scheduling & Routing Optimizer 🚀

**Retrack** adalah platform berbasis web inovatif untuk manajemen rutinitas harian dan optimasi penjadwalan spasial (*Spatial Daily Scheduling*). Aplikasi ini dirancang untuk menjawab tantangan logistik harian: bagaimana menyusun agenda harian yang tersebar di berbagai belahan kota secara efisien, serta meminimalkan sisa waktu berkendara di jalan dengan memanfaatkan perhitungan algoritma cerdas.

Dikembangkan menggunakan pendekatan antarmuka *mobile-first* yang imersif, Retrack menggabungkan mesin penemu rute jalan raya asli (OSRM Navigation) dengan mesin analisis graf penjadwalan (*Backtracking Constraint Solver*) dalam balutan desain visual premium berkinerja tinggi: **Cyber Slate & Deep Electric Blue**.

---

## 🎨 Antarmuka & Sistem Desain "Cyber Slate"

Sistem antarmuka Retrack dibangun secara presisi dengan filosofi kenyamanan visual maksimal yang peka terhadap kondisi pencahayaan sekitar pengguna (*lighting-adaptive UI*).

### 1. Palet Warna Gelap Premium (Cyber Slate Theme)
Retrack tidak menggunakan skema pembalikan warna (*auto-color inversion*) standar yang kasar, melainkan menyusun sistem lapisan permukaan gelap (*elevated surfaces*) yang anggun:
* **Base Background:** Menggunakan rona super gelap yang lembut di mata (`bg-slate-950` / `#0b0f19`) untuk mereduksi kelelahan saraf optik.
* **Surface Layout / Containers:** Kartu-kartu aktivitas, modul analisis konflik, modal pembuatan agenda, dan elemen panel menggunakan `bg-slate-900` atau `bg-slate-850` dengan pembatas super tipis yang elegan (`border border-slate-800`).
* **Sistem Navigasi Bawah (Bottom Bar):** Menggunakan `bg-slate-900/90` dengan efek translusen lensa (`backdrop-blur-md`) guna memancarkan nuansa dimensi melayang yang modern.
* **Teks Kontras Tinggi:** Judul utama menggunakan putih solid (`text-white` / `text-slate-50`), sedangkan bagian sekunder ditekankan dengan abu-abu redup (`text-slate-400`). Teks gelap pudar yang tersisa telah dibersihkan sepenuhnya dari lingkungan mode gelap.
* **Aksen Aktif (Electric Blue):** Tombol fungsional primer, aksi krusial, dan pin yang terpilih diwarnai dengan **Deep Electric Blue** (`bg-blue-600` / `#2563eb`) yang memancarkan estetika teknologi mutakhir.

### 2. Sinkronisasi Peta Pintar (Smart Basemap Adaptive Layer)
Ketika pengguna mengaktifkan mode malam, ubin dasar (*basemap tiles*) peta Leaflet yang normalnya putih benderang akan otomatis diganti menggunakan **CartoDB Dark Matter** (`https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png`). Hal ini mencegah "lonjakan kecerahan" silau saat pengguna beralih antar-tab di malam hari. Panel overlay efisiensi di atas peta juga ikut tersinkronisasi menggunakan warna permukaan gelap yang serasi.

---

## ✨ Penjelasan Detail Seluruh Fitur Aplikasi

Berikut adalah penjelasan mendalam mengenai seluruh fitur yang tersedia di dalam Retrack tanpa ada yang terlewat:

### 🗓️ 1. Manajemen Jadwal Eksklusif (Schedule Tab)

Tab **Schedule** berfungsi sebagai pusat kendali agenda harian Anda. Di sini, Anda dapat mengelola aktivitas dengan berbagai kecerdasan logika:

#### A. Dual-Mode Aktivitas (FIXED vs. FLEXIBLE)
* **Mode FIXED (Waktu Mutlak):**
  - Digunakan untuk aktivitas yang waktunya tidak dapat diganggu gugat. Pengguna wajib menentukan **Start Time** (Waktu Mulai) dan **End Time** (Waktu Selesai). Contoh: Rapat kerja jam 09:00 - 10:30, Kuliah jam 13:00 - 15:00.
  - Diatur dalam warna aksen visual biru bergaris untuk menegaskan bahwa waktu ini terkunci di dalam linimasa harian.
* **Mode FLEXIBLE (Waktu Otomatis Cerdas):**
  - Digunakan untuk aktivitas santai yang tidak kaku waktunya, di mana pengguna hanya peduli pada **Durasi Kegiatan** (dalam satuan menit) dan kisaran lokasi. Contoh: Snacking/Coffee Break selama 45 menit, atau Olahraga selama 60 menit.
  - Server Retrack akan menganalisis semua agenda FIXED Anda, menghitung estimasi durasi berkendara ke lokasi tujuan aktivitas fleksibel tersebut, dan **merekomendasikan waktu pelaksanaan terbaik** secara otomatis di sela-sela waktu luang Anda sehingga tidak terjadi bentrokan waktu harian!

#### B. Fitur Jalur Rutin "Always" (Ulangi Setiap Hari)
* **Deskripsi:** Ketika membuat agenda baru, Anda dapat mengaktifkan opsi toggle **"Ulangi Setiap Hari"** (atau ditandai sebagai aktivitas `Always`).
* **Cara Kerja:** Aktivitas bertipe *Always* ini akan dianggap menetap dan abadi. Aktivitas ini akan **otomatis diduplikasi melintasi seluruh tanggal di kalender harian Anda**. Fitur ini sangat berguna untuk rutinitas wajib yang sama setiap harinya (seperti lokasi rumah utama, atau jam masuk/pulang kantor/sekolah tetap) sehingga Anda tidak perlu repot mengetik ulang agenda tersebut setiap hari.

#### C. Deteksi Kendala Perjalanan (Collision & Delay Warning Alert)
* **Deskripsi:** Sistem perutean spasial kami secara berkala memantau efisiensi waktu perjalanan Anda.
* **Deteksi Overlap & Delay:** Apabila jarak antar aktivitas terlalu jauh sehingga estimasi waktu berkendara (driving duration) memakan waktu lebih lama dari sisa jeda waktu kosong di antara dua jadwal FIXED, sistem akan menampilkan **indikator peringatan merah kedip** di samping aktivitas tersebut.
* **Saran Preskriptif:** Sistem tidak hanya memperingatkan, tetapi juga memberikan estimasi keterlambatan secara riil (misal: *"Keterlambatan estimasi 12 Menit"*) serta memberikan saran logis untuk memundurkan/menggeser jadwal Anda ke jam tertentu demi menghindari macet atau bentrokan fisik posisi.

#### D. Pencarian Lokasi dengan Fuzzy Geolocation Auto-Complete
* **Deskripsi:** Mengetik posisi manual sangat melelahkan. Retrack menyediakan kolom **Lokasi** cerdas yang terintegrasi dengan mesin pencari geografis dunia nyata (OpenStreetMap Photon / Nominatim Geocoder).
* **Cara Kerja:** Cukup ketik nama daerah, gedung, kafe, atau kota (misal: "Stasiun Bandung" atau "Senayan City"), sistem akan otomatis memunculkan daftar rekomendasi pelengkung kata (*auto-complete suggestions*) secara instan dengan data lengkap bujur lintang kordinat aslinya.

#### E. Kalender Harian Interaktif (Interactive Date Picker Row)
* **Deskripsi:** Terletak di bagian atas Tab Schedule, menampilkan deretan hari dan tanggal dalam format strip horizontal yang sangat licin dan mudah digeser.
* **Cara Kerja:** Cukup tekan salah satu tanggal untuk melihat rute perjalanan dan urutan agenda spesifik pada hari tersebut secara dinamis.

#### F. Floating Action Button (FAB) Pembuat Agenda
* **Deskripsi:** Tombol berbentuk bundar ikon `+` yang melayang di sudut kanan bawah antarmuka pengguna untuk menambahkan agenda baru dengan cepat tanpa mengacaukan pemandangan layar utama.

---

### 🗺️ 2. Peta Navigasi Spasial Interaktif (Map Tab)

Tab **Map** menghadirkan visualisasi spasial dari seluruh jadwal harian Anda menggunakan peta interaktif berbasis Leaflet yang kaya akan interaksi:

#### A. Sinkronisasi Urutan Kronologis Otomatis (Chrono Routing Sequence)
* **Deskripsi:** Secara bawaan (*default*), semua agenda yang telah dijadwalkan akan diurutkan secara ketat sesuai kronologi waktu (*Start Time*).
* **Visualisasi:** Peta akan memunculkan penanda (*markers*) bernomor urut (1, 2, 3...) yang menunjukkan rute perjalanan Anda hari itu. Garis biru tebal OSRM akan menghubungkan titik-titik tersebut mengikuti belokan jalan raya yang sesungguhnya.

#### B. Fitur Manual Route Mode (Override Navigation)
* **Deskripsi:** Merasa urutan waktu dari sistem kalender harian kurang efisien secara jarak geografis? Anda memiliki kendali penuh melalui switch **"Manual Route Mode"**.
* **Cara Kerja:**
  1. Aktifkan switch *Manual Route*. Ini mematikan urutan otomatis berbasis waktu.
  2. Klik penanda (*marker*) pada peta secara berurutan sesuai keinginan berjalan Anda (misalnya klik penanda 3, lalu klik penanda 1, lalu klik penanda 2).
  3. Garis jalan raya (*routing engine*) akan digambar ulang secara instan mengikuti petunjuk klik manual Anda! Anda dapat mengatur ulang logika perjalanan secara taktis di peta.

#### C. Double-Click Map Shortcuts (Pembuat Pintasan Agenda Cepat)
* **Deskripsi:** Menghilangkan keharusan mengetik koordinat manual saat Anda mengeksplorasi peta Leaflet.
* **Cara Kerja:** Cukup lakukan klik ganda (*double click*) pada jalur jalan atau koordinat mana pun di peta. Modal popup penambahan agenda baru akan otomatis meluncur terbuka dengan nilai koordinat bujur dan lintang dari titik yang Anda klik sudah terisi dengan akurat di formulir pendaftaran.

#### D. HUD Statistik Ringkasan Perjalanan (Efficiency HUD HUD)
* **Deskripsi:** Sebuah panel informasi ringkas yang melayang di atas peta.
* **Cara Kerja:** Memperlihatkan akumulasi total jarak yang harus Anda lalui hari itu (dalam format kilometer) dan total waktu berkendara bersih di jalan (dalam format menit/jam). HUD ini membantu pengguna memantau efisiensi pembakaran bahan bakar kendaraan mereka secara berkala.

#### E. Fitur Focus Map Bounds (Auto Center)
* **Deskripsi:** Ketika memuat agenda baru atau berganti hari, peta akan secara halus menganalisis batas wilayah terluar (*bounds*) dari kumpulan lokasi Anda dan melakukan zoom/pan otomatis agar seluruh pin aktivitas hari itu muat di dalam layar Anda sekaligus tanpa perlu digeser manual.

---

### 👤 3. Profil Pengguna & Kontrol Global (Profile Tab)

Tab **Profile** menyajikan manajemen data personal dan tombol preferensi ekosistem aplikasi:

#### A. Informasi Profil & Kartu Statistik Ringkasan Jasa
* **Deskripsi:** Menampilkan nama pengguna, alamat email resmi, serta diagram kartu ringkasan aktivitas harian rata-rata yang terselesaikan.

#### B. Toggle Saklar Mode Gelap (Dark Mode Switch)
* **Deskripsi:** Mengizinkan konversi warna instan dari mode terang premium ke mode gelap super kontras **"Cyber Slate"** dengan transisi halus. Fitur ini juga menyatukan koordinasi skema peta *tiles* seperti yang dijelaskan di atas.

#### C. Notification Toggle (Simulasi)
* **Deskripsi:** Mengatur izin notifikasi kelola keberangkatan untuk mengingatkan kapan pengguna harus mulai memanaskan mobil atau beranjak pergi sesuai sisa waktu perjalanan yang tersaji di notifikasi sistem.

#### D. FAQ & Pusat Bantuan Interaktif
* **Deskripsi:** Dilengkapi dengan daftar pertanyaan yang sering diajukan mengenai cara mengoperasikan algoritma penjadwalan spasial Retrack secara memuaskan.

---

## 🔬 Spesifikasi Algoritma & Logika Matematika

Mesin Retrack membagi proses kalkulasi penjadwalan spasial menjadi empat tahap berurutan di sisi server (`server.ts`):

```
[Kumpulan Aktivitas]
       │
       ▼
┌────────────────────────────────────────┐
│ Tahap 1: Centroid Heuristic POI Match  │ ──► Mengisi koordinat POI otomatis menggunakan
└────────────────────────────────────────┘     jarak terdekat ke pusat masa agenda lainnya.
       │
       ▼
┌────────────────────────────────────────┐
│ Tahap 2: OSRM Driving Matrix API       │ ──► Membuat tabel durasi perkiraan berkendara (menit)
└────────────────────────────────────────┘     & jarak (meter). Fallback: Haversine rumus bola bumi.
       │
       ▼
┌────────────────────────────────────────┐
│ Tahap 3: Backtracking State-Space DFS  │ ──► Rekursi DFS mencoba kombinasi sela FLEXIBLE
└────────────────────────────────────────┘     di antara rona FIXED. Batas: 1500 calls (anti-leak).
       │
       ▼
┌────────────────────────────────────────┐
│ Tahap 4: Spatial Collision Warning     │ ──► Menghitung jeda kosong & menerbitkan rekomendasi
└────────────────────────────────────────┘     jam relokasi aktivitas jika terdeteksi tabrakan waktu.
```

### 🎯 Tahap 1: Centroid Heuristic Bipartite Matching
Jika pengguna menambahkan aktivitas FLEXIBLE menggunakan fungsionalitas POI otomatis (misal mencari kafe bermerek "Starbucks" tanpa menentukan titik spesifik), server akan:
1. Melakukan pencarian kandidat lokasi di sekitar peta.
2. Menemukan titik tengah (*Centroid*) geografis dari seluruh aktivitas penting lain yang sudah terdefinisi secara solid pada hari tersebut.
3. Memilih kandidat POI yang memiliki jumlah total jarak Euclidean terkecil terhadap pusat massa (*centroid*) tersebut untuk meminimalkan deviasi rute perjalanan.
$$\text{Centroid} = \left( \frac{1}{k}\sum_{i=1}^k \text{Lat}_i, \;\; \frac{1}{k}\sum_{i=1}^k \text{Lng}_i \right)$$

### 📊 Tahap 2: Pembentukan Matriks Jarak (Distance Matrix API)
Server membangun matriks waktu tempuh satu dimensi berukuran $N \times N$ (di mana $N$ adalah jumlah aktivitas gabungan FIXED dan FLEXIBLE):
* **Mode Online:** Membuka jembatan jaringan ke `router.project-osrm.org/table/v1/driving/` untuk menarik data durasi berkendara nyata di sistem jalan raya.
* **Mode Offline (Fallback):** Jika jaringan OSRM sibuk atau offline, server secara otomatis mundur menggunakan perhitungan **Haversine Distance Formula** untuk melacak jarak lengkung bola Bumi:
$$d = 2R \arcsin\left(\sqrt{\sin^2\left(\frac{\Delta \text{Lat}}{2}\right) + \cos(\text{Lat}_1)\cos(\text{Lat}_2)\sin^2\left(\frac{\Delta \text{Lng}}{2}\right)}\right)$$
Estimasi waktu berkendara dalam fallback offline dihitung dengan menetapkan kecepatan standar rata-rata kendaraan perkotaan sebesar $35\text{ km/jam}$ ($583\text{ meter/menit}$).

### 🧠 Tahap 3: State-Space Backtracking Search Strategy
Untuk merancang urutan hari, server menyusun jadwal FIXED secara kronologis, lalu menjalankan algoritma **Depth-First Search (DFS) Backtracking** untuk menemukan penempatan yang layak bagi aktivitas FLEXIBLE:
1. Rekursi DFS berulang kali berjalan mencoba menyisipkan elemen daftar FLEXIBLE ke sela-sela antar jadwal FIXED.
2. **Kriteria Kelayakan:** Waktu Akhir Kegiatan Pengisi + Waktu Perjalanan Menuju Kegiatan FIXED Berikutnya $\le$ Waktu Mulai FIXED tersebut.
$$\text{SlotEnd} + \text{DrivingTimeToNextFixed} \le \text{NextFixedStart}$$
3. **Batas Pengaman Resource (RAM/CPU):** Panggilan rekursif dibatasi maksimal senilai **1500 iterasi**. Apabila seluruh skema penempatan konstan mengalami kegagalan pada skenario ketat (*strict scheduling failed*), kontroler server akan secara anggun melonggarkan batas kelayakan (*Relaxed Execution Fallback Mode*) untuk tetap menghasilkan urutan spasial terbaik seadanya daripada mogok tanpa hasil.

---

## 📂 Struktur Folder Proyek

```
retrack/
├── server.ts                 # Server Express: Proxy Routing, OSRM Matrix, Backtracking Solver
├── src/
│   ├── main.tsx              # Entry Point Utama React
│   ├── App.tsx               # Client UI SPA (Tab Manager, Kalender, Map Mapbox, Form)
│   ├── types.ts              # Definisi Tipe Data TypeScript Global (Activity, Location, dll)
│   └── index.css             # Konfigurasi Tailwind CSS V4 & Custom Google Fonts
├── package.json              # Daftar Paket Dependensi & Script Compiling
└── README.md                 # Dokumentasi Teknis Aplikasi
```

---

## 🚀 Panduan Instalasi & Eksekusi Lokal

### Prasyarat
* **Node.js:** Versi 18 ke atas (direkomendasikan versi LTS terbaru).

### Langkah-langkah Menjalankan Aplikasi

1. **Unduh atau letakkan berkas proyek** ke direktori lokal Anda.
2. **Instalasi Paket Dependensi:**
   Buka terminal di direktori proyek tersebut lalu jalankan:
   ```bash
   npm install
   ```
3. **Menjalankan Server Pengembangan (Dev Mode):**
   Gunakan perintah berikut untuk menyalakan Express server berkecepatan tinggi yang mendukung render langsung TypeScript di backend:
   ```bash
   npm run dev
   ```
   Aplikasi dan dev server Anda akan otomatis terikat di alamat super responsif `http://localhost:3000`.

4. **Kompilasi ke File Produksi (Build Session):**
   Gunakan perintah ini untuk memproses file statis terkompresi yang aman dan efisien bagi server produksi:
   ```bash
   npm run build
   ```
   Perintah ini menghasilkan bundel statis teroptimasi di dalam direktori `dist/` serta mengompilasi backend server menjadi file CommonJS terpadu `dist/server.cjs`.

5. **Menjalankan Mode Produksi:**
   Untuk menyalakan aplikasi di lingkungan produksi murni secara mandiri:
   ```bash
   npm run start
   ```

---

## 🛡️ Jaminan Keandalan & Penanganan Masalah (Error Handling)

1. **Jaringan OSRM Down:** Peta dan perutean jalan raya memiliki sistem pertahanan handal. Jika server navigasi umum mengalami kendala, Retrack secara dinamis memindahkan operasi pencarian logika ke fungsi kalkulasi geometris lokal (Haversine Formula) tanpa merusak atau mereset daftar jadwal yang sedang aktif di layar pengguna.
2. **Fuzzy Search Kosong:** Jika pencarian nama wilayah tidak menemukan kandidat koordinat di API Nominatim, widget masukan akan memberikan status pemberitahuan bersih dan menuntut pengulangan teks alamat alih-alih merusak jalannya aplikasi.
3. **Antisipasi Re-render Berulang:** React Hooks pada komponen peta map (`MapTab`), masukan, dan lintasan penjadwal telah dioptimasi dengan presisi menggunakan pengikatan dependensi primitif untuk mengekang kebocoran performa (*infinite loops*).
