# Wow Mean! V2 — Langkah 3

Branch `feature/wow-mean-v2`, sambungan daripada `7c2d3ec`.
Pembangunan terhad kepada prompt peserta dan penyambungan pemasa aktiviti.

## Perubahan

- Sesi templat baharu terus membuka peringkat Create. Selepas masuk melalui
  kod/pautan QR dan nama, peserta melihat tajuk, penerangan, masa berbaki dan
  1–5 kad prompt daripada salinan `session.activity`, tanpa caption/style wajib.
- Setiap **Salin Prompt** menyalin teks penuh termasuk baris baharu dan memaparkan
  **Berjaya disalin!**. Jika clipboard ditolak, **Pilih Teks** memilih keseluruhan
  teks baca sahaja untuk salinan manual. Komponen baharu menggunakan Bahasa Melayu.
- `durationMinutes` menetapkan `stageEndsAt` sedia ada semasa Mula Sesi. Tiada clock,
  scheduler atau worker tambahan. Peringkat Create/Submit berkongsi masa berbaki;
  pertukaran peringkat tidak memberikan tempoh aktiviti baharu. Pause/resume dan
  tambahan masa dikekalkan, dengan deadline sesi templat dibatasi `expiresAt`.
- Galeri/undian/keputusan terus menggunakan peringkat dan tempoh asal. Anggaran
  masa fasilitator tidak lagi menambah masa Submit sekali lagi bagi sesi templat.
  Had akses ialah maksimum empat jam dari penciptaan walaupun konfigurasi lama
  menetapkan nilai lebih tinggi; konfigurasi lebih pendek tetap dihormati.
- Sesi tanpa `activity` mengekalkan Sticker Studio dan pemasa peringkat asal.
  Upload satu imej, Sharp, moderasi, QR, undian, keputusan dan pemadaman manual
  menggunakan laluan sedia ada. Dashboard dan CRUD templat Langkah 2 tidak diubah.
- Jalur peringkat dan footer menggunakan landmark HTML yang betul tanpa perubahan
  rupa, selepas semakan aksesibiliti mengesan kandungan di luar landmark.

Fail utama: `src/components/activity-prompts.tsx`, `workshop.tsx`, `ui.tsx`,
`host-controls.tsx`, `src/lib/workshop.ts`, `lifecycle.ts`,
`src/app/api/action/route.ts`, serta ujian berkaitan.

## Pengesahan tempatan

- Typecheck, build Next.js standalone dan format: lulus.
- Ujian unit: 11 lulus, termasuk deadline aktiviti, masa pause, peringkat lama
  dan tempoh galeri/undian/keputusan yang kekal.
- Firebase security rules: 38 semakan lulus; tiada peraturan diubah.
- Integrasi API aktiviti: lulus; tempoh 25/40 minit daripada snapshot, pertukaran
  Create → Submit, pause/resume, extend dan had akses empat jam diperiksa.
- Pelayar: lima senario baharu untuk 1, 2, 3, 4 dan 5 prompt, termasuk salinan tepat
  setiap prompt berbilang baris, fallback clipboard, nama, kod/pautan QR dan upload.
- Enam regresi pelayar: Dashboard templat, bengkel lama lengkap, perlindungan
  upload/undian, pemadaman manual, retry kegagalan dan sesi tamat tempoh.
- Telefon 390×844 dan desktop 1440×1000 diperiksa, termasuk limpahan mendatar,
  semakan axe dan screenshot `test-results/activity-1-prompts.png` hingga
  `activity-5-prompts.png`. Kes lima prompt turut melalui galeri, undian dan pemenang.

Semua ujian Firebase menggunakan emulator `demo-wow`. Fixture sesi dibersihkan
melalui tindakan pemadaman manual, dan templat ujian dipadam secara berasingan.

## Baki isu / batas semakan

Tiada isu penghalang tempatan ditemui. QR dipaparkan dan peserta diuji melalui
pautan jemputan yang digunakan oleh QR serta kemasukan kod manual; kamera telefon
fizikal tidak diuji. Semakan production tidak dilakukan. Reka bentuk Strawberry
Matcha penuh kekal untuk Langkah 5. Tiada merge ke `main` atau deployment.
Berhenti selepas Langkah 3 dan tunggu kelulusan Langkah 4.
