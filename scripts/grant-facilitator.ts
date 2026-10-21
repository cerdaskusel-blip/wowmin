import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
const uid = process.argv[2];
if (!uid || !process.env.FIREBASE_PROJECT_ID)
  throw new Error(
    'Usage: FIREBASE_PROJECT_ID=your-project npm run grant:facilitator -- <Firebase Auth UID>. Requires trusted Application Default Credentials.',
  );
initializeApp({ credential: applicationDefault(), projectId: process.env.FIREBASE_PROJECT_ID });
const auth = getAuth();
const user = await auth.getUser(uid);
await auth.setCustomUserClaims(uid, { ...user.customClaims, facilitator: true });
console.log('Facilitator role assigned. Sign out and sign in again to refresh claims.');
