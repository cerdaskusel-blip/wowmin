'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Member, Submission, Workshop, STAGE_INFO, STAGES, Stage, nextStage } from '@/lib/workshop';
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
            ? 'Close voting and reveal winners?'
            : next === 'vote'
              ? 'Open voting and lock submissions?'
              : 'Close submissions and show the wall?',
      });
    else void act('advance');
  }
  return (
    <>
      <div className="host-controls">
        <div className="live-totals" aria-label="Live workshop totals">
          <span>
            <b>{session.participantCount}</b> / 60 joined
          </span>
          <span>
            <b>{submitted}</b> submitted
          </span>
          <span>
            <b>{approved}</b> approved
          </span>
          <span>
            <b>{pending}</b> to review
          </span>
          <span>
            <b>{votes}</b> / {session.participantCount} votes cast
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
            Projector
          </Link>
          {session.stage !== 'results' && (
            <>
              <button
                className="button secondary small"
                disabled={busy}
                onClick={() => act(session.pausedRemainingMs != null ? 'resume' : 'pause')}
              >
                {session.pausedRemainingMs != null ? 'Resume workshop' : 'Pause workshop'}
              </button>
              <button
                className="button secondary small"
                disabled={busy}
                onClick={() => act('extend')}
              >
                + 1 min
              </button>
              <button className="button primary small" disabled={busy} onClick={advance}>
                {session.stage === 'vote'
                  ? 'Close voting & reveal'
                  : next === 'vote'
                    ? 'Open voting'
                    : `Next: ${STAGE_INFO[next!].title}`}
              </button>
            </>
          )}
        </div>
        {!['vote', 'results'].includes(session.stage) && (
          <details className="manual-stages">
            <summary>Manual stage controls / reopen submissions</summary>
            <p>
              Changes reset the stage timer and resume the workshop. Stages cannot reopen after
              voting starts.
            </p>
            <div className="host-actions">
              <label>
                Go to stage
                <select value={target} onChange={(e) => setTarget(e.target.value as Stage)}>
                  {STAGES.slice(0, 5).map((s) => (
                    <option key={s} value={s}>
                      {STAGE_INFO[s].title}
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
                    title: `Move to ${STAGE_INFO[target].title}?`,
                  })
                }
              >
                Go to selected stage
              </button>
            </div>
          </details>
        )}
      </div>
      {confirm && (
        <Modal title={confirm.title} onClose={() => setConfirm(null)}>
          <ErrorMessage message={actionError} />
          <p>
            {submitted} submitted · {approved} approved · {pending} awaiting review · {votes}/
            {session.participantCount} votes cast.
          </p>
          <p>
            {session.stage === 'vote'
              ? 'This closes voting permanently and reveals the results.'
              : 'Teachers with unfinished uploads may need submissions reopened. Moderation and reopening lock when voting starts.'}
          </p>
          <div className="two-buttons">
            <button
              autoFocus
              className="button secondary"
              disabled={busy}
              onClick={() => setConfirm(null)}
            >
              Keep this stage
            </button>
            <button
              className="button primary"
              disabled={busy}
              onClick={async () => {
                if (await act(confirm.action, confirm.data)) setConfirm(null);
              }}
            >
              Confirm stage change
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
  const [reason, setReason] = useState('Please upload a classroom-friendly finished sticker.');
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
      <h2>Review desk</h2>
      <div className="review-toolbar">
        <label>
          Show
          <select
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setSelected(null);
            }}
          >
            <option value="pending">
              Pending ({submissions.filter((s) => s.status === 'pending').length})
            </option>
            <option value="rejected">
              Returned ({submissions.filter((s) => s.status === 'rejected').length})
            </option>
          </select>
        </label>
        <label>
          Find a submission
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
      </div>
      {locked && <p className="notice">Moderation is locked because voting has started.</p>}
      {!visible.length ? (
        <p>No {filter === 'pending' ? 'pending' : 'returned'} submissions match this view.</p>
      ) : (
        <div className="moderation-grid">
          {visible.map((sub) => (
            <article className="moderation-card" key={sub.id}>
              <button
                className="wall-image-button"
                aria-label={`Review sticker by ${sub.nickname}`}
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
                  {sub.status === 'rejected' ? 'Restore to wall' : 'Approve'}
                </button>
                {sub.status === 'pending' && (
                  <button
                    className="button secondary small"
                    disabled={busy || locked}
                    onClick={() => setSelected(sub.id)}
                  >
                    Return
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
      {current && (
        <Modal title={`Review · ${current.nickname}`} onClose={() => setSelected(null)}>
          <StickerImage sessionId={session.id} sub={current} />
          <p>{current.caption}</p>
          <label>
            Reason if returning
            <input value={reason} maxLength={120} onChange={(e) => setReason(e.target.value)} />
          </label>
          <p>
            Use Tab to reach Approve or Return, then Enter. The next submission opens after each
            decision.
          </p>
          <div className="two-buttons">
            <button
              autoFocus
              className="button approve"
              disabled={busy || locked}
              onClick={() => moderate(current, 'approved')}
            >
              Approve and next
            </button>
            <button
              className="button secondary"
              disabled={busy || locked}
              onClick={() => moderate(current, 'rejected')}
            >
              Return and next
            </button>
          </div>
          <button className="text-button" onClick={() => setSelected(null)}>
            Back to review desk
          </button>
        </Modal>
      )}
    </section>
  );
}
export function ProgressList({ members }: { members: Member[] }) {
  const [search, setSearch] = useState('');
  return (
    <section className="panel progress-panel" tabIndex={0} aria-label="Participant progress">
      <h3>The room at a glance</h3>
      <label>
        Find a teacher
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
                  'prompt-ready': 'Prompt ready',
                  generating: 'Creating',
                  submitted: 'Submitted',
                  voted: 'Voted ✓',
                  joined: 'In the room',
                } as Record<string, string>
              )[m.progress] || m.progress}
            </small>
          </div>
        ))}
    </section>
  );
}
