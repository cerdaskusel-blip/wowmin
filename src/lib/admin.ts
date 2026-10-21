import { getApps, initializeApp, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
const emulated = !!process.env.FIREBASE_AUTH_EMULATOR_HOST;
if (
  emulated &&
  (process.env.NEXT_PUBLIC_USE_EMULATORS !== 'true' ||
    !process.env.FIREBASE_PROJECT_ID?.startsWith('demo-'))
)
  throw new Error('Emulators require an explicit demo project.');
const app =
  getApps()[0] ??
  initializeApp({
    projectId: process.env.FIREBASE_PROJECT_ID,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    ...(!emulated ? { credential: applicationDefault() } : {}),
  });
export const adminAuth = getAuth(app);
export const store = getFirestore(app);
export const bucket = getStorage(app).bucket();

// A tracked upload issues exactly one non-resumable write. Unknown outcomes
// stay in the operation ledger; background retries must not recreate deleted objects.
bucket.storage.retryOptions.autoRetry = false;
