'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { auth } from '@/lib/firebase';
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
      ticket: localStorage.getItem(key) || undefined,
    }),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error || 'Could not check deletion. Retry when connected.');
  if (result.ticket) localStorage.setItem(key, result.ticket);
  return result as { state: string; error?: string };
}
export function EndSession({ id, title }: { id: string; title: string }) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <>
      <button className="button secondary small" onClick={() => setConfirm(true)}>
        End Session & Delete Data
      </button>
      {confirm && (
        <Modal
          title="End Session & Delete Data?"
          onClose={() => {
            if (!busy) setConfirm(false);
          }}
        >
          <p>
            <strong>{title}</strong> will close immediately. All participants, stickers, votes and
            results will be permanently deleted. This cannot be undone.
          </p>
          <p>Wait for Cleanup Complete before closing the facilitator screen.</p>
          <ErrorMessage message={error} />
          <div className="two-buttons">
            <button
              autoFocus
              className="button secondary"
              disabled={busy}
              onClick={() => setConfirm(false)}
            >
              Keep workshop open
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
              {busy ? 'Closing…' : 'Yes, end & delete all data'}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
export function CleanupStatus({ id }: { id: string }) {
  const [state, setState] = useState('checking');
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
        localStorage.removeItem(`wow-cleanup-${id}`);
        sessionStorage.removeItem(`wow-cleanup-complete-${id}`);
      }
    };
  }, [id]);
  return (
    <main className="center-message">
      <h1 aria-live="polite">
        {state === 'complete'
          ? 'Cleanup Complete'
          : state === 'failed'
            ? 'Cleanup failed'
            : 'Workshop closed'}
      </h1>
      <p>
        {state === 'complete'
          ? 'Deletion of this workshop’s platform data has been verified.'
          : 'Joining, uploads and voting are closed. Deletion is not yet verified.'}
      </p>
      <ErrorMessage message={error} />
      {state !== 'complete' && (
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
            ? 'Verifying deletion…'
            : state === 'failed'
              ? 'Retry cleanup'
              : 'Run cleanup & verify'}
        </button>
      )}
      <Link className="button secondary" href="/facilitator">
        Create a new workshop
      </Link>
    </main>
  );
}

export function PendingCleanups() {
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
    <section className="pending-cleanups" aria-label="Unfinished workshop cleanup">
      <ErrorMessage message={error} />
      {jobs.length > 0 && (
        <>
          <h2>Unfinished cleanup</h2>
          <p>These workshops are closed. Their deletion has not yet been verified.</p>
        </>
      )}
      {jobs.map((job) => (
        <div key={job.id} className="panel">
          <h3>{job.state === 'failed' ? 'Cleanup failed' : 'Cleanup in progress'}</h3>
          {job.error && <p>{job.error}</p>}
          <Link className="button secondary" href={`/session/${job.id}`}>
            Review cleanup
          </Link>
        </div>
      ))}
    </section>
  );
}
