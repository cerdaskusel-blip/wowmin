'use client';
import { useEffect, useRef, useState } from 'react';
import { auth } from '@/lib/firebase';
import { mesejMelayu } from '@/lib/bahasa';
import { acceptingSubmissions, Submission, Workshop } from '@/lib/workshop';
import { ErrorMessage, StickerImage, useNow } from './ui';
import { useIdentity } from './provider';
export function UploadPanel({ session, own }: { session: Workshop; own: Submission | null }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const feedback = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error) {
      feedback.current?.focus({ preventScroll: true });
      feedback.current?.scrollIntoView({ block: 'center' });
    }
  }, [error]);
  const { offset } = useIdentity();
  const now = useNow();
  const open = acceptingSubmissions(session, now + offset);
  useEffect(() => {
    if (!file) {
      setPreview('');
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  async function upload(event: React.FormEvent) {
    event.preventDefault();
    if (!file || busy || !open) return;
    setBusy(true);
    setError('');
    try {
      const form = new FormData();
      form.set('sessionId', session.id);
      let caption = '';
      try {
        caption = JSON.parse(localStorage.getItem(`wow-draft-${session.id}`) || '{}').caption || '';
      } catch {}
      form.set('caption', caption);
      form.set('image', file);
      const token = await auth.currentUser!.getIdToken();
      const response = await fetch('/api/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setFile(null);
      if (input.current) input.current.value = '';
    } catch (e) {
      setError(
        `${e instanceof Error ? mesejMelayu(e.message) : 'Muat naik gagal.'} Gambar pilihan anda masih di sini. Jika penghantaran ditutup, minta fasilitator membukanya semula sebelum undian.`,
      );
    } finally {
      setBusy(false);
    }
  }
  // Keep this component mounted across stage changes so a pending request cannot lose its result.
  if (['lobby', 'prompt', 'results'].includes(session.stage) && !file && !error && !own && !busy)
    return null;
  return (
    <section id="upload-sticker" className="panel upload-panel" aria-labelledby="upload-title">
      <h2 id="upload-title">Hantar Karya Anda</h2>
      {own && (
        <div className={`submission-status ${own.status}`} role="status">
          <StickerImage sessionId={session.id} sub={own} />
          <b>
            {own.status === 'approved'
              ? 'Karya anda ada di galeri!'
              : own.status === 'pending'
                ? 'Berjaya dihantar! Fasilitator sedang menyemak.'
                : 'Karya dipulangkan. Jom cuba semula.'}
          </b>
          <p>
            {own.status === 'rejected'
              ? mesejMelayu(own.reason || '')
              : 'Karya anda telah disimpan dalam sesi bengkel.'}
          </p>
        </div>
      )}
      <div ref={feedback} tabIndex={-1} className="upload-error">
        <ErrorMessage message={error} />
      </div>
      {own?.status !== 'approved' && (
        <form onSubmit={upload}>
          {!open && (
            <p className="notice" role="status">
              {session.pausedRemainingMs != null
                ? 'Bengkel dijeda. Gambar pilihan anda masih di sini; penghantaran boleh disambung nanti.'
                : ['vote', 'results'].includes(session.stage)
                  ? 'Penghantaran bengkel ini telah ditutup. Gambar anda kekal pada peranti sendiri.'
                  : 'Penghantaran ditutup. Minta fasilitator menambah masa atau membuka semula penghantaran sebelum undian.'}
            </p>
          )}
          <label className="upload-zone">
            <b>{file ? 'Tukar Gambar Pilihan' : 'Pilih Gambar Karya Anda'}</b>
            <span>PNG, JPG atau WebP · sehingga 5 MB</span>
            <input
              ref={input}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              aria-label="Gambar karya siap"
              disabled={busy}
              onChange={(e) => {
                const next = e.target.files?.[0];
                if (!next) return;
                if (
                  next.size > 5 * 1024 * 1024 ||
                  !['image/png', 'image/jpeg', 'image/webp'].includes(next.type)
                ) {
                  setError('Pilih gambar PNG, JPEG atau WebP di bawah 5 MB.');
                  e.target.value = '';
                  return;
                }
                setError('');
                setFile(next);
              }}
            />
          </label>
          {preview && (
            <figure className="upload-preview">
              <img
                src={preview}
                alt="Pratonton gambar karya pilihan anda"
                onError={() => {
                  setError(
                    'Pratonton tidak dapat dibuka. Pilih gambar PNG, JPEG atau WebP yang sah.',
                  );
                  setFile(null);
                }}
              />
              <figcaption>{file?.name}</figcaption>
            </figure>
          )}
          <p className="fine-print">
            Hantar karya siap sahaja. Jangan hantar swafoto asal atau gambar murid. Gambar pilihan
            kekal dalam tab ini sehingga dihantar; jika laman dimuat semula, pilih gambar sekali
            lagi.
          </p>
          <p className="notice">
            Karya yang dihantar akan dipaparkan dalam galeri dan boleh dimuat turun oleh peserta
            bengkel.
          </p>
          <button className="button dark full" disabled={!file || busy || !open}>
            {busy ? 'Menghantar karya…' : own ? 'Gantikan Penghantaran' : 'Hantar Karya'}
          </button>
          {busy && (
            <p role="status">
              Sedang menghantar… Biarkan tab ini terbuka. Status penghantaran kekal dipaparkan
              walaupun peringkat berubah.
            </p>
          )}
        </form>
      )}
    </section>
  );
}
