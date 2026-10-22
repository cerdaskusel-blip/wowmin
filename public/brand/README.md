# Aset rasmi Wow Mean!

- `wow-mean-official.jpeg`: fail asal yang dimuat naik oleh pemilik projek melalui
  commit `c82bb70db9d368f943919d5ff134126a07ba28f8` di `main`, nama asal
  `24DBA45A-6A39-4EBD-AFD3-33C7DD37ADDF (1).jpeg`. Disalin tanpa perubahan bait.
- `wow-mean-hero.png`: potongan piksel `(left: 0, top: 0, width: 1536, height: 660)`
  daripada fail asal; PNG lossless, tanpa resize, generasi AI atau lukisan semula.
  Mengandungi logo, cikgu, hiasan dan latar asal; tidak mengandungi butang mockup.

Halaman utama menggunakan potongan ini sebagai elemen imej, bukan seluruh mockup
sebagai latar. Tagline ialah teks HTML di atas kawasan pill asal; dua tindakan
utama ialah pautan HTML di bawah grafik. Font, kontras dan ikon tindakan menggunakan
komponen web sedia ada. Latar bawah menggunakan CSS Strawberry Matcha.

JPG asal tidak menyediakan lapisan telus/vektor. Potongan sengaja mengekalkan latar
asal supaya tepi logo, karakter dan hiasan tidak rosak akibat pengasingan automatik.
Jika logo telus berasingan diperlukan kemudian, dapatkan PNG/SVG berlapis daripada
pemilik aset; jangan jana semula identiti.

Untuk menghasilkan semula potongan menggunakan Sharp yang sudah tersedia:

```javascript
import sharp from 'sharp';
await sharp('public/brand/wow-mean-official.jpeg')
  .extract({ left: 0, top: 0, width: 1536, height: 660 })
  .png()
  .toFile('public/brand/wow-mean-hero.png');
```
