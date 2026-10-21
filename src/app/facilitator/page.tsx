'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { ArrowRight, ShieldCheck, Presentation, Users, Timer } from 'lucide-react';
import { Header, ErrorMessage, Loading } from '@/components/ui';
import { useIdentity } from '@/components/provider';
import { auth, api, isLocal } from '@/lib/firebase';
export default function Facilitator() {
  const { user, ready, facilitator, error: authError } = useIdentity();
  const router = useRouter();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState('The Teacher Sticker Lab');
  const [last, setLast] = useState('');
  useEffect(() => {
    setLast(localStorage.getItem('wow-host-session') || '');
  }, []);
  async function login() {
    setBusy(true);
    setError('');
    try {
      if (isLocal) await signInWithEmailAndPassword(auth, 'host@wow.local', 'Workshop-local-2026');
      else await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const data = await api('create', { title });
      localStorage.setItem('wow-host-session', data.sessionId);
      router.push(`/session/${data.sessionId}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <>
      <Header label="A great room starts with you." />
      <main className="studio">
        <div>
          <span className="eyebrow">
            <span className="edition">BACKSTAGE</span> FACILITATOR STUDIO
          </span>
          <h1>
            You bring the energy.
            <br />
            <em>We’ll bring the WOW.</em>
          </h1>
          <p className="hero-description">
            One room. Fifty creative teachers.
            <br />
            An unforgettable fifteen minutes.
          </p>
          <div className="studio-features">
            <p>
              <Users /> Bring everyone together with one join code.
            </p>
            <p>
              <Timer /> Keep the room in sync, one stage at a time.
            </p>
            <p>
              <Presentation /> Let every little creation have its big moment.
            </p>
          </div>
        </div>
        <section className="panel">
          {!ready ? (
            <Loading />
          ) : facilitator ? (
            <form onSubmit={create}>
              <span className="round-icon">
                <SparkIcon />
              </span>
              <h2>Set the stage.</h2>
              <p>Create a room, invite your teachers, and make it memorable.</p>
              <label>
                Workshop name
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={70}
                  required
                />
              </label>
              <button disabled={busy} className="button primary full">
                {busy ? 'Creating your room…' : 'Create workshop'}
                <ArrowRight size={18} />
              </button>
              {last && (
                <button
                  type="button"
                  className="button secondary full"
                  onClick={() => router.push(`/session/${last}`)}
                >
                  Return to your last workshop
                </button>
              )}
              <button type="button" className="text-button" onClick={() => signOut(auth)}>
                Sign out
              </button>
            </form>
          ) : (
            <>
              <span className="round-icon">
                <ShieldCheck />
              </span>
              <h2>Your facilitator pass.</h2>
              <p>Sign in with an account authorized by your workshop organizer.</p>
              {user && !user.isAnonymous && (
                <p className="notice">
                  This account does not have the facilitator role. Ask your project administrator to
                  authorize your Firebase account.
                </p>
              )}
              <button disabled={busy} onClick={login} className="button primary full">
                {busy
                  ? 'Signing in…'
                  : isLocal
                    ? 'Enter local facilitator studio'
                    : 'Continue with Google'}
                <ArrowRight size={18} />
              </button>
              {isLocal && (
                <p className="fine-print">Local Firebase emulator · development access only</p>
              )}
              {user && (
                <button className="text-button" onClick={() => signOut(auth)}>
                  Sign out / switch account
                </button>
              )}
            </>
          )}
          <ErrorMessage message={error || authError} />
        </section>
      </main>
    </>
  );
}
function SparkIcon() {
  return <span>✦</span>;
}
