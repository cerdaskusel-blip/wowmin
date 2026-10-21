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
import { CleanupStatus, clearWorkshopDraft } from './cleanup';
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
import {
  Brand,
  Timer,
  Connection,
  ErrorMessage,
  Loading,
  StickerArt,
  StickerImage,
  useNow,
} from './ui';
import { UploadPanel } from './upload';
import { Gallery } from './wall';
import { HostControls, ReviewDesk, ProgressList } from './host-controls';
export function WorkshopView({ id, projector = false }: { id: string; projector?: boolean }) {
  const { user, ready, facilitator, error: authError } = useIdentity();
  const now = useNow();
  const [closed, setClosed] = useState(false);
  const [session, setSession] = useState<Workshop | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!user) return;
    return onSnapshot(
      doc(db, 'sessions', id),
      (s) => {
        if (!s.exists()) {
          setClosed(true);
          clearWorkshopDraft(id);
        } else setSession(s.data() as Workshop);
      },
      (e) => {
        if (e.code === 'permission-denied') {
          setClosed(true);
          clearWorkshopDraft(id);
        } else setError('Could not connect. Check your connection and retry.');
      },
    );
  }, [user, id]);
  useEffect(() => {
    if (session && (session.lifecycle === 'closing' || session.expiresAt <= now)) {
      setClosed(true);
      clearWorkshopDraft(id);
    }
  }, [session, now, id]);
  if (!ready) return <Loading />;
  if (closed)
    return facilitator ? (
      <CleanupStatus id={id} />
    ) : (
      <main className="center-message">
        <h1>This workshop has ended</h1>
        <p>
          Its temporary data is being deleted. Ask your facilitator for the next workshop’s new
          code.
        </p>
        <Link className="button primary" href="/">
          Join another workshop
        </Link>
      </main>
    );
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
  const [votesCast, setVotesCast] = useState(0);
  const [submittedCount, setSubmittedCount] = useState(0);
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
        (snapshot) => {
          setAttendanceCount(snapshot.size);
          setVotesCast(snapshot.docs.filter((d) => d.data().voted).length);
          setSubmittedCount(snapshot.docs.filter((d) => d.data().submitted).length);
        },
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
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  const approved = submissions.filter((s) => s.status === 'approved');
  const pending = submissions.filter((s) => s.status === 'pending');
  useEffect(() => {
    const item = document.querySelector<HTMLElement>('.stage-strip [aria-current=step]');
    if (item?.parentElement)
      item.parentElement.scrollLeft = Math.max(
        0,
        item.offsetLeft - item.parentElement.clientWidth / 2,
      );
  }, [session.stage]);
  if (projector)
    return (
      <Projector session={session} approved={approved} joinUrl={joinUrl} votesCast={votesCast} />
    );
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
      <div className="stage-strip" tabIndex={0} aria-label="Workshop stages">
        {STAGES.map((stage, i) => (
          <span
            key={stage}
            aria-current={session.stage === stage ? 'step' : undefined}
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
              <Timer end={session.stageEndsAt} pausedRemainingMs={session.pausedRemainingMs} />
            </div>
          )}
        </div>
        <div className="live-stage-bar">
          <span>
            {session.pausedRemainingMs != null ? 'Paused · ' : ''}
            {STAGE_INFO[session.stage].title}
          </span>
          <Timer end={session.stageEndsAt} pausedRemainingMs={session.pausedRemainingMs} />
          <Connection />
          {!host && own?.status === 'rejected' && (
            <a className="submission-feedback-link" href="#upload-sticker">
              Sticker returned · View feedback
            </a>
          )}
        </div>
        {session.pausedRemainingMs != null && (
          <p className="notice" role="status">
            Workshop paused. Uploads and voting will resume when your facilitator restarts the
            clock.
          </p>
        )}
        <ErrorMessage message={error} />
        {host ? (
          <>
            <HostControls
              session={session}
              submitted={submittedCount}
              approved={approved.length}
              pending={pending.length}
              votes={votesCast}
              busy={busy}
              act={act}
              actionError={error}
            />
            <div className="host-grid">
              <section className="host-content">
                {session.stage === 'results' ? (
                  <Results session={session} />
                ) : (
                  <>
                    <ReviewDesk submissions={submissions} session={session} busy={busy} act={act} />
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
                <ProgressList members={members} />
              </aside>
            </div>
          </>
        ) : (
          <div className={`participant-experience stage-${session.stage}`}>
            {session.stage === 'lobby' && (
              <div className="welcome-panel">
                <div>
                  <span className="pill">YOU’RE IN. LET’S GET CREATIVE.</span>
                  <h2>
                    A sticker only
                    <br />
                    <em>you could imagine.</em>
                  </h2>
                  <p>
                    Your facilitator will kick things off shortly. You’ll choose a caption, create
                    with your own AI account, and share your finished sticker with the room.
                  </p>
                  <div className="notice">
                    Have ChatGPT, Gemini, or your preferred image tool ready. No selfies needed—use
                    an original fictional character.
                  </div>
                  <Connection />
                </div>
                <StickerArt kind="sun" />
              </div>
            )}
            <div
              className="participant-lab"
              hidden={!['prompt', 'generate', 'submit'].includes(session.stage)}
            >
              <PromptLab session={session} own={own} />
            </div>
            <UploadPanel session={session} own={own} />
            {['gallery', 'vote'].includes(session.stage) && (
              <>
                <div className="gallery-banner" role="status">
                  {session.stage === 'vote'
                    ? vote
                      ? 'Your vote is in. Thanks for cheering on another creator!'
                      : 'One final vote. Enlarge a sticker to inspect it, then choose your favorite.'
                    : 'Explore the Live Sticker Wall. Voting opens when your facilitator is ready.'}
                </div>
                <Gallery
                  submissions={approved}
                  session={session}
                  vote={vote}
                  onVote={(id) => act('vote', { submissionId: id })}
                  busy={busy}
                />
              </>
            )}
            {session.stage === 'results' && <Results session={session} />}
          </div>
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
          <QRCodeSVG
            value={url}
            size={160}
            level="M"
            marginSize={1}
            title={`Join workshop ${session.code}`}
          />
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
  const [copyError, setCopyError] = useState('');
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
      try {
        localStorage.setItem(
          `wow-draft-${session.id}`,
          JSON.stringify({ collectionId, caption, style, character, expiresAt: session.expiresAt }),
        );
      } catch {}
  }, [loaded, session.id, collectionId, caption, style, character]);
  const prompt = makePrompt(caption, style, character);
  const selected = COLLECTIONS.find((c) => c.id === collectionId)!;
  async function copy() {
    setCopyError('');
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      api('progress', { sessionId: session.id, progress: 'prompt-ready' }).catch(() => {});
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopyError(
        'Could not copy automatically. Use Select prompt below, then your device’s Copy command.',
      );
    }
  }
  return (
    <div className="lab-grid">
      <div className="mobile-task-actions">
        <button className="button primary" disabled={!caption.trim()} onClick={copy}>
          {copied ? 'Copied. Open your AI tool' : 'Copy prompt'}
        </button>
        <a
          className="button secondary"
          href={session.stage === 'prompt' ? '#ai-tools' : '#upload-sticker'}
        >
          {session.stage === 'prompt' ? 'Open AI tool' : 'Upload sticker'}
        </a>
        <span role="status">{copied ? 'Prompt copied to clipboard.' : ''}</span>
        {copyError && <a href="#copy-help">Copy needs your help — select prompt</a>}
      </div>
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
                aria-pressed={c.id === collectionId}
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
                aria-pressed={c === caption}
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
                aria-pressed={style === s.id}
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
          <div id="copy-help">
            <ErrorMessage message={copyError} />
            {copyError && (
              <button
                className="button secondary"
                onClick={() => {
                  const input = document.getElementById('generated-prompt') as HTMLTextAreaElement;
                  input.focus();
                  input.select();
                }}
              >
                Select prompt
              </button>
            )}
          </div>
          <p className="sr-only" role="status">
            {copied ? 'Prompt copied to clipboard.' : ''}
          </p>
          <div className="external-tools" id="ai-tools">
            <h3>Your next three steps</h3>
            <ol>
              <li>Open a tool below and sign in to your own account.</li>
              <li>Paste your copied prompt and ask it to create the image.</li>
              <li>
                Download/save the finished image. Return to this workshop tab and choose Upload
                sticker.
              </li>
            </ol>
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
              On a phone, use the AI tool’s Download or Save image option, then choose the saved
              image from Photos or Files here. If your account cannot create images, ask your
              facilitator for help or an example to customize. Keep this workshop tab open; your
              caption and style are saved.
            </p>
          </div>
        </section>
      </aside>
    </div>
  );
}
function Results({ session, projector = false }: { session: Workshop; projector?: boolean }) {
  const [page, setPage] = useState(0);
  const [cycling, setCycling] = useState(false);
  useEffect(() => {
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setCycling(!preference.matches);
    update();
    preference.addEventListener('change', update);
    return () => preference.removeEventListener('change', update);
  }, []);
  const pages = Math.max(1, Math.ceil((session.winners?.length || 0) / 3));
  useEffect(() => {
    if (!projector || pages <= 1 || !cycling) return;
    const timer = setInterval(() => setPage((p) => (p + 1) % pages), 8000);
    return () => clearInterval(timer);
  }, [projector, pages, cycling]);
  const winners = projector ? session.winners?.slice(page * 3, page * 3 + 3) : session.winners;
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
          {winners?.map((w) => (
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
      {projector && pages > 1 && (
        <div className="winner-pages" aria-label="Tied winner pages">
          <button className="button secondary" onClick={() => setCycling((value) => !value)}>
            {cycling ? 'Pause winner pages' : 'Play winner pages'}
          </button>
          <button
            className="button secondary"
            onClick={() => setPage((p) => (p - 1 + pages) % pages)}
          >
            Previous winners
          </button>
          <span>
            Including all ties · {page + 1} / {pages} ·{' '}
            {cycling ? 'changes every 8 seconds' : 'paused'}
          </span>
          <button className="button secondary" onClick={() => setPage((p) => (p + 1) % pages)}>
            Next winners
          </button>
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
  votesCast,
}: {
  session: Workshop;
  approved: Submission[];
  joinUrl: string;
  votesCast: number;
}) {
  return (
    <main className={`projector ${approved.length ? 'has-wall' : ''}`}>
      <header>
        <Brand />
        <Connection />
        <span className="room-code">
          JOIN <b>{session.code}</b>
        </span>
      </header>
      {session.stage === 'results' ? (
        <Results session={session} projector />
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
            <div>
              {session.pausedRemainingMs != null && <strong>PAUSED</strong>}
              <Timer
                end={session.stageEndsAt}
                pausedRemainingMs={session.pausedRemainingMs}
                large
              />
            </div>
          </div>
          <div className="projector-body">
            <div className="projector-showcase">
              {approved.length ? (
                <Gallery submissions={approved} session={session} host projector />
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
            <span>
              {session.participantCount} JOINED · {approved.length} APPROVED · {votesCast} VOTES
              CAST
            </span>
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
