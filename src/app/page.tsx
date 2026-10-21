'use client';
import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signInAnonymously } from 'firebase/auth';
import {
  ArrowRight,
  ArrowDownRight,
  ArrowUpRight,
  Check,
  MousePointer2,
  Sparkles,
  Heart,
  Zap,
} from 'lucide-react';
import { Header, StickerArt, ErrorMessage } from '@/components/ui';
import Link from 'next/link';
import { doc, getDoc } from 'firebase/firestore';
import { useIdentity } from '@/components/provider';
import { api, auth, db } from '@/lib/firebase';
function Join() {
  const search = useSearchParams();
  const router = useRouter();
  const { user } = useIdentity();
  const [resume, setResume] = useState<{ id: string; title: string } | null>(null);
  useEffect(() => {
    if (!user) {
      setResume(null);
      return;
    }
    let active = true;
    try {
      const id = localStorage.getItem('wow-last-session');
      if (id && /^[\w-]+$/.test(id))
        getDoc(doc(db, 'sessions', id))
          .then((s) => {
            if (active && s.exists() && s.data().expiresAt > Date.now())
              setResume({ id, title: s.data().title });
          })
          .catch(() => {});
    } catch {}
    return () => {
      active = false;
    };
  }, [user]);
  const [code, setCode] = useState('');
  const [nickname, setNickname] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    setCode((search.get('code') || '').toUpperCase());
  }, [search]);
  async function join(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (!auth.currentUser) await signInAnonymously(auth);
      const data = await api('join', { code: code.toUpperCase().replace(/\s/g, ''), nickname });
      try {
        localStorage.setItem('wow-last-session', data.sessionId);
      } catch {}
      router.push(`/session/${data.sessionId}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <form className="join-card" onSubmit={join}>
      {resume && (
        <div className="resume-session">
          <p>Your workshop is still here.</p>
          <Link className="button secondary full" href={`/session/${resume.id}`}>
            Resume workshop · {resume.title}
          </Link>
        </div>
      )}
      <div className="join-heading">
        <span className="live-dot" /> YOUR SEAT AT THE CREATIVE TABLE
      </div>
      <h2>
        Let’s make something <em>wow.</em>
      </h2>
      <p>Grab the code on your facilitator’s screen. You’re in.</p>
      <div className="form-row">
        <label>
          Session code
          <input
            autoComplete="off"
            name="code"
            placeholder="ABC123"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            maxLength={6}
            minLength={6}
            pattern="[A-Z2-9]{6}"
            required
            className="code-input"
          />
        </label>
        <label>
          Your nickname
          <input
            name="nickname"
            autoComplete="nickname"
            placeholder="What should we call you?"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            maxLength={24}
            required
          />
        </label>
      </div>
      <ErrorMessage message={error} />
      <button className="button primary full" disabled={busy}>
        {busy ? 'Joining the room…' : 'Join the workshop'} <ArrowRight size={19} />
      </button>
      <div className="join-foot">
        <Check size={14} /> No account to create <span>·</span> Just bring your imagination
      </div>
    </form>
  );
}
export default function Home() {
  return (
    <>
      <Header />
      <main className="home">
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow">
              <span className="edition">WOW #1</span> THE STICKER LAB
            </div>
            <h1>
              Big ideas.
              <br />
              Tiny stickers.
              <br />
              <span>
                That’s your <em>wow.</em>
                <svg viewBox="0 0 380 22" preserveAspectRatio="none">
                  <path d="M3 15 Q165 -4 375 9 M40 21 Q200 7 340 15" />
                </svg>
              </span>
            </h1>
            <p className="hero-description">
              Turn your teacher energy into a sticker worth sharing.
              <br className="desktop" /> A live, hands-on AI creativity adventure. Made together.
            </p>
            <div className="hero-chips">
              <span>
                <Zap size={15} /> 15 minutes
              </span>
              <span>
                <Heart size={15} /> Endless teacher energy
              </span>
              <span>
                <Sparkles size={15} /> Zero design skills needed
              </span>
            </div>
            <Suspense>
              <Join />
            </Suspense>
          </div>
          <div className="hero-art">
            <span className="hand-note">
              your next great idea
              <br />
              looks good on a sticker{' '}
              <span>
                <ArrowDownRight size={38} />
              </span>
            </span>
            <div className="art-orbit" />
            <div className="floating-sticker sticker-one">
              <StickerArt kind="sun" />
            </div>
            <div className="floating-sticker sticker-two">
              <StickerArt kind="coffee" />
            </div>
            <div className="floating-sticker sticker-three">
              <StickerArt kind="star" />
            </div>
            <span className="spark spark-one">✦</span>
            <span className="spark spark-two">✳</span>
            <span className="spark spark-three">✧</span>
            <div className="cursor-tag">
              <MousePointer2 size={20} fill="currentColor" /> your imagination, here
            </div>
            <div className="art-caption">A FEW POSSIBILITIES. YOURS IS NEXT.</div>
          </div>
        </section>
        <section className="journey">
          <div className="journey-title">
            <span className="eyebrow">FROM “WHAT IF” TO “I MADE THAT”</span>
            <h2>Your 15-minute creative adventure.</h2>
          </div>
          <div className="journey-grid">
            {[
              {
                n: '01',
                title: 'Find your words',
                text: 'Pick a caption. Add your personality.',
                icon: '✎',
                color: 'peach',
              },
              {
                n: '02',
                title: 'Make your magic',
                text: 'Take your prompt to your favorite AI.',
                icon: '✦',
                color: 'lavender',
              },
              {
                n: '03',
                title: 'Share the good stuff',
                text: 'Upload your sticker. Enjoy the gallery.',
                icon: '▧',
                color: 'mint',
              },
              {
                n: '04',
                title: 'Give a little love',
                text: 'Vote, celebrate, and discover the WOWs.',
                icon: '♡',
                color: 'yellow',
              },
            ].map((s) => (
              <div className="journey-step" key={s.n}>
                <span className={`step-icon ${s.color}`}>{s.icon}</span>
                <div>
                  <small>STEP {s.n}</small>
                  <h3>{s.title}</h3>
                  <p>{s.text}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
        <footer>
          <BrandFooter />
          <span>Your AI account. Your imagination. Our creative playground.</span>
          <span>
            Made for teachers, together. <ArrowUpRight size={12} />
          </span>
        </footer>
      </main>
    </>
  );
}
function BrandFooter() {
  return <b className="footer-logo">wow ✳</b>;
}
