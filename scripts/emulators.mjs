import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
const cache = resolve('.firebase/cache');
const config = resolve('.firebase/config');
mkdirSync(cache, { recursive: true });
mkdirSync(config, { recursive: true });
const child = spawn(
  process.execPath,
  [
    'node_modules/firebase-tools/lib/bin/firebase.js',
    'emulators:start',
    '--project',
    'demo-wow',
    '--only',
    'auth,firestore,storage',
  ],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      FIREBASE_EMULATORS_PATH: process.env.FIREBASE_EMULATORS_PATH || cache,
      XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME || config,
      CI: 'true',
    },
  },
);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig));
child.on('exit', (code) => process.exit(code ?? 1));
