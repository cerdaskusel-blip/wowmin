# Wow Mean! V2 — Langkah 5

Branch `feature/wow-mean-v2`, sambungan daripada `e60d66e`.
**Status: logo dan karakter daripada mockup rasmi telah dipasang; Langkah 5
sedia untuk semakan visual pengguna. Belum merge atau deploy.**

## Perubahan

- Tema Strawberry Matcha: blok strawberry/matcha pada latar krim, aksen kuning/oren,
  teks navy dan warna tindakan yang lebih gelap untuk kontras. Kad, dialog, borang,
  pemasa, galeri dan keputusan menggunakan gaya yang konsisten dan responsif.
- Nama paparan **Wow Mean!** dan tagline HTML **Cipta | Kongsi | Undi**. Navigasi
  **Masuk Sesi** menuju borang sebenar; **Ruang Fasilitator** menuju halaman login.
  Pautan QR terus membawa perhatian kepada borang dengan kod yang diisi seperti asal.
- Kad aktiviti tersimpan mempunyai ikon dan tindakan Mula Sesi, Edit dan Padam yang
  jelas. Kad prompt berpasangan pada desktop dan satu lajur pada telefon; Salin
  Prompt, pemasa dan upload kekal menggunakan pengendali sedia ada.
- Label, arahan, maklum balas, dialog pengesahan, ralat, halaman 404 dan fallback
  ralat diselaraskan kepada Bahasa Melayu. `lang="ms"` ditetapkan. Mesej backend
  diterjemahkan ketika dipaparkan sahaja; respons API tidak berubah. Kandungan
  templat/prompt fasilitator dan istilah/kunci teknikal dalaman tidak diterjemahkan.
- Fokus papan kekunci, nama pautan jenama dan kontras disemak. Ikon menggunakan
  Lucide sedia ada; tiada dependency visual atau servis baharu.

## Fail utama

`src/app/page.tsx`, `layout.tsx`, `facilitator/page.tsx`, `wow-mean.css`,
`error.tsx`, `not-found.tsx`; komponen `ui`, `activities`, `activity-prompts`,
`workshop`, `host-controls`, `wall`, `upload`, `cleanup`, `provider`;
`src/lib/bahasa.ts`; ujian pelayar dan `tests/e2e/visual.spec.ts`.

Tiada perubahan pada API/backend, Firebase config/rules, pengesahan, sistem undian,
Sharp, had upload, had 60 peserta, pemasa/had akses empat jam atau mekanisme
pemadaman manual. Tiada scheduler, worker atau integrasi penjanaan imej ditambah.

## Screenshot

[Lihat indeks 13 screenshot telefon/desktop dan projektor](docs/screenshots/v2-step-5/README.md).
Halaman utama, Dashboard, peserta, galeri/undian dan keputusan semuanya dirakam
melalui pelayar, termasuk borang dan kawalan sebenar. Data ialah rekaan tempatan.

## Pengesahan terdahulu (commit `66961f0`)

- Typecheck, build Next.js standalone, Prettier dan `git diff --check`: lulus.
- Ujian unit: **13 lulus**. Firebase rules: **38 semakan lulus**.
- Regresi pelayar: **20 senario unik lulus** merangkumi larian penuh dan ulangan
  berkaitan selepas penyelarasan label/aksesibiliti; **1 Safari/WebKit dilangkau**.
- Aliran templat dan sesi lama, QR/kod/nama, 1–5 prompt, salinan berbilang baris,
  upload, moderasi, undian, keputusan, pemulihan sesi dan pemadaman/retry diperiksa.
- Simulasi 60 peserta/60 karya dengan **180 permintaan undi serentak → tepat 60
  undian** lulus. Keputusan seri 24–24–12 dan projektor 1366×768/1920×1080 kekal
  betul. Simulasi penuh 50 peserta dengan tema baharu turut lulus.
- Semakan responsif 320/390/768/1440/1920 piksel, tiada limpahan mendatar pada
  paparan diperiksa, dan semakan axe pada lima halaman utama serta projektor lulus.
  Dua pautan halaman utama diuji melalui navigasi sebenar. Prompt fasilitator
  berbahasa Inggeris turut disahkan kekal tanpa terjemahan.

## Perbezaan mockup dan baki kerja

1. Fail asal kini tersedia di `public/brand/wow-mean-official.jpeg`, disalin tepat
   daripada muat naik `c82bb70` pada `main`. Branch kerja dipull (sudah terkini);
   hanya aset itu diambil, tanpa merge kod dari `main`.
2. `public/brand/wow-mean-hero.png` ialah potongan lossless 1536×660 daripada
   bahagian atas JPG, mengekalkan logo, cikgu dan hiasan asal. Tiada generasi AI,
   pengubahan identiti atau butang imej digunakan. Oleh sebab JPG tiada lapisan
   telus, latar asal dalam potongan turut dikekalkan. Lihat
   [nota aset dan cara menghasilkan semula](public/brand/README.md).
   Tagline dipaparkan sebagai HTML di atas pill asal; font/kontras mengikut tema
   aplikasi. Ikon butang menggunakan Lucide sedia ada, berbeza sedikit daripada
   ikon ilustrasi mockup. PNG/SVG asal berlapis boleh meningkatkan fleksibiliti
   pemisahan aset jika dibekalkan kemudian, tetapi tidak menghalang paparan ini.
3. Bentuk latar dibina dengan CSS responsif. Dua butang utama disusun menegak pada
   telefon bagi menjaga saiz sentuhan; desktop mengekalkan dua lajur. Warna teks
   dan tindakan tertentu digelapkan untuk kebolehbacaan.
4. Safari/iPhone fizikal belum diuji; emulator iPhone menggunakan Chromium.
   Semakan production tidak dilakukan. Screenshot dan ujian emulator tidak
   membuktikan prestasi rangkaian/peranti production.

Tiada merge ke `main`, deployment atau perubahan production. Jangan teruskan
Langkah 6 sebelum semakan visual pengguna selesai.

## Sambungan Langkah 5 — aset rasmi

Fail paparan yang diubah: `src/app/page.tsx`, `src/app/wow-mean.css`.
`Dockerfile` dan `.dockerignore` turut memasukkan `public` supaya aset disertakan
dalam imej runtime kelak; tiada deployment atau perubahan infrastruktur dibuat.
Ditambah aset/nota dalam `public/brand`, ujian `tests/e2e/landing.spec.ts` dan
screenshot utama telefon/desktop yang menggantikan screenshot placeholder.
Backend, undian, upload, pemasa dan pemadaman tidak diubah.

- JPG asal disahkan mempunyai Git blob yang sama dengan fail muat naik; piksel
  PNG disahkan sepadan tepat dengan kawasan potongan asal.
- Build standalone, typecheck, format dan `git diff --check`: lulus.
- Ujian unit: **13 lulus**.
- Ujian halaman utama: **1 lulus**, termasuk imej berjaya dimuat, tagline HTML,
  navigasi kedua-dua pautan dengan papan kekunci, kod QR melalui query string,
  tiada overflow pada 320/390/768/1440/1920 piksel dan tiada pelanggaran axe pada
  saiz tersebut. Screenshot akhir: 390×844 dan 1440×1000 (full page).
- Regresi prompt: larian pertama **4 lulus, 1 gagal** kerana ujian terus
  menavigasi selepas klik login sebelum pengesahan fasilitator selesai. Fixture
  ujian kini menunggu Dashboard sedia sebelum navigasi; logik aplikasi tidak diubah.
  Ulangan penuh: **5 lulus**, meliputi QR/kod/nama, 1–5 prompt, salinan
  berbilang baris, fallback manual, upload WebP, undian/keputusan dan cleanup
  fixture. Jumlah senario pelayar unik yang disahkan dalam sambungan: **6 lulus**.
- Safari fizikal dan build imej Docker tidak diuji dalam sambungan ini. Runtime
  standalone tempatan dengan aset `public` diuji melalui Chromium dan emulator.
