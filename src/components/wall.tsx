'use client';
import { useMemo, useState } from 'react';
import { Submission, Workshop, acceptingVotes, wallOrder } from '@/lib/workshop';
import { StickerImage, useNow } from './ui';
import { useIdentity } from './provider';
import { Modal } from './modal';
export function Gallery({
  submissions,
  session,
  host = false,
  vote = null,
  onVote = () => {},
  busy = false,
  onRemove,
  projector = false,
}: {
  submissions: Submission[];
  session: Workshop;
  host?: boolean;
  vote?: string | null;
  onVote?: (id: string) => void;
  busy?: boolean;
  onRemove?: (id: string) => void;
  projector?: boolean;
}) {
  const { user, offset } = useIdentity();
  const now = useNow();
  const [search, setSearch] = useState('');
  const [preview, setPreview] = useState<Submission | null>(null);
  const [selected, setSelected] = useState<Submission | null>(null);
  const ordered = useMemo(
    () =>
      [...submissions].sort(
        (a, b) =>
          wallOrder(a.id, session.id) - wallOrder(b.id, session.id) || a.id.localeCompare(b.id),
      ),
    [submissions, session.id],
  );
  const visible = ordered.filter((s) =>
    `${s.nickname} ${s.caption}`.toLowerCase().includes(search.toLowerCase()),
  );
  const canVote = acceptingVotes(session, now + offset) && !vote && !busy;
  return (
    <section
      className={`live-wall ${projector ? 'projector-wall' : ''}`}
      aria-label="Live Sticker Wall"
    >
      <div className="wall-toolbar">
        <h2>
          Live Sticker Wall <span className="count-badge">{submissions.length}</span>
        </h2>
        {!projector && (
          <label>
            Find a teacher or caption
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search the wall"
            />
          </label>
        )}
        <p>
          {projector
            ? 'Every creator. One room full of ideas.'
            : `${visible.length} of ${submissions.length} stickers · tap any image to take a closer look`}
        </p>
      </div>
      {!submissions.length ? (
        <div className="empty">
          <h3>A gallery full of possibility.</h3>
          <p>Approved stickers will appear here live.</p>
        </div>
      ) : !visible.length ? (
        <p role="status">No matching stickers. Try another name or clear your search.</p>
      ) : (
        <div className="gallery-grid wall-grid">
          {visible.map((s) => (
            <article className="gallery-card" key={s.id}>
              <button
                className="wall-image-button"
                aria-label={`Enlarge sticker by ${s.nickname}`}
                onClick={() => setPreview(s)}
              >
                <StickerImage sessionId={session.id} sub={s} />
              </button>
              <h3>
                {s.nickname}
                {s.id === user?.uid ? ' (you)' : ''}
              </h3>
              {!projector && <p className="wall-caption">{s.caption}</p>}
              {session.stage === 'vote' && !host && !projector && (
                <button
                  className={`button ${vote === s.id ? 'approve' : 'secondary'} full`}
                  disabled={!canVote || s.id === user?.uid}
                  onClick={() => setSelected(s)}
                >
                  {vote === s.id
                    ? 'Your vote is counted'
                    : s.id === user?.uid
                      ? 'Your creation'
                      : vote
                        ? 'Voting complete'
                        : 'This is my favorite'}
                </button>
              )}
              {host && !projector && !['vote', 'results'].includes(session.stage) && (
                <button className="text-button" disabled={busy} onClick={() => onRemove?.(s.id)}>
                  Return to creator
                </button>
              )}
            </article>
          ))}
        </div>
      )}
      {preview && (
        <Modal title={`A closer look · ${preview.nickname}`} onClose={() => setPreview(null)}>
          <StickerImage sessionId={session.id} sub={preview} />
          <p>{preview.caption}</p>
          <div className="two-buttons">
            <button autoFocus className="button secondary" onClick={() => setPreview(null)}>
              Back to wall
            </button>
            {!host && !projector && session.stage === 'vote' && (
              <button
                className="button primary"
                disabled={!canVote || preview.id === user?.uid}
                onClick={() => {
                  setSelected(preview);
                  setPreview(null);
                }}
              >
                Choose this sticker
              </button>
            )}
          </div>
        </Modal>
      )}
      {selected && (
        <Modal title="Give this WOW your vote?" onClose={() => setSelected(null)}>
          <StickerImage sessionId={session.id} sub={selected} />
          <h3>{selected.nickname}</h3>
          <p>You get one vote, and it’s final. Check your choice before confirming.</p>
          {!canVote && !vote && (
            <p role="status">Voting is paused or closed. Wait for your facilitator.</p>
          )}
          <div className="two-buttons">
            <button autoFocus className="button secondary" onClick={() => setSelected(null)}>
              Keep looking
            </button>
            <button
              className="button primary"
              disabled={!canVote}
              onClick={() => {
                onVote(selected.id);
                setSelected(null);
              }}
            >
              Cast my vote
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
