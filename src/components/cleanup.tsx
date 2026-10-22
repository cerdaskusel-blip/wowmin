'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { auth } from '@/lib/firebase';
import { mesejMelayu } from '@/lib/bahasa';
import { Modal } from './modal';
import { ErrorMessage } from './ui';

export function clearWorkshopDraft(id: string) {
  try {
    localStorage.removeItem(`wow-draft-${id}`);
    for (const key of ['wow-last-session', 'wow-host-session'])
      if (localStorage.getItem(key) === id) localStorage.removeItem(key);
  } catch {}
}
async function cleanup(id: string, action: string, confirmed = false) {
  const key = `wow-cleanup-${id}`;
  const response = await fetch('/api/cleanup', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${await auth.currentUser?.getIdToken()}`,
    },
    body: JSON.stringify({
      sessionId: id,
      action,
      confirmed: confirmed || undefined,
      ticket: sessionStorage.getItem(key) || undefined,
    }),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error || 'Could not check deletion. Retry when connected.');
  if (result.ticket) sessionStorage.setItem(key, result.ticket);
  return result as { state: string; error?: string; title?: string };
}
export function EndSession({ id, title }: { id: string; title: string }) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <>
      <button className="button secondary small" onClick={() => setConfirm(true)}>
        Padam Semua Data Bengkel
      </button>
      {confirm && (
        <Modal
          title="Padam Semua Data Bengkel?"
          onClose={() => {
            if (!busy) setConfirm(false);
          }}
        >
          <p>
            <strong>{title}</strong> akan ditutup serta-merta. Semua akaun peserta sementara, karya,
            undian dan keputusan sesi ini akan dipadam secara kekal. Tindakan ini tidak boleh
            dibatalkan. Templat aktiviti dan akaun fasilitator dikekalkan.
          </p>
          <p>Tunggu sehingga Pemadaman Selesai disahkan sebelum menutup paparan fasilitator.</p>
          <ErrorMessage message={error} />
          <div className="two-buttons">
            <button
              autoFocus
              className="button secondary"
              disabled={busy}
              onClick={() => setConfirm(false)}
            >
              Batal, Kekalkan Bengkel
            </button>
            <button
              className="button primary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError('');
                try {
                  await cleanup(id, 'authorize');
                  await cleanup(id, 'end', true);
                  clearWorkshopDraft(id);
                  window.location.assign(`/session/${id}`);
                } catch (e) {
                  setError((e as Error).message);
                  setBusy(false);
                }
              }}
            >
              {busy ? 'Menutup sesi…' : 'Ya, padam semua data'}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
export function CleanupStatus({ id }: { id: string }) {
  const [state, setState] = useState('checking');
  const [title, setTitle] = useState('Bengkel');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    clearWorkshopDraft(id);
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const result = await cleanup(id, 'status');
        if (stopped) return;
        setState(result.state);
        if (result.title) setTitle(result.title);
        setError(result.error || '');
        if (result.state === 'complete') {
          sessionStorage.setItem(`wow-cleanup-complete-${id}`, 'true');
          return;
        }
      } catch (e) {
        if (!stopped) {
          setState('unknown');
          setError((e as Error).message);
        }
      }
      if (!stopped) timer = setTimeout(poll, 3000);
    }
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
      if (sessionStorage.getItem(`wow-cleanup-complete-${id}`)) {
        sessionStorage.removeItem(`wow-cleanup-${id}`);
        sessionStorage.removeItem(`wow-cleanup-complete-${id}`);
      }
    };
  }, [id]);
  return (
    <main className="center-message">
      <h1 aria-live="polite">
        {state === 'complete'
          ? 'Pemadaman Selesai'
          : state === 'awaiting-confirmation'
            ? 'Pengesahan Pemadaman Diperlukan'
            : state === 'failed'
              ? 'Pemadaman Gagal'
              : 'Bengkel Ditutup'}
      </h1>
      <p>
        {state === 'complete'
          ? 'Semua data sesi bengkel dalam platform ini telah disahkan dipadam.'
          : state === 'awaiting-confirmation'
            ? 'Sesi bengkel telah tamat tempoh. Data kekal sehingga anda mengesahkan pemadaman di bawah.'
            : 'Kemasukan, penghantaran dan undian telah ditutup. Pemadaman belum disahkan. Tiada pemadaman automatik; cuba semula jika perlu.'}
      </p>
      <ErrorMessage message={error} />
      {state === 'awaiting-confirmation' && <EndSession id={id} title={title} />}
      {state !== 'complete' && state !== 'awaiting-confirmation' && (
        <button
          className="button primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError('');
            try {
              const result = await cleanup(id, 'retry');
              setState(result.state);
              setError(result.error || '');
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy
            ? 'Mengesahkan pemadaman…'
            : state === 'failed'
              ? 'Cuba Padam Semula'
              : 'Padam & Sahkan'}
        </button>
      )}
      <Link className="button secondary" href="/facilitator">
        Cipta Bengkel Baharu
      </Link>
    </main>
  );
}

export function PendingCleanups() {
  const [workshops, setWorkshops] = useState<{ id: string; title: string; expired: boolean }[]>([]);
  const [jobs, setJobs] = useState<{ id: string; state: string; error: string }[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const response = await fetch('/api/cleanup', {
          headers: { Authorization: `Bearer ${await auth.currentUser?.getIdToken()}` },
          cache: 'no-store',
        });
        if (!response.ok)
          throw new Error('Could not check unfinished cleanup. Refresh when connected.');
        const result = await response.json();
        if (!stopped) {
          setJobs(result.jobs);
          setWorkshops(result.workshops || []);
          setError('');
        }
      } catch (e) {
        if (!stopped) setError((e as Error).message);
      }
      if (!stopped) timer = setTimeout(poll, 10000);
    }
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, []);
  return (
    <section className="pending-cleanups" aria-label="Pemadaman bengkel tertangguh">
      <ErrorMessage message={error} />
      {workshops.length > 0 && (
        <>
          <h2>Bengkel Menunggu Pemadaman</h2>
          <p>
            Data kekal sehingga anda mengesahkan Padam Semua Data Bengkel. Tiada pemadaman
            automatik.
          </p>
          {workshops.map((room) => (
            <div className="panel" key={room.id}>
              <h3>{room.title}</h3>
              <p>{room.expired ? 'Tamat tempoh · perlu pemadaman manual' : 'Bengkel aktif'}</p>
              <Link className="button secondary" href={`/session/${room.id}`}>
                Buka Bengkel / Padam Data
              </Link>
            </div>
          ))}
        </>
      )}
      {jobs.length > 0 && (
        <>
          <h2>Pemadaman Tertangguh</h2>
          <p>Bengkel ini telah ditutup. Pemadaman datanya belum disahkan.</p>
        </>
      )}
      {jobs.map((job) => (
        <div key={job.id} className="panel">
          <h3>{job.state === 'failed' ? 'Pemadaman Gagal' : 'Pemadaman Sedang Berjalan'}</h3>
          {job.error && <p>{mesejMelayu(job.error)}</p>}
          <Link className="button secondary" href={`/session/${job.id}`}>
            Semak Pemadaman
          </Link>
        </div>
      ))}
    </section>
  );
}
