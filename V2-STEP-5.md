# Wow Mean! V2 — Langkah 5

Branch `feature/wow-mean-v2`, sambungan daripada `e60d66e`.
**Status: visual dan UX tersedia untuk semakan sementara; padanan logo dan karakter
mockup rasmi belum lengkap. Jangan anggap halaman utama telah diluluskan.**

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

## Pengesahan

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

1. **Penghalang utama:** lampiran dapat dilihat dalam perbualan, tetapi fail JPG
   asal tidak tersedia dalam workspace; laluan `C:/Users/...` berada pada komputer
   pengguna. Logo grafik, karakter cikgu dan hiasan sticker asal belum dapat dipotong
   daripada sumber itu. Paparan kini menggunakan teks nama biasa tanpa karakter
   pengganti. Percubaan pengasingan automatik ditolak kerana mengubah butiran identiti;
   hasil tersebut tidak dimasukkan ke aplikasi atau repository.
2. Fail JPG/PNG asal atau pautan muat turun diperlukan untuk melengkapkan padanan
   halaman utama. Selepas itu, grafik akan diasingkan sambil mengekalkan tagline,
   butang dan navigasi sebagai HTML. **Langkah 5 masih memerlukan semakan aset ini.**
3. Bentuk latar dibina dengan CSS responsif. Dua butang utama disusun menegak pada
   telefon bagi menjaga saiz sentuhan; desktop mengekalkan dua lajur. Warna teks
   dan tindakan tertentu digelapkan untuk kebolehbacaan.
4. Safari/iPhone fizikal belum diuji; emulator iPhone menggunakan Chromium.
   Semakan production tidak dilakukan. Screenshot dan ujian emulator tidak
   membuktikan prestasi rangkaian/peranti production.

Tiada merge ke `main`, deployment atau perubahan production. Jangan teruskan
Langkah 6 sebelum padanan aset rasmi dan semakan visual selesai.
