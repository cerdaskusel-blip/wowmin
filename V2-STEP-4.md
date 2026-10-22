# Wow Mean! V2 — Langkah 4

Branch `feature/wow-mean-v2`, sambungan daripada `999bc0a`.

## Siap

- Setiap kad galeri peserta/fasilitator dan pratonton mempunyai **Muat Turun**
  dengan ikon serta **Buka Gambar** untuk simpanan manual. Projektor menggunakan
  ikon padat supaya 60 karya kekal muat; maklum balas dibuka dalam dialog yang
  menyokong Escape dan memulangkan fokus kepada butang asal.
- Muat turun menggunakan `/api/image` berautoriti yang sama, ID token atau cookie
  `__session`, dan fail WebP sedia ada daripada Sharp/Storage. Tiada pautan Storage
  awam, salinan Storage, compression, kebergantungan atau servis tambahan.
- API menyediakan `Content-Disposition` untuk nama seperti
  `wow-mean-karya-cikgu-aina.webp`, dengan nama selamat daripada suntikan header/path.
  Rujukan fail mesti berada dalam awalan sesi sendiri; respons kekal
  `private, no-store`. Identiti, keahlian sesi, pemilikan fasilitator, moderasi dan
  had akses empat jam sedia ada dikekalkan.
- Ralat dan maklum balas muat turun menggunakan Bahasa Melayu. Butang boleh
  dicuba semula; **Buka Gambar** menggunakan API berautoriti untuk simpanan manual
  jika browser menyekat simpanan terus. Blob sementara dibuang daripada memori.
- Sebelum penghantaran, peserta melihat:
  “Karya yang dihantar akan dipaparkan dalam galeri dan boleh dimuat turun oleh
  peserta bengkel.” Tiada borang persetujuan tambahan.
- Logik Dashboard, templat, prompt Langkah 3, Sharp, moderasi, undian, keputusan
  dan pemadaman manual tidak ditulis semula. Templat kekal selepas sesi dipadam.

## Fail terlibat

- `src/components/download-artwork.tsx` — kawalan muat turun, ralat dan fallback.
- `src/lib/download.ts` — nama fail WebP yang selamat.
- `src/app/api/image/route.ts` — attachment/inline dan semakan awalan Storage.
- `src/components/wall.tsx` — kawalan pada kad dan pratonton galeri.
- `src/components/upload.tsx` — makluman sebelum penghantaran.
- `src/app/globals.css` — kedudukan ikon projektor sahaja.
- `tests/download.test.ts`, `tests/e2e/downloads.spec.ts` — ujian baharu.

## Pengesahan tempatan

| Semakan                                                            | Keputusan                                                                                                                                       |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`, `npm run build`, Prettier, `git diff --check` | Lulus                                                                                                                                           |
| `npm test`                                                         | 13 ujian lulus                                                                                                                                  |
| `npm run test:rules`                                               | 38 semakan keselamatan lulus; rules tidak diubah                                                                                                |
| `npm run test:activities`                                          | Pemilikan, snapshot, pemasa, sesi lama dan templat kekal: lulus                                                                                 |
| `npm run test:ephemeral`                                           | Dua sesi berturutan dengan 60 peserta, reconnect, had peserta, pemadaman, kegagalan/retry, perlumbaan penamatan dan pengesahan baki data: lulus |
| Regresi pelayar                                                    | 11 senario lulus: Dashboard, 1–5 prompt, bengkel lama lengkap, keselamatan upload/undian dan tiga aliran pemadaman                              |
| Pelayar Langkah 4                                                  | 3 senario lulus; 1 Safari/WebKit dilangkau kerana enjin tidak tersedia                                                                          |

Simulasi Langkah 4 menggunakan **60 peserta dan 60 upload sebenar melalui API**.
Peserta ke-61 ditolak dan reconnect tidak menambah slot. Peserta A memuat turun
karya B; fasilitator memuat turun karya diluluskan dan boleh mengakses karya belum
diluluskan. Akses tanpa login, luar sesi, silang sesi dan rujukan Storage silang
sesi ditolak. WebP yang dimuat turun sama bait dengan objek asal dan boleh dibuka;
bilangan objek kekal 60 selepas muat turun.

**180 permintaan undi serentak menghasilkan tepat 60 kejayaan dan 120 penolakan.**
Undi sendiri dan undi tambahan kepada karya berlainan turut ditolak. Jumlah langsung
mencapai 60/60, dengan keputusan 24–24–12 dan kedudukan 1–1–3. Ketiga-tiga pemenang
serta 60 kad galeri diperiksa pada projektor 1366×768 dan 1920×1080. Paparan telefon,
aksesibiliti axe, download Chrome, ralat, retry, cookie dan buka/simpan manual lulus.

Selepas **pemadaman manual**, dokumen sesi/subkoleksi, fail Storage dan akaun Auth
60 peserta disahkan tiada; API tidak lagi membenarkan muat turun. Templat, akaun
fasilitator dan sesi lain kekal. Fail yang telah dimuat turun masih boleh dibuka.
Fixture templat ujian dipadam secara berasingan selepas pengesahan.

Screenshot dijana dalam `test-results/`: `step4-gallery-mobile.png`,
`step4-Android-Chrome.png`, `step4-iPhone-fallback.png`,
`step4-wall-60-1366.png`, `step4-wall-60-1920.png`, serta
`step4-top3-ties-1366.png` dan `step4-top3-ties-1920.png`.

## Baki semakan

Tiada penghalang fungsi tempatan ditemui. Android dan paparan iPhone diuji melalui
emulasi Chromium; **Safari/iPhone sebenar belum disahkan**. Pemasangan WebKit
terhalang oleh HTTP 403 daripada domain muat turun dalam persekitaran ini. Ujian
Safari fizikal masih diperlukan sebelum pelepasan. Ujian emulator tidak membuktikan
prestasi rangkaian produksi. Salinan yang disimpan pada peranti peserta tidak boleh
ditarik balik melalui pemadaman sesi, seperti yang ditetapkan.

Tiada servis baharu, scheduler, worker, perubahan production, merge ke `main` atau
deployment. Berhenti selepas Langkah 4 dan tunggu kelulusan Langkah 5.
