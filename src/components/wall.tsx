'use client';
import { useMemo, useState } from 'react';
import { Submission, Workshop, acceptingVotes, wallOrder } from '@/lib/workshop';
import { StickerImage, useNow } from './ui';
import { useIdentity } from './provider';
import { DownloadArtwork } from './download-artwork';
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
    <section className={`live-wall ${projector ? 'projector-wall' : ''}`} aria-label="Galeri Karya">
      <div className="wall-toolbar">
        <h2>
          Galeri Karya <span className="count-badge">{submissions.length}</span>
        </h2>
        {!projector && (
          <label>
            Cari peserta atau kapsyen
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari dalam galeri"
            />
          </label>
        )}
        <p>
          {projector
            ? 'Setiap karya, satu inspirasi.'
            : `${visible.length} daripada ${submissions.length} karya · tekan gambar untuk besarkan`}
        </p>
      </div>
      {!submissions.length ? (
        <div className="empty">
          <h3>Galeri menanti karya anda.</h3>
          <p>Karya yang diluluskan akan muncul di sini secara langsung.</p>
        </div>
      ) : !visible.length ? (
        <p role="status">Tiada karya sepadan. Cuba nama lain atau kosongkan carian.</p>
      ) : (
        <div className="gallery-grid wall-grid">
          {visible.map((s) => (
            <article className="gallery-card" key={s.id}>
              <button
                className="wall-image-button"
                aria-label={`Besarkan karya ${s.nickname}`}
                onClick={() => setPreview(s)}
              >
                <StickerImage sessionId={session.id} sub={s} />
              </button>
              <h3>
                {s.nickname}
                {s.id === user?.uid ? ' (anda)' : ''}
              </h3>
              {!projector && <p className="wall-caption">{s.caption}</p>}
              <DownloadArtwork sessionId={session.id} submission={s} compact={projector} />
              {session.stage === 'vote' && !host && !projector && (
                <button
                  className={`button ${vote === s.id ? 'approve' : 'secondary'} full`}
                  disabled={!canVote || s.id === user?.uid}
                  onClick={() => setSelected(s)}
                >
                  {vote === s.id
                    ? 'Undian anda dikira'
                    : s.id === user?.uid
                      ? 'Karya anda'
                      : vote
                        ? 'Undian selesai'
                        : 'Undi Karya Ini'}
                </button>
              )}
              {host && !projector && !['vote', 'results'].includes(session.stage) && (
                <button className="text-button" disabled={busy} onClick={() => onRemove?.(s.id)}>
                  Pulangkan kepada Peserta
                </button>
              )}
            </article>
          ))}
        </div>
      )}
      {preview && (
        <Modal title={`Lihat karya · ${preview.nickname}`} onClose={() => setPreview(null)}>
          <StickerImage sessionId={session.id} sub={preview} />
          <p>{preview.caption}</p>
          <DownloadArtwork sessionId={session.id} submission={preview} />
          <div className="two-buttons">
            <button autoFocus className="button secondary" onClick={() => setPreview(null)}>
              Kembali ke Galeri
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
                Pilih Karya Ini
              </button>
            )}
          </div>
        </Modal>
      )}
      {selected && (
        <Modal title="Undi karya ini?" onClose={() => setSelected(null)}>
          <StickerImage sessionId={session.id} sub={selected} />
          <h3>{selected.nickname}</h3>
          <p>Anda hanya boleh mengundi sekali. Semak pilihan sebelum mengesahkan.</p>
          {!canVote && !vote && (
            <p role="status">Undian dijeda atau ditutup. Tunggu arahan fasilitator.</p>
          )}
          <div className="two-buttons">
            <button autoFocus className="button secondary" onClick={() => setSelected(null)}>
              Lihat Karya Lain
            </button>
            <button
              className="button primary"
              disabled={!canVote}
              onClick={() => {
                onVote(selected.id);
                setSelected(null);
              }}
            >
              Sahkan Undian
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
