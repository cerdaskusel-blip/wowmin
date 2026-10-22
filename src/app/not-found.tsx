import Link from 'next/link';
export default function NotFound() {
  return (
    <main className="center-message">
      <p className="eyebrow">Wow Mean!</p>
      <h1>Halaman tidak ditemui</h1>
      <p>Semak pautan anda atau kembali ke halaman utama untuk masuk ke sesi.</p>
      <Link href="/" className="button primary">
        Kembali ke Halaman Utama
      </Link>
    </main>
  );
}
