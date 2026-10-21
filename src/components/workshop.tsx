'use client';
import { useEffect, useState, ReactNode } from 'react';
import Link from 'next/link';
import { doc, collection, onSnapshot, query, where } from 'firebase/firestore';
import { QRCodeSVG } from 'qrcode.react';
import {
  ArrowRight,
  Check,
  Copy,
  ExternalLink,
  Heart,
  ImagePlus,
  Monitor,
  Plus,
  Users,
  X,
  Clock,
  Sparkles,
  Flag,
  Trophy,
} from 'lucide-react';
import { auth, db, api } from '@/lib/firebase';
import {
  COLLECTIONS,
  STYLES,
  STAGES,
  STAGE_INFO,
  makePrompt,
  Workshop,
  Member,
  Submission,
  nextStage,
} from '@/lib/workshop';
import { useIdentity } from './provider';
import { Brand, Timer, Connection, ErrorMessage, Loading, StickerArt } from './ui';
export function WorkshopView({ id, projector = false }: { id: string; projector?: boolean }) {
  const { user, ready, error: authError } = useIdentity();
  const [session, setSession] = useState<Workshop | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!user) return;
    return onSnapshot(
      doc(db, 'sessions', id),
      (s) => {
        if (!s.exists()) setError('This workshop could not be found.');
        else setSession(s.data() as Workshop);
      },
      () =>
        setError('This workshop is unavailable. Join with its code or sign in as its facilitator.'),
    );
  }, [user, id]);
  if (!ready) return <Loading />;
  if (error || authError)
    return (
      <main className="center-message">
        <ErrorMessage message={error || authError} />
        <Link href="/" className="button secondary">
          Back to join
        </Link>
      </main>
    );
  if (!user)
    return (
      <main className="center-message">
        <h1>Your creative room is waiting.</h1>
        <p>Join with your workshop code to continue.</p>
        <Link href="/" className="button primary">
          Join the workshop
        </Link>
      </main>
    );
  if (!session) return <Loading />;
  if (projector && session.hostId !== user.uid)
    return (
      <main className="center-message">
        <h1>Facilitator access required.</h1>
        <Link href="/facilitator">Open facilitator studio</Link>
      </main>
    );
  return <Room session={session} host={session.hostId === user.uid} projector={projector} />;
}
function Room({
  session: storedSession,
  host,
  projector,
}: {
  session: Workshop;
  host: boolean;
  projector: boolean;
}) {
  const { user } = useIdentity();
  const [attendanceCount, setAttendanceCount] = useState(0);
  const session = { ...storedSession, participantCount: attendanceCount };
  const [members, setMembers] = useState<Member[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [own, setOwn] = useState<Submission | null>(null);
  const [vote, setVote] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [joinUrl, setJoinUrl] = useState('');
  useEffect(
    () =>
      onSnapshot(
        collection(db, 'sessions', session.id, 'attendance'),
        (snapshot) => setAttendanceCount(snapshot.size),
        () => setError('Attendance could not be loaded. Please refresh.'),
      ),
    [session.id],
  );
  useEffect(
    () =>
      setJoinUrl(
        `${process.env.NEXT_PUBLIC_APP_URL || window.location.origin}/?code=${session.code}`,
      ),
    [session.code],
  );
  useEffect(() => {
    const base = collection(db, 'sessions', session.id, 'submissions');
    return onSnapshot(
      host ? base : query(base, where('status', '==', 'approved')),
      (s) =>
        setSubmissions(
          s.docs.map((d) => d.data() as Submission).sort((a, b) => a.createdAt - b.createdAt),
        ),
      () => setError('The gallery connection was interrupted. Please refresh.'),
    );
  }, [host, session.id]);
  useEffect(() => {
    if (host)
      return onSnapshot(
        collection(db, 'sessions', session.id, 'members'),
        (s) => setMembers(s.docs.map((d) => d.data() as Member)),
        () => setError('Progress could not be loaded.'),
      );
    const off = onSnapshot(
      doc(db, 'sessions', session.id, 'submissions', user!.uid),
      (s) => setOwn(s.exists() ? (s.data() as Submission) : null),
      () => setError('Your submission could not be loaded.'),
    );
    const offVote = onSnapshot(
      doc(db, 'sessions', session.id, 'votes', user!.uid),
      (s) => setVote(s.data()?.submissionId ?? null),
      () => setError('Your vote status could not be loaded.'),
    );
    return () => {
      off();
      offVote();
    };
  }, [host, session.id, user]);
  async function act(action: string, data: Record<string, unknown> = {}) {
    setBusy(true);
    setError('');
    try {
      await api(action, { sessionId: session.id, ...data });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const approved = submissions.filter((s) => s.status === 'approved');
  const pending = submissions.filter((s) => s.status === 'pending');
  if (projector) return <Projector session={session} approved={approved} joinUrl={joinUrl} />;
  return (
    <>
      <header className="header room-header">
        <Brand />
        <div className="room-title">
          {session.title}
          <Connection />
        </div>
        <span className="room-code">
          ROOM <b>{session.code}</b>
        </span>
      </header>
      <div className="stage-strip">
        {STAGES.map((stage, i) => (
          <span
            key={stage}
            className={
              session.stage === stage ? 'active' : STAGES.indexOf(session.stage) > i ? 'done' : ''
            }
          >
            <b>{STAGES.indexOf(session.stage) > i ? <Check size={12} /> : i + 1}</b>
            {['Welcome', 'Your prompt', 'Create', 'Submit', 'Gallery', 'Vote', 'Celebrate'][i]}
          </span>
        ))}
      </div>
      <main className={`room-main ${host ? 'host-main' : ''}`}>
        <div className="stage-heading">
          <div>
            <span className="eyebrow">
              {host ? 'FACILITATOR DASHBOARD' : 'YOUR CREATIVE PLAYGROUND'} · WOW #1
            </span>
            <h1>
              {STAGE_INFO[session.stage].title}
              <span className="coral-dot">.</span>
            </h1>
            <p>{STAGE_INFO[session.stage].hint}</p>
          </div>
          {session.stage !== 'results' && (
            <div className="countdown">
              <small>
                <Clock size={12} /> TIME FOR THIS STAGE
              </small>
              <Timer end={session.stageEndsAt} />
            </div>
          )}
        </div>
        <ErrorMessage message={error} />
        {host ? (
          <>
            <div className="host-controls">
              <span>
                <Users size={18} />
                <b>{session.participantCount}</b> / 75 joined
              </span>
              <span>
                <ImagePlus size={18} />
                <b>{approved.length}</b> approved
              </span>
              <span>
                <Flag size={18} />
                <b>{pending.length}</b> to review
              </span>
              <div className="spacer" />
              <Link
                href={`/projector/${session.id}`}
                target="_blank"
                className="button secondary small"
              >
                <Monitor size={16} /> Projector
              </Link>
              {session.stage !== 'results' && (
                <>
                  <button
                    disabled={busy}
                    className="button secondary small"
                    onClick={() => act('extend')}
                  >
                    <Plus size={15} /> 1 min
                  </button>
                  <button
                    disabled={busy}
                    className="button primary small"
                    onClick={() => act('advance')}
                  >
                    {session.stage === 'vote'
                      ? 'Close voting & reveal'
                      : nextStage(session.stage) === 'vote'
                        ? 'Open voting'
                        : `Next: ${STAGE_INFO[nextStage(session.stage)!].title}`}
                    <ArrowRight size={15} />
                  </button>
                </>
              )}
            </div>
            <div className="host-grid">
              <section className="host-content">
                {session.stage === 'results' ? (
                  <Results session={session} />
                ) : (
                  <>
                    <div className="section-label">
                      <h2>
                        Review desk <span className="count-badge">{pending.length}</span>
                      </h2>
                      <span>Only approved stickers appear in the gallery</span>
                    </div>
                    {pending.length ? (
                      <div className="moderation-grid">
                        {pending.map((sub) => (
                          <div className="moderation-card" key={sub.id}>
                            <StickerImage sessionId={session.id} sub={sub} />
                            <h3>{sub.nickname}</h3>
                            <p>{sub.caption || 'An original teacher creation'}</p>
                            <div className="two-buttons">
                              <button
                                disabled={busy || ['vote', 'results'].includes(session.stage)}
                                className="button approve small"
                                onClick={() =>
                                  act('moderate', { submissionId: sub.id, status: 'approved' })
                                }
                              >
                                <Check size={16} /> Approve
                              </button>
                              <button
                                disabled={busy || ['vote', 'results'].includes(session.stage)}
                                className="button secondary small"
                                onClick={() =>
                                  act('moderate', { submissionId: sub.id, status: 'rejected' })
                                }
                              >
                                <X size={16} /> Return
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <Empty
                        icon="✦"
                        title="Ready for the first little masterpiece."
                        text="Submitted stickers appear here for your review. Keep them classroom-friendly, with no personal or student information."
                      />
                    )}
                    <div className="section-label">
                      <h2>
                        The live gallery <span className="count-badge">{approved.length}</span>
                      </h2>
                    </div>
                    <Gallery
                      submissions={approved}
                      session={session}
                      host
                      vote={vote}
                      onVote={(id) => act('vote', { submissionId: id })}
                      busy={busy}
                      onRemove={(id) => act('moderate', { submissionId: id, status: 'rejected' })}
                    />
                  </>
                )}
              </section>
              <aside className="host-sidebar">
                <JoinPanel session={session} url={joinUrl} />
                <section className="panel progress-panel">
                  <h3>The room at a glance</h3>
                  <p>Progress updates live as teachers create.</p>
                  {members.length === 0 ? (
                    <p className="fine-print">Your first teacher is one scan away.</p>
                  ) : (
                    members.map((m) => (
                      <div className="member-row" key={m.id}>
                        <span className="avatar">{m.nickname[0].toUpperCase()}</span>
                        <span>{m.nickname}</span>
                        <small>
                          {(
                            {
                              joined: 'In the room',
                              'prompt-ready': 'Prompt ready',
                              generating: 'Creating',
                              submitted: 'Submitted',
                              voted: 'Voted ✓',
                            } as Record<string, string>
                          )[m.progress] || m.progress}
                        </small>
                      </div>
                    ))
                  )}
                </section>
              </aside>
            </div>
          </>
        ) : session.stage === 'results' ? (
          <Results session={session} />
        ) : session.stage === 'lobby' ? (
          <div className="welcome-panel">
            <div>
              <span className="pill">YOU’RE IN. LET’S GET CREATIVE.</span>
              <h2>
                A sticker only
                <br />
                <em>you could imagine.</em>
              </h2>
              <p>
                Your facilitator will kick things off shortly. You’ll choose a caption, create with
                your own AI account, and share your finished sticker with the room.
              </p>
              <div className="notice">
                Have ChatGPT, Gemini, or your preferred image tool ready. No selfies needed—use an
                original fictional character.
              </div>
              <Connection />
            </div>
            <StickerArt kind="sun" />
          </div>
        ) : ['prompt', 'generate', 'submit'].includes(session.stage) ? (
          <PromptLab session={session} own={own} />
        ) : (
          <>
            <div className="gallery-banner">
              <Heart size={20} />
              <p>
                {session.stage === 'vote'
                  ? vote
                    ? 'Your vote is in. Thanks for cheering on another creator!'
                    : 'Choose one favorite. Votes are final, so pick the sticker that makes you smile.'
                  : 'Every sticker started as a little idea. Take a look around while your facilitator prepares voting.'}
              </p>
            </div>
            <Gallery
              submissions={approved}
              session={session}
              host={false}
              vote={vote}
              onVote={(id) => act('vote', { submissionId: id })}
              busy={busy}
            />
          </>
        )}
      </main>
      <div className="room-footer">
        WOW #1 <span>Made by teachers. Celebrated together.</span>
        <Connection />
      </div>
    </>
  );
}
function Empty({ icon, title, text }: { icon: string; title: string; text: string }) {
  return (
    <div className="empty">
      <span>{icon}</span>
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}
function JoinPanel({ session, url }: { session: Workshop; url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <section className="panel join-panel">
      <span className="eyebrow">MORE IDEAS WELCOME</span>
      <h3>Scan. Join. Create.</h3>
      {url && (
        <div className="qr">
          <QRCodeSVG value={url} size={160} level="M" marginSize={1} />
        </div>
      )}
      <p>Or enter the session code</p>
      <div className="big-code">{session.code}</div>
      <button
        className="text-button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch {
            setCopied(false);
          }
        }}
      >
        <Copy size={14} /> {copied ? 'Link copied!' : 'Copy invitation link'}
      </button>
    </section>
  );
}
function PromptLab({ session, own }: { session: Workshop; own: Submission | null }) {
  const [collectionId, setCollection] = useState('classroom');
  const [caption, setCaption] = useState(COLLECTIONS[0].captions[0]);
  const [style, setStyle] = useState('clay');
  const [character, setCharacter] = useState('A cheerful teacher mascot');
  const [loaded, setLoaded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const { offset } = useIdentity();
  useEffect(() => {
    try {
      const saved = localStorage.getItem(`wow-draft-${session.id}`);
      if (saved) {
        const d = JSON.parse(saved);
        if (COLLECTIONS.some((c) => c.id === d.collectionId)) setCollection(d.collectionId);
        if (typeof d.caption === 'string') setCaption(d.caption.slice(0, 120));
        if (STYLES.some((s) => s.id === d.style)) setStyle(d.style);
        if (typeof d.character === 'string') setCharacter(d.character.slice(0, 100));
      }
    } catch {}
    setLoaded(true);
  }, [session.id]);
  useEffect(() => {
    if (loaded)
      localStorage.setItem(
        `wow-draft-${session.id}`,
        JSON.stringify({ collectionId, caption, style, character }),
      );
  }, [loaded, session.id, collectionId, caption, style, character]);
  const prompt = makePrompt(caption, style, character);
  const selected = COLLECTIONS.find((c) => c.id === collectionId)!;
  async function copy() {
    setError('');
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      await api('progress', { sessionId: session.id, progress: 'prompt-ready' });
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setError('Could not copy automatically. Select and copy the prompt below.');
    }
  }
  async function upload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const form = new FormData();
      form.set('sessionId', session.id);
      form.set('caption', caption);
      form.set('image', file);
      const token = await auth.currentUser!.getIdToken();
      const r = await fetch('/api/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      setFile(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="lab-grid">
      <div>
        <section className="panel lab-panel">
          <div className="section-label">
            <h2>
              <span className="number">01</span> Find your words
            </h2>
            <small>A LITTLE PERSONALITY GOES A LONG WAY</small>
          </div>
          <div className="collection-tabs" role="group" aria-label="Caption collections">
            {COLLECTIONS.map((c) => (
              <button
                key={c.id}
                className={c.id === collectionId ? 'selected' : ''}
                onClick={() => {
                  setCollection(c.id);
                  setCaption(c.captions[0]);
                }}
              >
                <span>{c.emoji}</span>
                {c.name}
              </button>
            ))}
          </div>
          <p>{selected.description}</p>
          <div className="caption-options">
            {selected.captions.map((c) => (
              <button
                className={c === caption ? 'selected' : ''}
                onClick={() => setCaption(c)}
                key={c}
              >
                {c}
              </button>
            ))}
          </div>
          <label>
            Make it yours <span>{caption.length}/120</span>
            <input
              maxLength={120}
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Your sticker’s words…"
            />
          </label>
        </section>
        <section className="panel lab-panel">
          <h2>
            <span className="number">02</span> Give it a personality
          </h2>
          <div className="style-options">
            {STYLES.map((s) => (
              <button
                className={style === s.id ? 'selected' : ''}
                onClick={() => setStyle(s.id)}
                key={s.id}
              >
                <span>{s.emoji}</span>
                {s.name}
                {style === s.id && <Check size={14} />}
              </button>
            ))}
          </div>
          <label>
            Your fictional character
            <input
              maxLength={100}
              value={character}
              onChange={(e) => setCharacter(e.target.value)}
              placeholder="A coffee-loving owl in teacher glasses"
            />
          </label>
          <p className="fine-print">
            Think mascots, animals, or imaginary teachers. Keep real people and student information
            out of your prompt.
          </p>
        </section>
      </div>
      <aside>
        <section className="panel prompt-panel">
          <span className="eyebrow">
            <Sparkles size={14} /> YOUR IDEA, READY TO GO
          </span>
          <h2>The magic starts here.</h2>
          <div className="prompt-preview">
            <span className="pill">
              {STYLES.find((s) => s.id === style)?.name} · ORIGINAL CHARACTER
            </span>
            <blockquote>“{caption || 'Your words go here'}”</blockquote>
          </div>
          <label htmlFor="generated-prompt">Your AI image prompt</label>
          <textarea
            id="generated-prompt"
            className="generated-prompt"
            readOnly
            value={prompt}
            rows={6}
          />
          <button className="button primary full" onClick={copy} disabled={!caption.trim()}>
            <Copy size={17} />
            {copied ? 'Copied. Go make your WOW!' : 'Copy my prompt'}
          </button>
          <div className="external-tools">
            <small>PASTE IT INTO YOUR OWN AI TOOL</small>
            <div>
              {[
                ['ChatGPT', 'https://chatgpt.com'],
                ['Gemini', 'https://gemini.google.com'],
                ['Copilot', 'https://copilot.microsoft.com'],
              ].map(([name, url]) => (
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  key={name}
                  onClick={() => {
                    api('progress', { sessionId: session.id, progress: 'generating' }).catch(
                      () => {},
                    );
                  }}
                >
                  {name}
                  <ExternalLink size={12} />
                </a>
              ))}
            </div>
            <p>
              Your AI account creates the image. Save the finished sticker and return to this tab.
            </p>
          </div>
        </section>
        <section className="panel upload-panel">
          <h2>
            <span className="number">03</span> Bring it back
          </h2>
          {own ? (
            <div className={`submission-status ${own.status}`}>
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
          ) : null}
          {own?.status !== 'approved' && (
            <form onSubmit={upload}>
              <label className="upload-zone">
                <ImagePlus size={28} />
                <b>{file ? file.name : 'Choose your finished sticker'}</b>
                <span>PNG, JPG or WebP · up to 5 MB</span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  aria-label="Finished sticker image"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    setError('');
                    if (f && f.size > 5 * 1024 * 1024) {
                      setError('Choose an image under 5 MB.');
                      setFile(null);
                    } else setFile(f ?? null);
                  }}
                />
              </label>
              <p className="fine-print">
                Upload only your finished sticker, never an original selfie or a photo of a student.
              </p>
              <button
                disabled={
                  !file ||
                  busy ||
                  !['generate', 'submit'].includes(session.stage) ||
                  session.stageEndsAt <= Date.now() + offset
                }
                className="button dark full"
              >
                {busy
                  ? 'Sending your sticker…'
                  : own
                    ? 'Replace my submission'
                    : 'Send to the showcase'}
                <ArrowRight size={17} />
              </button>
              {session.stage === 'prompt' && (
                <p className="fine-print">
                  Uploads open when your facilitator starts the Create stage.
                </p>
              )}
            </form>
          )}
          <ErrorMessage message={error} />
        </section>
      </aside>
    </div>
  );
}
function StickerImage({ sessionId, sub }: { sessionId: string; sub: Submission }) {
  return (
    <img
      className="submission-image"
      src={`/api/image?sessionId=${sessionId}&submissionId=${sub.id}&v=${sub.createdAt}`}
      alt={`${sub.nickname}’s sticker${sub.caption ? `: ${sub.caption}` : ''}`}
      loading="lazy"
    />
  );
}
function Gallery({
  submissions,
  session,
  host,
  vote,
  onVote,
  busy,
  onRemove,
}: {
  submissions: Submission[];
  session: Workshop;
  host: boolean;
  vote: string | null;
  onVote: (id: string) => void;
  busy: boolean;
  onRemove?: (id: string) => void;
}) {
  const { user, offset } = useIdentity();
  const [selected, setSelected] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!submissions.length)
    return (
      <Empty
        icon="♡"
        title="A gallery full of possibility."
        text="Approved stickers will appear here live. There’s a little WOW on its way."
      />
    );
  return (
    <>
      <div className="gallery-grid">
        {submissions.map((s) => (
          <article className="gallery-card" key={s.id}>
            <div className="gallery-art">
              <StickerImage sessionId={session.id} sub={s} />
              {vote === s.id && (
                <span className="voted-badge">
                  <Heart size={14} fill="currentColor" /> YOUR PICK
                </span>
              )}
            </div>
            <div className="gallery-card-bottom">
              <span className="avatar">{s.nickname[0].toUpperCase()}</span>
              <div>
                <h3>
                  {s.nickname}
                  {s.id === user?.uid ? ' (you)' : ''}
                </h3>
                <p>{s.caption || 'A little original WOW'}</p>
              </div>
            </div>
            {session.stage === 'vote' && !host && (
              <button
                className={`button ${vote === s.id ? 'approve' : 'secondary'} full`}
                disabled={
                  !!vote || busy || s.id === user?.uid || session.stageEndsAt <= now + offset
                }
                onClick={() => setSelected(s.id)}
              >
                <Heart size={16} />
                {vote === s.id
                  ? 'Your vote is counted'
                  : s.id === user?.uid
                    ? 'Your creation'
                    : vote
                      ? 'Voting complete'
                      : 'This is my favorite'}
              </button>
            )}
            {host && !['vote', 'results'].includes(session.stage) && (
              <button className="text-button" disabled={busy} onClick={() => onRemove?.(s.id)}>
                Return to creator
              </button>
            )}
          </article>
        ))}
      </div>
      {selected && (
        <div className="modal-backdrop">
          <div
            className="panel vote-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="vote-title"
          >
            <Heart size={32} />
            <h2 id="vote-title">Give this WOW your vote?</h2>
            <p>You get one vote, and it’s final. Make it count.</p>
            <div className="two-buttons">
              <button autoFocus className="button secondary" onClick={() => setSelected(null)}>
                Keep looking
              </button>
              <button
                className="button primary"
                disabled={busy}
                onClick={() => {
                  onVote(selected);
                  setSelected(null);
                }}
              >
                Cast my vote
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
function Results({ session }: { session: Workshop }) {
  return (
    <section className="results">
      <div className="confetti" aria-hidden="true">
        {Array.from({ length: 32 }, (_, i) => (
          <i
            key={i}
            style={{
              left: `${(i * 37) % 100}%`,
              animationDelay: `${(i % 7) * 0.19}s`,
              background: ['#ed6746', '#f5ce53', '#aa92d9', '#99bba8'][i % 4],
              transform: `rotate(${i * 25}deg)`,
            }}
          />
        ))}
      </div>
      <span className="eyebrow">
        <Trophy size={18} /> THE ROOM HAS SPOKEN
      </span>
      <h2>
        Small stickers.
        <br />
        <em>Huge applause.</em>
      </h2>
      <p>
        {session.totalVotes || 0} votes. {session.participantCount} creative minds. A whole lot of
        WOW.
      </p>
      {session.winners?.length ? (
        <div className="podium">
          {session.winners.map((w) => (
            <article key={w.id} className={`winner rank-${w.rank}`}>
              <div className="winner-rank">
                {w.rank === 1 ? '★' : w.rank}{' '}
                <span>
                  {w.rank === 1
                    ? 'THE BIG WOW'
                    : w.rank === 2
                      ? 'CROWD FAVORITE'
                      : 'CREATIVE SPARK'}
                </span>
              </div>
              <img
                src={`/api/image?sessionId=${session.id}&submissionId=${w.id}`}
                alt={`Winning sticker by ${w.nickname}`}
              />
              <h3>{w.nickname}</h3>
              <p>
                {w.votes} {w.votes === 1 ? 'vote' : 'votes'} · Rank {w.rank}
              </p>
            </article>
          ))}
        </div>
      ) : (
        <div className="panel">
          <h3>Every creator gets a moment.</h3>
          <p>No votes were cast this time. Celebrate all the ideas you made together!</p>
        </div>
      )}
      <div className="results-note">
        Take this creativity back to your classroom. <Heart size={17} />
      </div>
    </section>
  );
}
function Projector({
  session,
  approved,
  joinUrl,
}: {
  session: Workshop;
  approved: Submission[];
  joinUrl: string;
}) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setIndex((i) => i + 1), 6000);
    return () => clearInterval(t);
  }, []);
  return (
    <main className="projector">
      <header>
        <Brand />
        <Connection />
        <span className="room-code">
          JOIN <b>{session.code}</b>
        </span>
      </header>
      {session.stage === 'results' ? (
        <Results session={session} />
      ) : (
        <>
          <div className="projector-heading">
            <div>
              <span className="eyebrow">WOW #1 · THE TEACHER STICKER LAB</span>
              <h1>
                {STAGE_INFO[session.stage].title}
                <span className="coral-dot">.</span>
              </h1>
              <p>{STAGE_INFO[session.stage].hint}</p>
            </div>
            <Timer end={session.stageEndsAt} large />
          </div>
          <div className="projector-body">
            <div className="projector-showcase">
              {approved.length ? (
                <div className="projected-sticker" key={approved[index % approved.length].id}>
                  <StickerImage sessionId={session.id} sub={approved[index % approved.length]} />
                  <h2>{approved[index % approved.length].nickname}</h2>
                  <p>{approved[index % approved.length].caption}</p>
                  <span>
                    {(index % approved.length) + 1} / {approved.length} creative WOWs
                  </span>
                </div>
              ) : (
                <>
                  <StickerArt kind="sun" />
                  <h2>
                    {session.stage === 'lobby'
                      ? 'Your next great idea starts here.'
                      : 'Good things are being created.'}
                  </h2>
                  <p>{session.participantCount} teachers in the room. So much possibility.</p>
                </>
              )}
            </div>
            <JoinPanel session={session} url={joinUrl} />
          </div>
          <footer>
            <span>{session.participantCount} CREATIVE MINDS IN THE ROOM</span>
            <span>
              {session.stage === 'vote'
                ? 'ONE PERSON. ONE VOTE. SHARE THE LOVE.'
                : 'BIG IDEAS. TINY STICKERS. THAT’S YOUR WOW.'}
            </span>
          </footer>
        </>
      )}
    </main>
  );
}
