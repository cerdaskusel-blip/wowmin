// This creates a LOCAL emulator account only. Never use these credentials in a live project.
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
const { initializeApp } = await import('firebase-admin/app');
const { getAuth } = await import('firebase-admin/auth');
initializeApp({ projectId: 'demo-wow' });
const auth = getAuth();
const email = 'host@wow.local';
let user;
try {
  user = await auth.getUserByEmail(email);
} catch {
  user = await auth.createUser({
    email,
    password: 'Workshop-local-2026',
    displayName: 'WOW Facilitator',
  });
}
await auth.setCustomUserClaims(user.uid, { facilitator: true });
console.log('Local facilitator ready: host@wow.local / Workshop-local-2026');

export {};
