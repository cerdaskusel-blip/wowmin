# Wow Mean! V2 — Langkah 6: QA akhir dan kesediaan release

22 Oktober 2026 (UTC). Branch `feature/wow-mean-v2`, asas QA `2bc4619`.
Semua data ujian ialah rekaan di emulator `demo-wow` / `demo-wow-rules`.
**Tiada merge, deployment, penerbitan imej atau sambungan Firebase production.**

## 1. Keputusan dan skop

**CONDITIONAL GO** untuk persediaan release V2, tertakluk kepada gate production
serta ujian iPhone di bawah. Ini bukan kebenaran deploy atau bukti production
sudah sedia menerima guru. Tiada bug aplikasi penghalang release yang disahkan
setakat audit tempatan; senario muat turun yang gagal sambungan pada larian awal
telah lulus pada ulangan bersendirian tanpa perubahan aplikasi.

Reka bentuk diluluskan kekal: logo/karakter asal, Strawberry Matcha, tagline,
Masuk Sesi sebagai tindakan utama dan pautan fasilitator di footer. Tiada kod
aplikasi, rules, Firebase, Sharp, pemasa, undian atau pemadaman diubah dalam
Langkah 6. Tambahan hanya ujian, skrip QA dan dokumentasi release/rollback.

## 2. Ringkasan ujian

| Semakan                   | Keputusan                                                                                                                                                              |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`       | Lulus, termasuk ujian baharu                                                                                                                                           |
| `npm run build`           | Lulus, standalone Next.js 16                                                                                                                                           |
| `npm test`                | 13 lulus                                                                                                                                                               |
| `npm run test:activities` | Lulus: CRUD/pemilikan, metadata server, snapshot bebas, tempoh dan keserasian sesi lama                                                                                |
| `npm run test:ephemeral`  | Lulus: dua sesi 60 peserta, had/reconnect, race penamatan, kegagalan Storage/Firestore/Auth, lease/crash, writer belum selesai, retry, expiry dan verifikasi pemadaman |
| `npm run test:release`    | Lulus: tiga aktiviti × 60 peserta; butiran di bawah                                                                                                                    |
| `npm run test:rules`      | 38 semakan Firestore/Storage lulus; rules tidak dilonggarkan                                                                                                           |
| Browser E2E               | Larian penuh: 21 lulus, 1 gagal sambungan, 1 WebKit dilangkau; ulangan senario gagal lulus (53.5 s). Jumlah 22 senario unik lulus, 1 dilangkau                         |
| Responsif/aksesibiliti    | Lulus pada 320/390/768/1440/1920 px; axe dan fokus/navigasi papan kekunci; projektor 1366×768 dan 1920×1080 melalui suite                                              |
| Format dan diff           | `npm run format:check`, `git diff --check`: lulus                                                                                                                      |
| Dependency production     | `npm audit --omit=dev`: 0 advisory dilaporkan pada masa QA; bukan jaminan tiada kelemahan                                                                              |
| Docker                    | Target `web` dibina dan smoke test container lulus; tiada push registry                                                                                                |

Liputan pelayar merangkumi landing/navigation, login fasilitator emulator,
cipta/edit/simpan/padam/guna semula templat, QR/kod/nama, 1–5 prompt berbilang baris,
Copy Prompt/fallback manual, pemasa, upload/pemulihan, moderasi, galeri langsung,
projektor, undian tunggal/tolak undi sendiri, Top 3/seri, muat turun/Buka Gambar,
pemadaman/retry, templat kekal dan sesi lama tanpa `activity`. Login Google sebenar
**belum diuji**; emulator menggunakan akaun fasilitator fixture sahaja.

Ujian upload tambahan menggunakan fail sebenar: PNG/JPEG/WebP diterima;
SVG/GIF, fail rosak/kosong dan gambar >20 megapiksel ditolak; tepat 5 MiB diterima,
5 MiB + 1 bait ditolak, request >6 MiB mendapat 413. Penggantian karya pending
kekal satu rekod; karya approved tidak boleh ditimpa. Format disahkan melalui
Sharp, bukan dipercayai daripada nama fail atau MIME sahaja.

Gangguan persekitaran direkodkan: percubaan Docker awal memenuhi cakera dan
menghentikan Auth/Storage emulator; cache build dibersihkan, emulator dimulakan
semula dan simulasi tiga sesi diulang hingga lulus. DNS proxy build memerlukan
pemetaan sementara serta CA mount build sahaja. Tiada TLS bypass, perubahan
aplikasi atau konfigurasi proxy production ditambah. Kegagalan `ECONNRESET` dalam
suite penuh berlaku semasa build Docker; punca tepat belum dibuktikan dan tidak
disembunyikan dengan retry automatik pada upload.

## 3. Simulasi tiga aktiviti

Aktiviti diproses berturutan sehingga keputusan, dengan tiga templat dan tiga
kod/rekod sesi berbeza. 60 identiti peserta yang sama menyertai setiap aktiviti
menggunakan nama paparan, reconnect tanpa slot tambahan, menghantar satu karya,
dan mengundi. Peserta ke-61 ditolak dalam setiap sesi. Masa aktiviti ditetapkan
15 minit dan had akses empat jam dari penciptaan disahkan; peralihan dipercepat
untuk QA, bukannya menunggu tiga bengkel sebenar selama 45 minit.

| Aktiviti               | Prompt | Peserta / reconnect / upload | Permintaan undi → diterima / pendua ditolak | Join 60 serentak | Upload 60 serentak | Undi 180 serentak |
| ---------------------- | ------ | ---------------------------- | ------------------------------------------- | ---------------- | ------------------ | ----------------- |
| A: Sticker WhatsApp AI | 1      | 60 / 60 / 60                 | 180 → 60 / 120                              | 5.96 s           | 1.98 s             | 9.60 s            |
| B: Poster AI           | 3      | 60 / 60 / 60                 | 180 → 60 / 120                              | 10.81 s          | 2.76 s             | 9.78 s            |
| C: Infografik AI       | 5      | 60 / 60 / 60                 | 180 → 60 / 120                              | 8.08 s           | 1.83 s             | 8.67 s            |

Keputusan sengaja menghasilkan 60 seri di kedudukan pertama untuk memastikan
tiada pemenang seri hilang daripada rekod. Suite pelayar berasingan mengesahkan
susunan Top 3/seri, wall 60 karya dan halaman pemenang projektor.

- Selepas ketiga-tiga aktiviti selesai, A dipadam sementara B/C masih disimpan.
  Rekod 60 ahli/undian, jumlah keputusan, 60 objek Storage dan akses gambar B/C
  kekal. Ketiga-tiga templat masih wujud.
- Akaun Auth bersama kekal selepas pemadaman A dan B kerana masih berkaitan C.
  Selepas C dipadam, semua 60 akaun sementara, rekod identiti dan throttle peserta
  disahkan tiada. Fasilitator dan templat kekal.
- Setiap pemadaman memerlukan respons `complete` serta pemeriksaan trusted ke
  dokumen sesi/descendants, kod, Storage, identity reference, limits dan cleanup
  job. Pemadaman berulang turut diuji; bukan sekadar UI hilang.
- Template dan akaun overflow fixture akhirnya dibersihkan sebagai housekeeping
  ujian sahaja, selepas pemeliharaan templat/fasilitator disahkan.

Angka masa ialah emulator pada mesin bersama dan gambar PNG sintetik 256×256.
Ia **bukan** sasaran SLA, ujian Wi-Fi sebenar, 60 browser serentak atau bukti
kapasiti Cloud Run untuk 60 gambar AI hampir 5 MiB.

## 4. Audit keselamatan dan isu

### Kritikal / gate sebelum menerima peserta production

Tiada kelemahan kritikal aplikasi yang disahkan oleh ujian tempatan. Perkara
berikut **belum disahkan** pada projek sebenar dan mesti diselesaikan sebelum GO:

1. **Pemadaman sebenar:** IAM bucket metadata/objects dan Auth lookup/delete,
   secret tiket, Storage soft delete/versioning/retention/holds serta Firestore
   backup/PITR/export/TTL. Backend sengaja gagal tertutup jika bucket mengekalkan
   data atau `WORKSHOP_PRIVACY_REVIEWED` belum benar. Jangan tetapkan attestation
   tanpa semakan. Review log/CDN/sink yang boleh menyimpan UID, session ID atau kod
   dalam URL, walaupun aplikasi tidak melog gambar, prompt atau token.
2. **Auth dan Hosting:** Web App config sedia ada, Google/Anonymous provider,
   fasilitator custom claim, authorized domain, HTTPS/origin dan cookie HttpOnly
   `__session` perlu smoke test melalui `wowmin-workshop.web.app`. Tiada JSON key;
   Admin SDK menggunakan Cloud Run service identity melalui ADC.
3. **Kapasiti:** cadangan sedia ada 1 CPU / 1 GiB / concurrency 40 / max 3 belum
   diuji dengan 60 fail besar. Request dibuffer sehingga 6 MiB dan Sharp menerima
   sehingga 20 megapiksel; memori/native decode/CPU/latensi boleh meningkat. Sizing
   akhir atau perubahan concurrency memerlukan keputusan operator, bukan tekaan QA.
4. **iPhone sebenar dan OS image scan:** belum dilaksanakan; lakukan sebelum
   acara. `npm audit` tidak mengimbas pakej OS dalam base image.

### Sederhana / operasi dan privasi

- Manual deletion ialah satu-satunya cleanup: expiry empat jam menutup akses,
  **tidak memadam data**. Fasilitator mesti menamatkan setiap sesi dan menangani
  kegagalan sehingga verified complete. Tiada Scheduler atau worker ditambah.
- Hosting mempunyai timeout dinamik 60 s. Cleanup 60 pengguna/gambar mungkin
  melebihi masa production; job/lease kekal untuk owner menyemak dan retry selepas
  lease dua minit. Writer dengan hasil tidak diketahui memerlukan prosedur drain
  dan reconciliation manual sedia ada; masa berlalu bukan bukti write selesai.
- Auth anonymous yang tidak pernah berjaya join tidak mempunyai bukti pemilikan
  sesi dan tidak dipadam oleh tindakan fasilitator. Ini termasuk cubaan overflow.
  Review inventori/retention Auth secara pentadbiran; jangan padam akaun luar sesi.
- Had 60 ialah **UID anonymous unik**, bukan pengesahan 60 manusia. Browser yang
  sama reconnect tidak memakai slot baru; clear storage/peranti lain menghasilkan
  identiti baru. Nama paparan bukan kata laluan atau kunci pemulihan.
- Kuota signup anonymous untuk 60 guru pada IP Wi-Fi yang sama, IAM/quota sebenar,
  lokasi Firestore/Storage dan latensi ke Singapore perlu diperiksa. Emulator tidak
  mengenakan kuota sebenar.
- Firestore live listeners dan imej melalui Cloud Run menambah read, Auth lookup,
  Storage get dan egress. Jika 60 peserta membuka 60 karya, sehingga 3,600 bacaan
  imej berlaku bagi satu pusingan galeri, sebelum reload/download. `no-store`
  menjaga privasi tetapi mengurangkan cache. Budget alerts bukan hard spending cap;
  max instances juga tidak mengehadkan semua kos Firebase.
- Fail yang sudah dimuat turun, screenshot/browser history dan retained backups/log
  berada di luar penghapusan storan aktif aplikasi. Makluman galeri/download kekal.

### Kecil / had semakan

- `ECONNRESET` sekali pada klien QA ketika 60 upload; ulangan bersendirian lulus
  (53.5 s) tanpa perubahan aplikasi.
  Jangan mendakwa punca pasti atau semua rangkaian/peranti telah lulus.
- Source rasmi JPG tidak telus; crop lossless mengekalkan latar asal. Tiada isu
  identiti atau perubahan visual baharu ditemui. Aset hero sekitar 1.39 MB;
  cold load pada Wi-Fi bengkel masih memerlukan smoke test sebenar.
- Base image menggunakan tag Node 24 yang bergerak; rekod digest release dan
  vulnerability scan. Container QA menggunakan Node 24.22.1, host 24.19.0.

## 5. Docker dan audit berbanding main

Docker target `web` berjaya dibina dengan nilai SDK/bucket sintetik. Image ID
setempat `sha256:f784036943bf499f4105b27f48615a6d78a0728e3331672ab68e17e479f872c9`;
**bukan imej production, tidak dipush**. Container `--network none` menggunakan
UID 1000, 1 CPU / 1 GiB untuk smoke startup sahaja:

- Homepage 200; kedua-dua aset rasmi 200 dan byte/hash sepadan dengan repository.
  Native Sharp menghasilkan WebP dalam container.
- GET image/activities dan POST action/cleanup/upload/auth tanpa identiti ditolak
  401 dengan konfigurasi runtime yang diperlukan. Tiada sambungan cloud dibuat.
- Tiada `.env.local`, Git, tests, YAML rahsia, JSON key atau CA build dalam runtime.
  Secret manager dan operasi backend berautentikasi production tidak diuji di sini.
- SHA-256 hero: `24470cdd95a0d4c2b228d9076cc4a7fcaf959b29992c5b769185dc453ba0afcc`.
  Container ujian dihentikan/dibuang selepas smoke test.

Main yang diaudit: `c82bb70`, asas bersama `406e97c`. Sebelum tambahan QA ini,
V2 mempunyai 11 commit pembangunan; perubahan tertumpu kepada templat/API aktiviti,
snapshot sesi/tempoh, prompt peserta, API download berautorisasi, tema BM,
aset rasmi dan ujian. JPG yang ditambah di root main disalin tepat ke
`public/brand`; tiada merge main dibuat. Docker/.dockerignore menyertakan public.
Rules, bucket cleanup/Auth logic, endpoint upload Sharp, Hosting/Run target dan
manual-only architecture tidak diubah oleh V2. `lifecycle.ts` mengehadkan nilai
retention kepada maksimum empat jam. Semak semula diff terhadap main sebenar
sebelum release; jangan menganggap reference remote tempatan sentiasa terkini.

Semakan fail tracked tidak menemui nilai private key/refresh token/client secret;
`.env.example` sahaja tracked, `.env.local` dan YAML local di-ignore. Ini semakan
corak terhad, bukan pensijilan semua bentuk rahsia tiada. Nilai rahsia tidak
dipaparkan dalam laporan ini.

## 6. Pelan deployment, smoke dan rollback

Arahan PowerShell sedia ada dan tambahan V2:
[DEPLOYMENT.md](DEPLOYMENT.md#v2-release-gate-and-rollback-approval-required-do-not-run-during-qa).

1. Dapatkan kelulusan release berasingan. Sahkan gate di atas, commit/image digest,
   previous revision/traffic/Hosting/rules/secret version. Jangan tambah projek,
   ubah billing atau deploy worker/Scheduler.
2. Gunakan config Web App projek sedia ada; build semula dengan nilai public sebenar.
   Runtime: project/bucket, origin Hosting, expiry empat jam, ADC/service identity,
   pinned `CLEANUP_TICKET_SECRET` melalui Secret Manager dan attestation selepas
   privacy review. Tiada emulator variables/credential files dalam production.
3. Deploy candidate tanpa traffic dahulu selepas kelulusan. Semak startup/aset/
   denial; tagged Run URL bukan browser preview lengkap kerana origin Hosting
   dikuatkuasakan. Jangan longgarkan origin untuk ujian.
4. Gunakan rules/index/Hosting yang disemak, pindahkan traffic secara jelas, kemudian
   smoke test dua peserta sintetik: Google host → templat → kod/QR → nama/prompt/copy
   → upload/approve → gallery/projector → vote/self/duplicate denial → keputusan
   seri → download/Buka Gambar → manual delete verified → template/host kekal.
   Semak rekod/objek/Auth sebenar dan download selepas deletion ditolak.
5. Jika security/cleanup/Auth gagal, hentikan kemasukan dan pulangkan traffic kepada
   revision stabil yang direkodkan. Utamakan revision V2 yang serasi. Sebelum
   rollback ke V1, selesaikan cleanup V2 dengan release serasi; jangan hilangkan
   template routes atau tinggal sesi tanpa pengendali cleanup. Pulihkan release
   Hosting/rules hanya jika berubah dan serasi; jangan restore data peserta terpadam
   atau membuang job gagal. Ulang smoke test dan simpan status operasi tanpa PII.

### Smoke test manual wajib — iPhone Safari sebenar

**Belum dijalankan; tiada ujian fizikal ditandakan lulus.** WebKit tempatan tidak
tersedia; emulasi viewport/user agent iPhone menggunakan Chromium sahaja.

- Pada iPhone sebenar dengan Safari biasa/HTTPS dan Wi-Fi acara, buka landing,
  skrol ke pautan fasilitator, semak tap/fokus/zoom dan orientasi tanpa clipping.
  Fasilitator perlu login Google dengan claim pada browser host berasingan.
- Scan QR sebenar dengan Kamera; semak kod diisi, masukkan nama, join. Cuba kaedah
  kod manual juga. Reload dan tukar ke aplikasi AI lalu kembali; nama/sesi kekal
  dan reconnect tidak menambah slot.
- Semak 1 dan 5 prompt, baris baharu serta Salin Prompt. Jika clipboard disekat,
  gunakan Pilih Teks dan salin secara manual. Semak masa berbaki sama dengan host.
- Upload hasil PNG/JPEG/WebP melalui Photos/Files. HEIC tidak disokong; cuba fail
  tidak sah/terlalu besar dan pastikan mesej serta retry mudah difahami. Hantar
  satu karya, tunggu approval dan lihat galeri langsung.
- Undi karya lain sekali; undi sendiri/ulang ditolak. Muat turun karya peserta
  lain; jika save terus tidak berlaku, Buka Gambar dan long-press Save Image.
  Pastikan fail WebP boleh dibuka daripada Files/Photos.
- Host tamat/padam dengan pengesahan. Sesi dan download baharu mesti tidak boleh
  dicapai; host mengesahkan verified cleanup. Fail yang sudah disimpan pada iPhone
  dijangka kekal. Join aktiviti berikutnya dengan kod baru dan nama sekali lagi.

**Berhenti pada Langkah 6 dan tunggu kelulusan pengguna.**

## Fail dan ulang QA

Ditambah `tests/release.integration.ts`, `tests/e2e/upload-limits.spec.ts` dan
laporan ini; `package.json` menyediakan alias `test:release`; `DEPLOYMENT.md`
menambah gate V2 serta rollback. Tiada pembaikan kod aplikasi diperlukan.
Screenshot semakan regresi dihasilkan melalui suite visual tanpa menukar baseline
Langkah 5 yang telah diluluskan dalam commit ini.

Dengan demo emulators, fasilitator seed dan standalone server tempatan sedia:

```powershell
npm test
npm run typecheck
npm run build
npm run test:rules
npm run test:activities
npm run test:ephemeral
npm run test:release
npm run test:e2e
npm run format:check
```

Jalankan integrasi/simulasi secara berurutan dan asingkan load test daripada
build Docker supaya resource contention tidak mengelirukan keputusan. Semua ujian
baharu menolak konfigurasi yang bukan emulator demo. Docker release mesti dibina
semula daripada commit yang diluluskan dengan SDK sebenar; imej QA sintetik ini
bukan artifak untuk production.
