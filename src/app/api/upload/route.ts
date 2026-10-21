import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { randomUUID } from 'crypto';
import { assertActive } from '@/lib/lifecycle';
import { bucket, store } from '@/lib/admin';
import { identity, requireOrigin, failure, access, limit, ApiError } from '@/lib/server';
import { acceptingSubmissions, Workshop } from '@/lib/workshop';
export const runtime = 'nodejs';
export async function POST(req: NextRequest) {
  let savedPath: string | undefined;
  let operation: FirebaseFirestore.DocumentReference | undefined;
  let storageSettled = false;
  try {
    requireOrigin(req);
    const user = await identity(req);
    await limit(`upload:${user.uid}`, 5, 60_000, user.uid);
    const reader = req.body?.getReader();
    if (!reader) throw new ApiError(400, 'Choose a sticker image.');
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.length;
      if (size > 6 * 1024 * 1024) {
        await reader.cancel();
        throw new ApiError(413, 'Choose an image under 5 MB.');
      }
      chunks.push(part.value);
    }
    const form = await new Response(Buffer.concat(chunks), {
      headers: { 'Content-Type': req.headers.get('content-type') || '' },
    }).formData();
    const id = String(form.get('sessionId') ?? '');
    const caption = String(form.get('caption') ?? '').trim();
    if (caption.length > 120) throw new ApiError(400, 'Keep captions under 120 characters.');
    const file = form.get('image');
    if (!(file instanceof File) || file.size > 5 * 1024 * 1024 || !file.size)
      throw new ApiError(400, 'Choose a PNG, JPEG, or WebP image under 5 MB.');
    const { ref, host, session } = await access(id, user.uid);
    if (host) throw new ApiError(403, 'Join as a participant to submit.');
    if (!acceptingSubmissions(session as Workshop))
      throw new ApiError(409, 'Submissions are closed.');
    const original = Buffer.from(await file.arrayBuffer());
    let optimized: Buffer;
    try {
      const decoder = sharp(original, { limitInputPixels: 20_000_000, animated: false });
      const meta = await decoder.metadata();
      if (!['png', 'jpeg', 'webp'].includes(meta.format || '') || (meta.pages ?? 1) > 1)
        throw new Error('Unsupported');
      optimized = await decoder
        .rotate()
        .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 86 })
        .toBuffer();
    } catch {
      throw new ApiError(400, 'Use a valid, still PNG, JPEG, or WebP image (up to 20 megapixels).');
    }
    savedPath = `sessions/${id}/${user.uid}/${randomUUID()}.webp`;
    operation = ref.collection('uploads').doc(randomUUID());
    const op = operation;
    await store.runTransaction(async (tx) => {
      const current = (await tx.get(ref)).data();
      assertActive(current);
      if (!acceptingSubmissions(current as Workshop))
        throw new ApiError(409, 'Submissions are closed.');
      tx.create(op, { path: savedPath, startedAt: Date.now() });
    });
    await bucket.file(savedPath).save(optimized, {
      resumable: false,
      contentType: 'image/webp',
      metadata: { cacheControl: 'private, no-store' },
    });
    storageSettled = true;
    let previous: string | undefined;
    await store.runTransaction(async (tx) => {
      const [s, m, old] = await Promise.all([
        tx.get(ref),
        tx.get(ref.collection('members').doc(user.uid)),
        tx.get(ref.collection('submissions').doc(user.uid)),
      ]);
      const current = s.data()!;
      assertActive(current);
      if (!acceptingSubmissions(current as Workshop))
        throw new ApiError(409, 'Submissions just closed.');
      if (old.data()?.status === 'approved')
        throw new ApiError(409, 'Your sticker is already approved.');
      previous = old.data()?.storagePath;
      tx.set(ref.collection('submissions').doc(user.uid), {
        id: user.uid,
        nickname: m.data()!.nickname,
        caption,
        status: 'pending',
        storagePath: savedPath,
        createdAt: Date.now(),
      });
      tx.update(ref.collection('members').doc(user.uid), { progress: 'submitted' });
      tx.update(ref.collection('attendance').doc(user.uid), { submitted: true });
    });
    if (previous)
      await bucket
        .file(previous)
        .delete({ ignoreNotFound: true })
        .catch(() => {});
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (savedPath)
      await bucket
        .file(savedPath)
        .delete({ ignoreNotFound: true })
        .catch(() => {});
    return failure(e);
  } finally {
    // Only release after every Storage promise has settled. Never expire this by time alone.
    if (operation && storageSettled) await operation.delete().catch(() => {});
  }
}
