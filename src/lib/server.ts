import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, store } from './admin';
import { createHash } from 'crypto';
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function requireOrigin(req: NextRequest) {
  const origin = req.headers.get('origin');
  const expected = process.env.NEXT_PUBLIC_APP_URL
    ? new URL(process.env.NEXT_PUBLIC_APP_URL).origin
    : `${req.nextUrl.protocol}//${req.headers.get('host')}`;
  if (!origin || origin !== expected) throw new ApiError(403, 'Request origin is not allowed.');
}
export async function identity(req: NextRequest, cookie = false) {
  const token =
    req.headers.get('authorization')?.replace(/^Bearer /, '') ||
    (cookie ? req.cookies.get('wow-token')?.value : undefined);
  if (!token) throw new ApiError(401, 'Please sign in again.');
  try {
    return await adminAuth.verifyIdToken(token, true);
  } catch {
    throw new ApiError(401, 'Your sign-in expired. Please sign in again.');
  }
}
export function failure(error: unknown) {
  if (error instanceof ApiError)
    return NextResponse.json({ error: error.message }, { status: error.status });
  if (error instanceof Error && error.name === 'ZodError')
    return NextResponse.json({ error: 'Check the details and try again.' }, { status: 400 });
  const code = (error as { code?: unknown })?.code;
  console.error('Workshop request failed', typeof code === 'number' ? code : 'unexpected');
  if (code === 10 || code === 14)
    return NextResponse.json({ error: 'The workshop is busy. Please retry.' }, { status: 503 });
  return NextResponse.json(
    { error: 'The workshop service is unavailable. Please try again.' },
    { status: 500 },
  );
}
export async function limit(
  key: string,
  max: number,
  windowMs = 60_000,
  uid?: string,
  sessionId?: string,
) {
  const id = createHash('sha256').update(key).digest('hex');
  const ref = store.doc(`limits/${id}`);
  const now = Date.now();
  await store.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const old = snap.data();
    if (sessionId) {
      const session = (await tx.get(sessionRef(sessionId))).data();
      if (!session || session.lifecycle === 'closing' || session.expiresAt <= Date.now())
        throw new ApiError(410, 'This workshop has ended.');
    }
    if (uid) {
      const identity = await tx.get(store.doc(`identities/${uid}`));
      try {
        await adminAuth.getUser(uid);
      } catch {
        throw new ApiError(401, 'Please sign in again.');
      }
      if (identity.data()?.deleting)
        throw new ApiError(410, 'Your previous workshop has ended. Please rejoin.');
    }
    const active = old && old.resetAt > now;
    const count = active ? old.count : 0;
    if (count >= max) throw new ApiError(429, 'A little too fast! Wait a minute and try again.');
    tx.set(ref, {
      count: count + 1,
      resetAt: active ? old.resetAt : now + windowMs,
      ...(uid ? { uid } : {}),
      ...(sessionId ? { sessionId } : {}),
    });
  });
}
export function sessionRef(id: string) {
  if (!/^[a-zA-Z0-9]{20}$/.test(id)) throw new ApiError(400, 'Invalid workshop.');
  return store.doc(`sessions/${id}`);
}
export async function access(id: string, uid: string) {
  const ref = sessionRef(id);
  const snap = await ref.get();
  const session = snap.data();
  if (!session || session.lifecycle === 'closing' || session.expiresAt <= Date.now())
    throw new ApiError(404, 'This workshop has ended or does not exist.');
  const host = session.hostId === uid;
  if (!host && !(await ref.collection('members').doc(uid).get()).exists)
    throw new ApiError(403, 'Join this workshop first.');
  return { ref, session, host };
}

export async function boundedText(req: NextRequest, maxBytes: number) {
  const reader = req.body?.getReader();
  if (!reader) throw new ApiError(400, 'Request body is required.');
  const parts: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.length;
    if (size > maxBytes) {
      await reader.cancel();
      throw new ApiError(413, 'Request is too large.');
    }
    parts.push(part.value);
  }
  return Buffer.concat(parts).toString('utf8');
}
