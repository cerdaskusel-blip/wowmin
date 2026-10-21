'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Sparkles, ArrowUpRight, Radio, WifiOff } from 'lucide-react';
import { useIdentity } from './provider';
export function Brand() {
  return (
    <Link href="/" className="brand" aria-label="WOW home">
      <span className="brand-mark">
        w<span>o</span>w<span className="brand-dot">✳</span>
      </span>
      <span className="brand-tag">
        THE CREATIVE
        <br />
        TEACHER WORKSHOP
      </span>
    </Link>
  );
}
export function Header({ label = 'A little idea. A big WOW.' }: { label?: string }) {
  return (
    <header className="header">
      <Brand />
      <span className="header-note">{label}</span>
      <Link className="host-link" href="/facilitator">
        Facilitator studio <ArrowUpRight size={15} />
      </Link>
    </header>
  );
}
export function ErrorMessage({ message }: { message: string }) {
  return message ? (
    <div className="error" role="alert">
      {message}
    </div>
  ) : null;
}
export function Loading() {
  return (
    <div className="loading">
      <Sparkles className="spin" />
      <p>Getting the good ideas ready…</p>
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
      aria-label={`${Math.floor(remaining / 60)} minutes ${remaining % 60} seconds remaining`}
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
      {online ? 'Live workshop' : 'Offline · reconnecting'}
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
          <span>YOU’VE GOT THIS!</span>
        </>
      ) : kind === 'coffee' ? (
        <>
          <div className="coffee-steam">〰 〰</div>
          <div className="coffee-cup">
            ◡<i />
          </div>
          <span>TEACHER FUEL.</span>
        </>
      ) : (
        <>
          <div className="star-body">★</div>
          <div className="star-face">• ᴗ •</div>
          <span>
            SMALL STEPS.
            <br />
            BIG WOWS.
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
      alt={`${sub.nickname}’s sticker${sub.caption ? `: ${sub.caption}` : ''}`}
      loading="lazy"
    />
  );
}
