'use client';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
const app =
  getApps()[0] ??
  initializeApp({
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  });
export const auth = getAuth(app);
export const db = getFirestore(app);
export const isLocal = process.env.NEXT_PUBLIC_USE_EMULATORS === 'true';
const marker = globalThis as typeof globalThis & { wowConnected?: boolean };
if (isLocal && !marker.wowConnected) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  marker.wowConnected = true;
}
export async function api(action: string, data: Record<string, unknown> = {}) {
  const token = await auth.currentUser?.getIdToken();
  const response = await fetch('/api/action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ action, ...data }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? 'Something went wrong. Try again.');
  return result;
}
