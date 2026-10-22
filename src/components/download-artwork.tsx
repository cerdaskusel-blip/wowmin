'use client';
import { useEffect, useRef, useState } from 'react';
import { Download, ExternalLink } from 'lucide-react';
import { auth } from '@/lib/firebase';
import { Modal } from './modal';
import { artworkFilename } from '@/lib/download';
import type { Submission } from '@/lib/workshop';

export function DownloadArtwork({
  sessionId,
  submission,
  compact = false,
}: {
  sessionId: string;
  submission: Submission;
  compact?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [started, setStarted] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const urls = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  useEffect(
    () => () => {
      for (const [url, timeout] of urls.current) {
        clearTimeout(timeout);
        URL.revokeObjectURL(url);
      }
      urls.current.clear();
    },
    [],
  );
  function closeFeedback() {
    setStarted(false);
    setError('');
    // The download button was disabled during fetch, so the dialog's previous
    // active element may be the document body. Restore the actual trigger.
    requestAnimationFrame(() => button.current?.focus());
  }
  const imageUrl = `/api/image?sessionId=${encodeURIComponent(sessionId)}&submissionId=${encodeURIComponent(submission.id)}`;
  const feedback = (
    <>
      <p className="fine-print" role="status">
        {started
          ? 'Muat turun dimulakan. Jika tidak tersimpan, buka gambar untuk simpan secara manual.'
          : ''}
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <a
        className="text-button"
        href={imageUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Buka Gambar karya ${submission.nickname} untuk simpan secara manual`}
      >
        <ExternalLink size={14} aria-hidden="true" /> Buka Gambar
      </a>
      <span className="sr-only">Gunakan Simpan Imej atau Save Image dalam browser anda.</span>
    </>
  );
  return (
    <div className={`artwork-download${compact ? ' compact-download' : ''}`}>
      <button
        ref={button}
        className={compact ? 'text-button' : 'button secondary small full'}
        style={
          compact
            ? {
                minHeight: 28,
                width: 28,
                padding: 4,
                background: 'var(--paper)',
                justifyContent: 'center',
              }
            : undefined
        }
        title={`Muat Turun karya ${submission.nickname}`}
        aria-label={`Muat Turun karya ${submission.nickname}`}
        disabled={busy}
        onClick={async () => {
          if (busy) return;
          setBusy(true);
          setError('');
          setStarted(false);
          try {
            const response = await fetch(`${imageUrl}&download=1`, {
              headers: { Authorization: `Bearer ${await auth.currentUser?.getIdToken()}` },
              cache: 'no-store',
            });
            if (!response.ok) {
              if ([401, 403].includes(response.status))
                throw new Error('Muat turun ditolak. Sila masuk semula ke sesi bengkel yang sah.');
              if ([404, 410].includes(response.status))
                throw new Error(
                  'Karya tidak lagi tersedia. Sesi mungkin telah ditutup atau dipadam.',
                );
              throw new Error('Muat turun gagal. Semak sambungan dan cuba lagi.');
            }
            if (response.headers.get('content-type')?.split(';')[0] !== 'image/webp')
              throw new Error('Fail gambar tidak sah. Cuba muat turun semula.');
            const blob = await response.blob();
            if (!blob.size) throw new Error('Fail gambar kosong. Cuba muat turun semula.');
            const url = URL.createObjectURL(blob);
            // Client memory only. No extra Storage object or permanent browser cache.
            urls.current.set(
              url,
              setTimeout(() => {
                URL.revokeObjectURL(url);
                urls.current.delete(url);
              }, 60000),
            );
            const link = document.createElement('a');
            link.href = url;
            link.download = artworkFilename(submission.nickname);
            document.body.appendChild(link);
            try {
              link.click();
            } finally {
              link.remove();
            }
            setStarted(true);
          } catch (cause) {
            setError(
              cause instanceof Error && /^(Muat turun|Karya|Fail gambar)/.test(cause.message)
                ? cause.message
                : 'Muat turun gagal. Semak sambungan dan cuba lagi.',
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <Download size={16} aria-hidden="true" />
        <span className={compact ? 'sr-only' : undefined}>
          {busy ? 'Memuat turun…' : 'Muat Turun'}
        </span>
      </button>
      {compact
        ? (started || error) && (
            <Modal title="Muat turun karya" onClose={closeFeedback}>
              {feedback}
              <button autoFocus className="button secondary" onClick={closeFeedback}>
                Tutup
              </button>
            </Modal>
          )
        : feedback}
    </div>
  );
}
