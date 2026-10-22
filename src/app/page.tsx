'use client';
import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signInAnonymously, signOut } from 'firebase/auth';
import { ArrowRight, LogIn, Presentation, Check } from 'lucide-react';
import { ErrorMessage, Tagline } from '@/components/ui';
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
          .catch(() => {
            localStorage.removeItem(`wow-draft-${id}`);
            localStorage.removeItem('wow-last-session');
          });
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
    if (search.get('code'))
      requestAnimationFrame(() =>
        document.getElementById('masuk-sesi')?.scrollIntoView({ block: 'center' }),
      );
  }, [search]);
  async function join(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (auth.currentUser?.isAnonymous) {
        try {
          await auth.currentUser.reload();
        } catch {
          await signOut(auth);
        }
      }
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
    <form id="masuk-sesi" className="join-card" aria-labelledby="join-title" onSubmit={join}>
      {resume && (
        <div className="resume-session">
          <p>Bengkel anda masih tersedia.</p>
          <Link className="button secondary full" href={`/session/${resume.id}`}>
            Sambung bengkel · {resume.title}
          </Link>
        </div>
      )}
      <div className="join-heading">
        <span className="live-dot" /> JOM BERKARYA BERSAMA
      </div>
      <h2 id="join-title">
        Bawa idea anda menjadi <em>karya.</em>
      </h2>
      <p>Masukkan kod daripada fasilitator dan nama paparan anda.</p>
      <div className="form-row">
        <label>
          Kod Sesi
          <input
            autoComplete="off"
            name="code"
            placeholder="ABC123"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            maxLength={32}
            minLength={6}
            pattern="[A-Z2-9]{6,32}"
            required
            className="code-input"
          />
        </label>
        <label>
          Nama Paparan
          <input
            name="nickname"
            autoComplete="nickname"
            placeholder="Nama yang akan dipaparkan pada karya"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            maxLength={24}
            required
          />
        </label>
      </div>
      <ErrorMessage message={error} />
      <button className="button primary full" disabled={busy}>
        {busy ? 'Menyertai sesi…' : 'Masuk Bengkel'} <ArrowRight size={19} />
      </button>
      <div className="join-foot">
        <Check size={14} /> Tidak perlu daftar akaun <span>·</span> Bawa idea anda sahaja
      </div>
    </form>
  );
}
export default function Home() {
  return (
    <main className="landing-page">
      <section className="landing-hero" aria-labelledby="landing-title">
        <div className="landing-corners" aria-hidden="true" />
        <div className="landing-content">
          <h1 id="landing-title" className="landing-name">
            Wow Mean!
          </h1>
          <div className="landing-tagline">
            <Tagline />
          </div>
          <nav className="landing-actions" aria-label="Pilih ruang bengkel">
            <a href="#masuk-sesi" className="landing-action join-action">
              <LogIn aria-hidden="true" />
              <span>Masuk Sesi</span>
              <ArrowRight className="action-arrow" aria-hidden="true" />
            </a>
            <Link href="/facilitator" className="landing-action facilitator-action">
              <Presentation aria-hidden="true" />
              <span>Ruang Fasilitator</span>
              <ArrowRight className="action-arrow" aria-hidden="true" />
            </Link>
          </nav>
        </div>
      </section>
      <section className="landing-join" aria-label="Masuk bengkel">
        <Suspense>
          <Join />
        </Suspense>
        <p className="landing-help">
          Cipta dengan akaun AI sendiri. Kongsi satu karya. Undi bersama.
        </p>
      </section>
      <footer className="landing-footer">
        Wow Mean! <span>Cipta | Kongsi | Undi</span>
      </footer>
    </main>
  );
}
