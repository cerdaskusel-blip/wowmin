'use client';
import { STAGE_COPY, COLLECTION_COPY, STYLE_COPY } from '@/lib/bahasa';
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
  makePrompt,
  Workshop,
  Member,
  Submission,
  nextStage,
  isActivityStage,
} from '@/lib/workshop';
import { useIdentity } from './provider';
import { Brand, Timer, Connection, ErrorMessage, Loading, StickerImage, useNow } from './ui';
import { ActivityPrompts } from './activity-prompts';
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
        } else setError('Tidak dapat bersambung. Semak internet anda dan cuba semula.');
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
        <h1>Bengkel ini telah tamat</h1>
        <p>Minta fasilitator memadam data sementara sesi ini dan berkongsi kod sesi baharu.</p>
        <Link className="button primary" href="/">
          Sertai Bengkel Lain
        </Link>
      </main>
    );
  if (error || authError)
    return (
      <main className="center-message">
        <ErrorMessage message={error || authError} />
        <Link href="/" className="button secondary">
          Kembali ke Masuk Sesi
        </Link>
      </main>
    );
  if (!user)
    return (
      <main className="center-message">
        <h1>Ruang kreatif anda menanti.</h1>
        <p>Masukkan kod sesi untuk meneruskan.</p>
        <Link href="/" className="button primary">
          Masuk Bengkel
        </Link>
      </main>
    );
  if (!session) return <Loading />;
  if (projector && session.hostId !== user.uid)
    return (
      <main className="center-message">
        <h1>Akses fasilitator diperlukan.</h1>
        <Link href="/facilitator">Buka Ruang Fasilitator</Link>
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
        () => setError('Senarai kehadiran tidak dapat dimuatkan. Sila muat semula.'),
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
      () => setError('Sambungan galeri terganggu. Sila muat semula.'),
    );
  }, [host, session.id]);
  useEffect(() => {
    if (host)
      return onSnapshot(
        collection(db, 'sessions', session.id, 'members'),
        (s) => setMembers(s.docs.map((d) => d.data() as Member)),
        () => setError('Kemajuan peserta tidak dapat dimuatkan.'),
      );
    const off = onSnapshot(
      doc(db, 'sessions', session.id, 'submissions', user!.uid),
      (s) => setOwn(s.exists() ? (s.data() as Submission) : null),
      () => setError('Penghantaran anda tidak dapat dimuatkan.'),
    );
    const offVote = onSnapshot(
      doc(db, 'sessions', session.id, 'votes', user!.uid),
      (s) => setVote(s.data()?.submissionId ?? null),
      () => setError('Status undian anda tidak dapat dimuatkan.'),
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
          KOD <b>{session.code}</b>
        </span>
      </header>
      <section className="stage-strip" tabIndex={0} aria-label="Peringkat bengkel">
        {STAGES.map((stage, i) => (
          <span
            key={stage}
            aria-current={session.stage === stage ? 'step' : undefined}
            className={
              session.stage === stage ? 'active' : STAGES.indexOf(session.stage) > i ? 'done' : ''
            }
          >
            <b>{STAGES.indexOf(session.stage) > i ? <Check size={12} /> : i + 1}</b>
            {['Mula', 'Prompt anda', 'Cipta', 'Hantar', 'Galeri', 'Undi', 'Raikan'][i]}
          </span>
        ))}
      </section>
      <main className={`room-main ${host ? 'host-main' : ''}`}>
        <div className="stage-heading">
          <div>
            <span className="eyebrow">
              {host ? 'DASHBOARD FASILITATOR' : 'RUANG KREATIF ANDA'} · Wow Mean!
            </span>
            <h1>
              {!host && session.activity && isActivityStage(session.stage)
                ? session.activity.title
                : STAGE_COPY[session.stage].title}
              <span className="coral-dot">.</span>
            </h1>
            <p
              style={
                session.activity && !host && isActivityStage(session.stage)
                  ? { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }
                  : undefined
              }
            >
              {!host && session.activity && isActivityStage(session.stage)
                ? session.activity.description
                : STAGE_COPY[session.stage].hint}
            </p>
          </div>
          {session.stage !== 'results' && (
            <div className="countdown">
              <small>
                <Clock size={12} />{' '}
                {session.activity && isActivityStage(session.stage)
                  ? 'MASA AKTIVITI BERBAKI'
                  : 'MASA PERINGKAT BERBAKI'}
              </small>
              <Timer end={session.stageEndsAt} pausedRemainingMs={session.pausedRemainingMs} />
            </div>
          )}
        </div>
        <div className="live-stage-bar">
          <span>
            {session.pausedRemainingMs != null ? 'Dijeda · ' : ''}
            {STAGE_COPY[session.stage].title}
          </span>
          <Timer end={session.stageEndsAt} pausedRemainingMs={session.pausedRemainingMs} />
          <Connection />
          {!host && own?.status === 'rejected' && (
            <a className="submission-feedback-link" href="#upload-sticker">
              Karya dipulangkan · Lihat maklum balas
            </a>
          )}
        </div>
        {session.pausedRemainingMs != null && (
          <p className="notice" role="status">
            Bengkel dijeda. Penghantaran dan undian akan disambung apabila fasilitator memulakan
            semula pemasa.
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
            {session.stage === 'lobby' && !session.activity && (
              <div className="welcome-panel">
                <div>
                  <span className="pill">ANDA SUDAH MASUK. JOM BERKARYA!</span>
                  <h2>
                    Satu karya yang
                    <br />
                    <em>mencerminkan idea anda.</em>
                  </h2>
                  <p>
                    Fasilitator akan memulakan aktiviti sebentar lagi. Pilih kapsyen, cipta
                    menggunakan akaun AI sendiri dan kongsi hasil anda di sini.
                  </p>
                  <div className="notice">
                    Sediakan ChatGPT, Gemini atau aplikasi AI pilihan anda. Gunakan karakter rekaan;
                    gambar swafoto tidak diperlukan.
                  </div>
                  <Connection />
                </div>
                <Sparkles className="workshop-spark" size={80} aria-hidden="true" />
              </div>
            )}
            {session.activity ? (
              isActivityStage(session.stage) && <ActivityPrompts session={session} />
            ) : (
              <div
                className="participant-lab"
                hidden={!['prompt', 'generate', 'submit'].includes(session.stage)}
              >
                <PromptLab session={session} own={own} />
              </div>
            )}
            <UploadPanel session={session} own={own} />
            {['gallery', 'vote'].includes(session.stage) && (
              <>
                <div className="gallery-banner" role="status">
                  {session.stage === 'vote'
                    ? vote
                      ? 'Undian anda telah dikira. Terima kasih kerana meraikan karya peserta lain!'
                      : 'Anda mempunyai satu undian sahaja. Besarkan gambar dan pilih karya kegemaran anda.'
                    : 'Terokai Galeri Karya. Fasilitator akan membuka undian apabila semua bersedia.'}
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
      <footer className="room-footer">
        Wow Mean! <span>Cipta bersama. Raikan bersama.</span>
        <Connection />
      </footer>
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
      <span className="eyebrow">JOM SERTAI BENGKEL</span>
      <h3>Imbas. Masuk. Cipta.</h3>
      {url && (
        <div className="qr">
          <QRCodeSVG
            value={url}
            size={160}
            level="M"
            marginSize={1}
            title={`Sertai bengkel ${session.code}`}
          />
        </div>
      )}
      <p>Atau masukkan kod sesi</p>
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
        <Copy size={14} /> {copied ? 'Pautan disalin!' : 'Salin Pautan Jemputan'}
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
        'Salinan automatik gagal. Tekan Pilih Prompt, kemudian gunakan arahan Salin pada peranti anda.',
      );
    }
  }
  return (
    <div className="lab-grid">
      <div className="mobile-task-actions">
        <button className="button primary" disabled={!caption.trim()} onClick={copy}>
          {copied ? 'Disalin! Buka aplikasi AI' : 'Salin Prompt'}
        </button>
        <a
          className="button secondary"
          href={session.stage === 'prompt' ? '#ai-tools' : '#upload-sticker'}
        >
          {session.stage === 'prompt' ? 'Buka Aplikasi AI' : 'Muat Naik Karya'}
        </a>
        <span role="status">{copied ? 'Prompt berjaya disalin.' : ''}</span>
        {copyError && <a href="#copy-help">Salinan gagal — pilih teks prompt</a>}
      </div>
      <div>
        <section className="panel lab-panel">
          <div className="section-label">
            <h2>
              <span className="number">01</span> Pilih kapsyen anda
            </h2>
            <small>TAMBAH SENTUHAN ANDA</small>
          </div>
          <div className="collection-tabs" role="group" aria-label="Koleksi kapsyen">
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
                {COLLECTION_COPY[c.id].name}
              </button>
            ))}
          </div>
          <p>{COLLECTION_COPY[selected.id].description}</p>
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
            Ubah kapsyen anda <span>{caption.length}/120</span>
            <input
              maxLength={120}
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Kapsyen untuk karya anda…"
            />
          </label>
        </section>
        <section className="panel lab-panel">
          <h2>
            <span className="number">02</span> Pilih gaya anda
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
                {STYLE_COPY[s.id]}
                {style === s.id && <Check size={14} />}
              </button>
            ))}
          </div>
          <label>
            Karakter rekaan anda
            <input
              maxLength={100}
              value={character}
              onChange={(e) => setCharacter(e.target.value)}
              placeholder="Burung hantu berkaca mata yang gemar kopi"
            />
          </label>
          <p className="fine-print">
            Pilih maskot, haiwan atau guru rekaan. Jangan masukkan identiti sebenar atau maklumat
            murid dalam prompt.
          </p>
        </section>
      </div>
      <aside>
        <section className="panel prompt-panel">
          <span className="eyebrow">
            <Sparkles size={14} /> IDEA ANDA SEDIA DIGUNAKAN
          </span>
          <h2>Kreativiti bermula di sini.</h2>
          <div className="prompt-preview">
            <span className="pill">{STYLE_COPY[style]} · KARAKTER REKAAN</span>
            <blockquote>“{caption || 'Kapsyen anda di sini'}”</blockquote>
          </div>
          <label htmlFor="generated-prompt">Prompt gambar AI anda</label>
          <textarea
            id="generated-prompt"
            className="generated-prompt"
            readOnly
            value={prompt}
            rows={6}
          />
          <button className="button primary full" onClick={copy} disabled={!caption.trim()}>
            <Copy size={17} />
            {copied ? 'Disalin! Jom cipta karya anda' : 'Salin Prompt Saya'}
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
                Pilih Prompt
              </button>
            )}
          </div>
          <p className="sr-only" role="status">
            {copied ? 'Prompt berjaya disalin.' : ''}
          </p>
          <div className="external-tools" id="ai-tools">
            <h3>Tiga langkah seterusnya</h3>
            <ol>
              <li>Buka aplikasi di bawah dan log masuk ke akaun anda sendiri.</li>
              <li>Tampal prompt yang disalin dan minta AI menghasilkan gambar.</li>
              <li>
                Simpan gambar yang siap. Kembali ke tab bengkel ini dan pilih Muat Naik Karya.
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
              Pada telefon, pilih Download atau Save Image dalam aplikasi AI. Kemudian pilih gambar
              daripada Foto atau Fail di sini. Jika akaun anda tidak boleh menghasilkan gambar,
              minta bantuan fasilitator. Biarkan tab bengkel ini terbuka; kapsyen dan gaya anda
              disimpan.
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
        <Trophy size={18} /> INILAH PILIHAN KITA
      </span>
      <h2>
        Idea anda.
        <br />
        <em>Tepukan untuk semua!</em>
      </h2>
      <p>
        {session.totalVotes || 0} undian. {session.participantCount} peserta kreatif. Tepukan untuk
        semua!
      </p>
      {session.winners?.length ? (
        <div className="podium">
          {winners?.map((w) => (
            <article key={w.id} className={`winner rank-${w.rank}`}>
              <div className="winner-rank">
                {w.rank === 1 ? '★' : w.rank}{' '}
                <span>
                  {w.rank === 1
                    ? 'PILIHAN UTAMA'
                    : w.rank === 2
                      ? 'KEGEMARAN RAMAI'
                      : 'IDEA KREATIF'}
                </span>
              </div>
              <img
                src={`/api/image?sessionId=${session.id}&submissionId=${w.id}`}
                alt={`Karya pemenang oleh ${w.nickname}`}
              />
              <h3>{w.nickname}</h3>
              <p>
                {w.votes} undian · Kedudukan {w.rank}
              </p>
            </article>
          ))}
        </div>
      ) : (
        <div className="panel">
          <h3>Setiap karya diraikan.</h3>
          <p>Tiada undian direkodkan. Kita tetap raikan semua idea yang dikongsi bersama!</p>
        </div>
      )}
      {projector && pages > 1 && (
        <div className="winner-pages" aria-label="Halaman pemenang seri">
          <button className="button secondary" onClick={() => setCycling((value) => !value)}>
            {cycling ? 'Jeda Paparan Pemenang' : 'Sambung Paparan Pemenang'}
          </button>
          <button
            className="button secondary"
            onClick={() => setPage((p) => (p - 1 + pages) % pages)}
          >
            Pemenang Sebelum
          </button>
          <span>
            Termasuk semua keputusan seri · {page + 1} / {pages} ·{' '}
            {cycling ? 'bertukar setiap 8 saat' : 'dijeda'}
          </span>
          <button className="button secondary" onClick={() => setPage((p) => (p + 1) % pages)}>
            Pemenang Seterusnya
          </button>
        </div>
      )}
      <div className="results-note">
        Bawa inspirasi ini ke bilik darjah anda. <Heart size={17} />
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
          SERTAI <b>{session.code}</b>
        </span>
      </header>
      {session.stage === 'results' ? (
        <Results session={session} projector />
      ) : (
        <>
          <div className="projector-heading">
            <div>
              <span className="eyebrow">Wow Mean! · Cipta | Kongsi | Undi</span>
              <h1>
                {STAGE_COPY[session.stage].title}
                <span className="coral-dot">.</span>
              </h1>
              <p>{STAGE_COPY[session.stage].hint}</p>
            </div>
            <div>
              {session.pausedRemainingMs != null && <strong>DIJEDA</strong>}
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
                  <Sparkles className="workshop-spark" size={80} aria-hidden="true" />
                  <h2>
                    {session.stage === 'lobby'
                      ? 'Idea hebat anda bermula di sini.'
                      : 'Idea menarik sedang dihasilkan.'}
                  </h2>
                  <p>{session.participantCount} peserta. Begitu banyak idea untuk dikongsi.</p>
                </>
              )}
            </div>
            <JoinPanel session={session} url={joinUrl} />
          </div>
          <footer>
            <span>
              {session.participantCount} PESERTA · {approved.length} DILULUSKAN · {votesCast} UNDIAN
            </span>
            <span>
              {session.stage === 'vote'
                ? 'SATU PESERTA. SATU UNDIAN. RAIKAN KARYA BERSAMA.'
                : 'Cipta | Kongsi | Undi'}
            </span>
          </footer>
        </>
      )}
    </main>
  );
}
