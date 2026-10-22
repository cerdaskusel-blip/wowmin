import { NextRequest, NextResponse } from 'next/server';
import { store } from '@/lib/admin';
import { identity, requireOrigin, failure, boundedText, ApiError, limit } from '@/lib/server';
import { activityRequest, type ActivityTemplate } from '@/lib/activities';
export const runtime = 'nodejs';

async function facilitator(req: NextRequest) {
  const user = await identity(req);
  if (user.facilitator !== true) throw new ApiError(403, 'Akses fasilitator diperlukan.');
  await limit(`activities:${user.uid}`, 90, 60_000, user.uid);
  return user;
}
export async function GET(req: NextRequest) {
  try {
    const user = await facilitator(req);
    const docs = await store.collection('activityTemplates').where('ownerId', '==', user.uid).get();
    const templates = docs.docs.map((doc) => ({ ...doc.data(), id: doc.id }) as ActivityTemplate);
    templates.sort((a, b) => Number(b.updatedAt) - Number(a.updatedAt));
    return NextResponse.json({ templates }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return failure(error);
  }
}
export async function POST(req: NextRequest) {
  try {
    requireOrigin(req);
    const user = await facilitator(req);
    let parsed: unknown;
    try {
      parsed = JSON.parse(await boundedText(req, 65536));
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(400, 'Format permintaan tidak sah.');
    }
    const data = activityRequest.parse(parsed);
    const ref = data.id
      ? store.doc(`activityTemplates/${data.id}`)
      : store.collection('activityTemplates').doc();
    const result = await store.runTransaction(async (tx) => {
      const old = data.id ? await tx.get(ref) : undefined;
      if (data.id && !old?.exists) throw new ApiError(404, 'Templat tidak ditemui.');
      if (old?.exists && old.data()!.ownerId !== user.uid)
        throw new ApiError(403, 'Templat ini bukan milik anda.');
      if (data.action === 'delete') {
        tx.delete(ref);
        return { ok: true };
      }
      const now = Date.now();
      const template = {
        title: data.title,
        description: data.description,
        durationMinutes: data.durationMinutes,
        prompts: data.prompts,
        ownerId: user.uid,
        createdAt: old?.data()?.createdAt ?? now,
        updatedAt: Math.max(now, Number(old?.data()?.updatedAt ?? 0) + 1),
      };
      if (data.id) tx.set(ref, template);
      else tx.create(ref, template);
      return { template: { ...template, id: ref.id } };
    });
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return failure(error);
  }
}
