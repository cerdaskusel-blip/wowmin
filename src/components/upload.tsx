'use client';
import { useEffect, useRef, useState } from 'react';
import { auth } from '@/lib/firebase';
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
        `${e instanceof Error ? e.message : 'Upload failed.'} Your selected image is still here. If submissions are closed, ask your facilitator to reopen them before voting.`,
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
      <h2 id="upload-title">Your sticker · bring it back</h2>
      {own && (
        <div className={`submission-status ${own.status}`} role="status">
          <StickerImage sessionId={session.id} sub={own} />
          <b>
            {own.status === 'approved'
              ? 'You’re in the showcase!'
              : own.status === 'pending'
                ? 'Sent! Your facilitator is taking a look.'
                : 'Let’s give it another try.'}
          </b>
          <p>
            {own.status === 'rejected'
              ? own.reason
              : 'Your finished sticker is safely in the workshop.'}
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
                ? 'Workshop paused. Your image is safe here; sending resumes with the workshop.'
                : ['vote', 'results'].includes(session.stage)
                  ? 'Submissions are closed for this workshop. Your image stays on your device.'
                  : 'Submissions are closed. Ask your facilitator to extend time or reopen Submit before voting.'}
            </p>
          )}
          <label className="upload-zone">
            <b>{file ? 'Replace selected image' : 'Choose your finished sticker'}</b>
            <span>PNG, JPG or WebP · up to 5 MB</span>
            <input
              ref={input}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              aria-label="Finished sticker image"
              disabled={busy}
              onChange={(e) => {
                const next = e.target.files?.[0];
                if (!next) return;
                if (
                  next.size > 5 * 1024 * 1024 ||
                  !['image/png', 'image/jpeg', 'image/webp'].includes(next.type)
                ) {
                  setError('Choose a PNG, JPEG or WebP image under 5 MB.');
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
                alt="Preview of your selected finished sticker"
                onError={() => {
                  setError('This image cannot be previewed. Choose a valid PNG, JPEG or WebP.');
                  setFile(null);
                }}
              />
              <figcaption>{file?.name}</figcaption>
            </figure>
          )}
          <p className="fine-print">
            Only upload your finished sticker. Never upload an original selfie or a student photo.
            Selected files stay in this tab until sent; after a refresh, choose the file again.
          </p>
          <p className="notice">
            Karya yang dihantar akan dipaparkan dalam galeri dan boleh dimuat turun oleh peserta
            bengkel.
          </p>
          <button className="button dark full" disabled={!file || busy || !open}>
            {busy
              ? 'Sending your sticker…'
              : own
                ? 'Replace my submission'
                : 'Send to the showcase'}
          </button>
          {busy && (
            <p role="status">
              Sending… Keep this tab open. You can still see the result if the stage changes.
            </p>
          )}
        </form>
      )}
    </section>
  );
}
