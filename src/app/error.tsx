'use client';
import Link from 'next/link';
export default function ErrorPage({ retry }: { error: unknown; retry: () => void }) {
  return (
    <main className="center-message">
      <p className="eyebrow">Wow Mean!</p>
      <h1>Paparan tidak dapat dimuatkan</h1>
      <p>
        Sila cuba semula. Jika sambungan masih terganggu, kembali ke halaman utama dan masuk semula
        ke sesi.
      </p>
      <button className="button primary" onClick={retry}>
        Cuba Muat Semula
      </button>
      <Link href="/" className="button secondary">
        Kembali ke Halaman Utama
      </Link>
    </main>
  );
}
