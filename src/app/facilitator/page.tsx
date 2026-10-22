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
import { ActivityDashboard } from '@/components/activities';
import { PendingCleanups } from '@/components/cleanup';
import { auth, api, isLocal } from '@/lib/firebase';
export default function Facilitator() {
  const { user, ready, facilitator, error: authError } = useIdentity();
  const router = useRouter();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState('Bengkel Kreatif Guru');
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
      <Header label="Bengkel hebat bermula dengan anda." />
      <main className="studio">
        {facilitator && <ActivityDashboard key={user?.uid} />}
        <div hidden={facilitator}>
          <span className="eyebrow">
            <span className="edition">DI SEBALIK TABIR</span> RUANG FASILITATOR
          </span>
          <h1>
            Anda bawa semangat.
            <br />
            <em>Kita cipta Wow Mean!</em>
          </h1>
          <p className="hero-description">
            Satu ruang. Sehingga 60 guru kreatif.
            <br />
            Cipta pengalaman yang diingati bersama.
          </p>
          <div className="studio-features">
            <p>
              <Users /> Jemput semua peserta dengan satu kod sesi.
            </p>
            <p>
              <Timer /> Selaraskan aktiviti dan masa dari satu tempat.
            </p>
            <p>
              <Presentation /> Beri setiap karya peluang untuk bersinar.
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
              <h2>Cipta sesi ringkas.</h2>
              <p>Mulakan bengkel tanpa templat menggunakan aliran asal.</p>
              <label>
                Tajuk bengkel
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={70}
                  required
                />
              </label>
              <button disabled={busy} className="button primary full">
                {busy ? 'Mencipta sesi…' : 'Cipta Sesi'}
                <ArrowRight size={18} />
              </button>
              {last && (
                <button
                  type="button"
                  className="button secondary full"
                  onClick={() => router.push(`/session/${last}`)}
                >
                  Kembali ke sesi terakhir
                </button>
              )}
              <button type="button" className="text-button" onClick={() => signOut(auth)}>
                Log Keluar
              </button>
            </form>
          ) : (
            <>
              <span className="round-icon">
                <ShieldCheck />
              </span>
              <h2>Masuk ke Ruang Fasilitator</h2>
              <p>Log masuk dengan akaun yang telah diberi akses oleh penganjur bengkel.</p>
              {user && !user.isAnonymous && (
                <p className="notice">
                  Akaun ini belum mempunyai akses fasilitator. Hubungi pentadbir bengkel untuk
                  mendapatkan akses.
                </p>
              )}
              <button disabled={busy} onClick={login} className="button primary full">
                {busy
                  ? 'Sedang log masuk…'
                  : isLocal
                    ? 'Masuk Fasilitator Tempatan'
                    : 'Teruskan dengan Google'}
                <ArrowRight size={18} />
              </button>
              {isLocal && (
                <p className="fine-print">Emulator Firebase tempatan · akses pembangunan sahaja</p>
              )}
              {user && (
                <button className="text-button" onClick={() => signOut(auth)}>
                  Log Keluar / Tukar Akaun
                </button>
              )}
            </>
          )}
          <ErrorMessage message={error || authError} />
        </section>
      </main>
      {facilitator && (
        <div className="studio">
          <PendingCleanups />
        </div>
      )}
    </>
  );
}
function SparkIcon() {
  return <span>✦</span>;
}
