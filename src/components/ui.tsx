'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Sparkles, ArrowUpRight, Radio, WifiOff } from 'lucide-react';
import { STAGES, STAGE_INFO, isActivityStage } from '@/lib/workshop';
import { mesejMelayu } from '@/lib/bahasa';
import { useIdentity } from './provider';
export function Tagline() {
  return (
    <span className="brand-tagline">
      <span>Cipta</span> <b aria-hidden="true">|</b> <span>Kongsi</span> <b aria-hidden="true">|</b>{' '}
      <span>Undi</span>
    </span>
  );
}
export function Brand() {
  return (
    <Link href="/" className="brand">
      <span className="brand-name">Wow Mean!</span>
      <Tagline />
      <span className="sr-only"> — Halaman Utama</span>
    </Link>
  );
}
export function Header({ label = 'Idea kecil, inspirasi besar.' }: { label?: string }) {
  return (
    <header className="header">
      <Brand />
      <span className="header-note">{label}</span>
      <Link className="host-link" href="/facilitator">
        Ruang Fasilitator <ArrowUpRight size={15} />
      </Link>
    </header>
  );
}
export function ErrorMessage({ message }: { message: string }) {
  return message ? (
    <div className="error" role="alert">
      {mesejMelayu(message)}
    </div>
  ) : null;
}
export function Loading() {
  return (
    <div className="loading">
      <Sparkles className="spin" />
      <p>Sedang menyediakan ruang kreatif…</p>
    </div>
  );
}
export function Timer({
  end,
  large = false,
  pausedRemainingMs,
}: {
  end: number;
  large?: boolean;
  pausedRemainingMs?: number | null;
}) {
  const { offset } = useIdentity();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);
  const remaining = Math.max(0, Math.ceil((pausedRemainingMs ?? end - now - offset) / 1000));
  return (
    <span
      className={`timer ${large ? 'large' : ''} ${remaining < 30 ? 'urgent' : ''}`}
      aria-label={`${Math.floor(remaining / 60)} minit ${remaining % 60} saat berbaki`}
    >
      {String(Math.floor(remaining / 60)).padStart(2, '0')}
      <span>:</span>
      {String(remaining % 60).padStart(2, '0')}
    </span>
  );
}
export function Connection() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  return (
    <span className={`connection ${online ? '' : 'offline'}`}>
      {online ? <Radio size={13} /> : <WifiOff size={13} />}{' '}
      {online ? 'Sesi langsung' : 'Luar talian · menyambung semula'}
    </span>
  );
}
export function StickerArt({
  kind = 'sun',
  small = false,
}: {
  kind?: 'sun' | 'coffee' | 'star';
  small?: boolean;
}) {
  return (
    <div className={`sticker-art ${kind} ${small ? 'small' : ''}`} aria-hidden="true">
      {kind === 'sun' ? (
        <>
          <div className="sun-rays">✹</div>
          <div className="face">
            <i />
            <i />
            <b>ᴗ</b>
          </div>
          <span>ANDA BOLEH!</span>
        </>
      ) : kind === 'coffee' ? (
        <>
          <div className="coffee-steam">〰 〰</div>
          <div className="coffee-cup">
            ◡<i />
          </div>
          <span>SEMANGAT GURU.</span>
        </>
      ) : (
        <>
          <div className="star-body">★</div>
          <div className="star-face">• ᴗ •</div>
          <span>
            LANGKAH KECIL.
            <br />
            IDEA BESAR.
          </span>
        </>
      )}
    </div>
  );
}

export function useNow() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, []);
  return now;
}
export function StickerImage({
  sessionId,
  sub,
}: {
  sessionId: string;
  sub: import('@/lib/workshop').Submission;
}) {
  return (
    <img
      className="submission-image"
      src={`/api/image?sessionId=${sessionId}&submissionId=${sub.id}&v=${sub.createdAt}`}
      alt={`Karya ${sub.nickname}${sub.caption ? `: ${sub.caption}` : ''}`}
      loading="lazy"
    />
  );
}

export function WorkshopBudget({ session }: { session: import('@/lib/workshop').Workshop }) {
  const now = useNow();
  const { offset } = useIdentity();
  const seconds =
    Math.ceil(
      (session.pausedRemainingMs ?? Math.max(0, session.stageEndsAt - now - offset)) / 1000,
    ) +
    STAGES.slice(STAGES.indexOf(session.stage) + 1).reduce(
      (sum, stage) =>
        sum + (session.activity && isActivityStage(stage) ? 0 : STAGE_INFO[stage].seconds),
      0,
    );
  return (
    <span className="workshop-budget">
      Anggaran masa hingga tamat: {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}
    </span>
  );
}
