'use client';
import { STAGE_COPY } from '@/lib/bahasa';
import { useState } from 'react';
import Link from 'next/link';
import { Member, Submission, Workshop, STAGES, Stage, nextStage } from '@/lib/workshop';
import { EndSession } from './cleanup';
import { Modal } from './modal';
import { StickerImage, ErrorMessage, WorkshopBudget } from './ui';
type Act = (action: string, data?: Record<string, unknown>) => Promise<boolean>;
export function HostControls({
  session,
  submitted,
  approved,
  pending,
  votes,
  busy,
  act,
  actionError,
}: {
  session: Workshop;
  submitted: number;
  approved: number;
  pending: number;
  votes: number;
  busy: boolean;
  act: Act;
  actionError: string;
}) {
  const [target, setTarget] = useState<Stage>('submit');
  const [confirm, setConfirm] = useState<{
    action: string;
    data?: Record<string, unknown>;
    title: string;
  } | null>(null);
  const next = nextStage(session.stage);
  function advance() {
    if (['gallery', 'vote', 'results'].includes(next || ''))
      setConfirm({
        action: 'advance',
        title:
          next === 'results'
            ? 'Tutup undian dan paparkan pemenang?'
            : next === 'vote'
              ? 'Buka undian dan tutup penghantaran?'
              : 'Tutup penghantaran dan paparkan galeri?',
      });
    else void act('advance');
  }
  return (
    <>
      <div className="host-controls">
        <div className="live-totals" aria-label="Jumlah langsung bengkel">
          <span>
            <b>{session.participantCount}</b> / 60 peserta
          </span>
          <span>
            <b>{submitted}</b> dihantar
          </span>
          <span>
            <b>{approved}</b> diluluskan
          </span>
          <span>
            <b>{pending}</b> perlu semakan
          </span>
          <span>
            <b>{votes}</b> / {session.participantCount} undian
          </span>
        </div>
        <WorkshopBudget session={session} />
        <div className="host-actions">
          <EndSession id={session.id} title={session.title} />
          <Link
            href={`/projector/${session.id}`}
            target="_blank"
            className="button secondary small"
          >
            Paparan Projektor
          </Link>
          {session.stage !== 'results' && (
            <>
              <button
                className="button secondary small"
                disabled={busy}
                onClick={() => act(session.pausedRemainingMs != null ? 'resume' : 'pause')}
              >
                {session.pausedRemainingMs != null ? 'Sambung Bengkel' : 'Jeda Bengkel'}
              </button>
              <button
                className="button secondary small"
                disabled={busy}
                onClick={() => act('extend')}
              >
                + 1 minit
              </button>
              <button className="button primary small" disabled={busy} onClick={advance}>
                {session.stage === 'vote'
                  ? 'Tutup Undian & Papar Keputusan'
                  : next === 'vote'
                    ? 'Buka Undian'
                    : `Seterusnya: ${STAGE_COPY[next!].title}`}
              </button>
            </>
          )}
        </div>
        {!['vote', 'results'].includes(session.stage) && (
          <details className="manual-stages">
            <summary>Kawalan peringkat / buka semula penghantaran</summary>
            <p>
              {session.activity
                ? 'Peringkat aktiviti berkongsi masa berbaki. Tukar peringkat tidak memulakan masa baharu. Peringkat tidak boleh dibuka semula selepas undian bermula.'
                : 'Pertukaran menetapkan semula pemasa peringkat dan menyambung bengkel. Peringkat tidak boleh dibuka semula selepas undian bermula.'}
            </p>
            <div className="host-actions">
              <label>
                Pilih peringkat
                <select value={target} onChange={(e) => setTarget(e.target.value as Stage)}>
                  {STAGES.slice(0, 5).map((s) => (
                    <option key={s} value={s}>
                      {STAGE_COPY[s].title}
                    </option>
                  ))}
                </select>
              </label>
              <button
                disabled={busy}
                className="button secondary"
                onClick={() =>
                  setConfirm({
                    action: 'transition',
                    data: { stage: target },
                    title: `Buka peringkat ${STAGE_COPY[target].title}?`,
                  })
                }
              >
                Buka Peringkat Dipilih
              </button>
            </div>
          </details>
        )}
      </div>
      {confirm && (
        <Modal title={confirm.title} onClose={() => setConfirm(null)}>
          <ErrorMessage message={actionError} />
          <p>
            {submitted} dihantar · {approved} diluluskan · {pending} menunggu semakan · {votes}/
            {session.participantCount} undian.
          </p>
          <p>
            {session.stage === 'vote'
              ? 'Undian akan ditutup sepenuhnya dan keputusan akan dipaparkan.'
              : 'Peserta yang belum selesai mungkin memerlukan penghantaran dibuka semula. Semakan karya dan pembukaan semula dikunci apabila undian bermula.'}
          </p>
          <div className="two-buttons">
            <button
              autoFocus
              className="button secondary"
              disabled={busy}
              onClick={() => setConfirm(null)}
            >
              Kekalkan Peringkat
            </button>
            <button
              className="button primary"
              disabled={busy}
              onClick={async () => {
                if (await act(confirm.action, confirm.data)) setConfirm(null);
              }}
            >
              Sahkan Pertukaran
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
export function ReviewDesk({
  submissions,
  session,
  busy,
  act,
}: {
  submissions: Submission[];
  session: Workshop;
  busy: boolean;
  act: Act;
}) {
  const [filter, setFilter] = useState('pending');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [reason, setReason] = useState('Sila hantar karya siap yang sesuai untuk bengkel guru.');
  const visible = submissions.filter(
    (s) =>
      s.status === filter &&
      `${s.nickname} ${s.caption}`.toLowerCase().includes(search.toLowerCase()),
  );
  const current = visible.find((s) => s.id === selected);
  const locked = ['vote', 'results'].includes(session.stage);
  async function moderate(sub: Submission, status: 'approved' | 'rejected') {
    const index = visible.findIndex((s) => s.id === sub.id);
    const following = visible[index + 1] || visible[index - 1];
    if (await act('moderate', { submissionId: sub.id, status, reason }))
      setSelected((currentId) => (currentId === sub.id ? following?.id || null : currentId));
  }
  return (
    <section className="review-desk">
      <h2>Semakan Karya</h2>
      <div className="review-toolbar">
        <label>
          Papar
          <select
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setSelected(null);
            }}
          >
            <option value="pending">
              Menunggu ({submissions.filter((s) => s.status === 'pending').length})
            </option>
            <option value="rejected">
              Pulangkaned ({submissions.filter((s) => s.status === 'rejected').length})
            </option>
          </select>
        </label>
        <label>
          Cari penghantaran
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
      </div>
      {locked && <p className="notice">Semakan karya dikunci kerana undian telah bermula.</p>}
      {!visible.length ? (
        <p>Tiada penghantaran {filter === 'pending' ? 'menunggu' : 'dipulangkan'} yang sepadan.</p>
      ) : (
        <div className="moderation-grid">
          {visible.map((sub) => (
            <article className="moderation-card" key={sub.id}>
              <button
                className="wall-image-button"
                aria-label={`Semak karya ${sub.nickname}`}
                onClick={() => setSelected(sub.id)}
              >
                <StickerImage sessionId={session.id} sub={sub} />
              </button>
              <h3>{sub.nickname}</h3>
              <p>{sub.caption}</p>
              {sub.status === 'rejected' && <p>{sub.reason}</p>}
              <div className="two-buttons">
                <button
                  className="button approve small"
                  disabled={busy || locked}
                  onClick={() => moderate(sub, 'approved')}
                >
                  {sub.status === 'rejected' ? 'Pulihkan ke Galeri' : 'Luluskan'}
                </button>
                {sub.status === 'pending' && (
                  <button
                    className="button secondary small"
                    disabled={busy || locked}
                    onClick={() => setSelected(sub.id)}
                  >
                    Pulangkan
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
      {current && (
        <Modal title={`Semak · ${current.nickname}`} onClose={() => setSelected(null)}>
          <StickerImage sessionId={session.id} sub={current} />
          <p>{current.caption}</p>
          <label>
            Sebab dipulangkan
            <input value={reason} maxLength={120} onChange={(e) => setReason(e.target.value)} />
          </label>
          <p>
            Gunakan Tab untuk memilih Luluskan atau Pulangkan, kemudian tekan Enter. Penghantaran
            seterusnya akan dibuka selepas setiap keputusan.
          </p>
          <div className="two-buttons">
            <button
              autoFocus
              className="button approve"
              disabled={busy || locked}
              onClick={() => moderate(current, 'approved')}
            >
              Luluskan & Seterusnya
            </button>
            <button
              className="button secondary"
              disabled={busy || locked}
              onClick={() => moderate(current, 'rejected')}
            >
              Pulangkan & Seterusnya
            </button>
          </div>
          <button className="text-button" onClick={() => setSelected(null)}>
            Kembali ke Semakan
          </button>
        </Modal>
      )}
    </section>
  );
}
export function ProgressList({ members }: { members: Member[] }) {
  const [search, setSearch] = useState('');
  return (
    <section className="panel progress-panel" tabIndex={0} aria-label="Kemajuan peserta">
      <h3>Kemajuan Peserta</h3>
      <label>
        Cari peserta
        <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} />
      </label>
      {members
        .filter((m) => m.nickname.toLowerCase().includes(search.toLowerCase()))
        .map((m) => (
          <div className="member-row" key={m.id}>
            <span>{m.nickname}</span>
            <small>
              {(
                {
                  'prompt-ready': 'Prompt sedia',
                  generating: 'Sedang mencipta',
                  submitted: 'Dihantar',
                  voted: 'Sudah mengundi ✓',
                  joined: 'Sudah masuk',
                } as Record<string, string>
              )[m.progress] || m.progress}
            </small>
          </div>
        ))}
    </section>
  );
}
