import { sweep } from '../src/lib/cleanup';
// Trusted long-running process. Run with the same environment as the Next server.
// There is deliberately no unauthenticated HTTP scheduler endpoint.
async function run() {
  do {
    try {
      await sweep();
    } catch {
      console.error('Cleanup sweep failed; retrying. No participant details logged.');
    }
    if (process.argv.includes('--once')) return;
    await new Promise((resolve) => setTimeout(resolve, 60_000));
  } while (true);
}
await run();
