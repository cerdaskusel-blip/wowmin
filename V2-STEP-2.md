# Wow Mean! V2 — Langkah 2

Branch: `feature/wow-mean-v2`. Skop: templat aktiviti dan Dashboard Fasilitator.
Tiada merge ke `main`, deployment atau perubahan servis production.

## Pelaksanaan

`activityTemplates/<id>` ialah koleksi Firestore kekal yang berasingan daripada
`sessions/<id>`. Setiap dokumen menyimpan `title`, `description`, `durationMinutes`,
`prompts`, `ownerId`, `createdAt`, dan `updatedAt`. Tarikh ialah milisaat Unix UTC,
mengikut corak masa aplikasi sedia ada. Backend menetapkan pemilik dan tarikh;
permintaan yang cuba menetapkannya sendiri ditolak.

Had input: tajuk 70 aksara, penerangan 2,000 aksara, tempoh integer 1–240 minit,
dan 1–5 prompt yang tidak kosong (sehingga 2,000 aksara setiap satu). Prompt dan
penerangan menyokong baris baharu. Had empat jam sepadan dengan jangka akses sesi
lalai; ia tidak menambah pemadaman automatik.

Dashboard menyediakan Cipta Aktiviti, Simpan Aktiviti, Edit Aktiviti, Padam Templat
(dengan pengesahan) dan Mula Sesi. Senarai aktiviti berada di atas borang penciptaan
sesi lama. Kegagalan memuatkan senarai menyediakan tindakan cuba semula; kegagalan
menyimpan mengekalkan draf borang. Tema dan komponen modal sedia ada digunakan.

Aliran: log masuk → pilih kad aktiviti → **Mula Sesi** → `create` dengan `templateId`
→ backend mengesahkan pemilik dan membaca templat dalam transaksi penciptaan sesi
→ menyalin semua kandungan templat ke `sessions/<id>.activity`, termasuk ID sumber,
pemilik dan masa sumber → menjana kod unik dengan mekanisme lama → membuka sesi
fasilitator yang memaparkan kod dan QR sedia ada. Tajuk sesi diambil daripada templat,
bukan tajuk gantian yang dihantar oleh klien.

Salinan sesi tidak dibaca semula daripada templat. Mengedit atau memadam templat
tidak menukar sesi yang telah dimulakan. Pemadaman data sesi hanya menyentuh data
sesi dan tidak memadam templat. Laluan `create` dengan tajuk sahaja kekal serasi.

## Kawalan akses

`/api/activities` memerlukan token Firebase yang disahkan, claim `facilitator`,
dan had kadar permintaan. GET menapis `ownerId` berdasarkan token sahaja dan
menggunakan `private, no-store`. Simpan/padam memerlukan origin yang sah; transaksi
menyemak pemilikan semula sebelum perubahan. Padam memerlukan `confirmed: true`.
Mula Sesi turut mengesahkan pemilikan dalam transaksi yang sama dengan penciptaan
sesi, supaya templat yang dipadam atau diubah serentak tidak menghasilkan rujukan
sesi separa.

Tiada akses Firestore langsung ditambah. Peraturan catch-all sedia ada terus
menolak bacaan dan penulisan templat oleh semua klien, termasuk pemilik; pemilik
mengaksesnya melalui API yang disahkan. Tiada peraturan Firestore/Storage dilemahkan,
indeks komposit baharu, dependency atau servis baharu diperlukan.

## Fail utama

| Fail                              | Peranan                                                       |
| --------------------------------- | ------------------------------------------------------------- |
| `src/lib/activities.ts`           | Model, had input dan skema permintaan                         |
| `src/app/api/activities/route.ts` | Senarai milik sendiri, simpan, edit dan padam                 |
| `src/components/activities.tsx`   | Senarai aktiviti, borang, pengesahan dan Mula Sesi            |
| `src/app/facilitator/page.tsx`    | Integrasi Dashboard; borang sesi lama dikekalkan              |
| `src/app/api/action/route.ts`     | Penciptaan sesi daripada salinan templat                      |
| `src/lib/workshop.ts`             | Medan `activity` pilihan pada sesi                            |
| `tests/activities.test.ts`        | Validasi input dan medan yang dikawal server                  |
| `tests/activities.integration.ts` | Pemilikan, CRUD, salinan sesi dan pemadaman bebas             |
| `tests/e2e/activities.spec.ts`    | Aliran Dashboard sebenar, mudah alih/desktop dan aksesibiliti |
| `tests/rules.integration.ts`      | Larangan pintasan melalui Firebase klien                      |
| `package.json`                    | Arahan `test:activities`                                      |

## Pengesahan tempatan

Semua ujian Firebase menggunakan emulator `demo-wow`; tiada worker atau scheduler
berjalan. Ujian backend menyokong penolakan akses tanpa token, peserta, fasilitator
lain, origin salah, ID tidak sah, pemilikan/tarikh palsu, pengesahan padam yang hilang,
serta input kosong atau melebihi lima prompt. Tarikh cipta kekal selepas edit;
tarikh kemas kini bertambah. Salinan sesi pertama kekal selepas edit, sesi kedua
menerima versi baharu, pemadaman sesi mengekalkan templat, dan pemadaman templat
mengekalkan sesi. Penciptaan sesi tanpa templat turut diuji.

- `npm run typecheck`: lulus.
- `npm run build`: lulus; route `/api/activities` disertakan.
- `npm test`: 9 ujian lulus.
- `npm run test:rules`: 38 semakan autorisasi lulus.
- `npm run test:activities`: lulus.
- Ujian pelayar Dashboard baharu: lulus; reload/edit, tambah/buang prompt,
  cuba semula selepas kegagalan memuatkan senarai, pembatalan pengesahan,
  kod/QR, penggunaan semula dan pemadaman bebas.
- Lima ujian regresi pelayar sedia ada: aliran bengkel lengkap, pemadaman manual,
  retry kegagalan, sesi tamat tempoh dan perlindungan upload/undian.
- Semakan axe dalam ujian Dashboard: tiada pelanggaran; lebar 390px dan 1440px
  diperiksa untuk limpahan mendatar.
- `npm run format:check` dan `git diff --check`: lulus.

Jalankan emulator, seed fasilitator dan pelayan Next sebelum ujian integrasi.

## Batas Langkah 2

Prompt dan tempoh sudah disalin ke sesi, tetapi belum menggantikan Sticker Studio
atau pemasa peringkat sedia ada. Penyambungan itu menunggu Langkah 3. Galeri,
undian, upload, Sharp, pemadaman manual, had 60 peserta, tamat akses empat jam dan
tema keseluruhan tidak diubah. Tiada isu penghalang tempatan yang dikenal pasti;
konfigurasi production dan ujian production tidak termasuk dalam langkah ini.
