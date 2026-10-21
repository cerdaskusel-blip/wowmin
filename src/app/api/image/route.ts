import { NextRequest } from 'next/server';
import { bucket } from '@/lib/admin';
import { identity, access, failure, ApiError } from '@/lib/server';
export async function GET(req: NextRequest) {
  try {
    const user = await identity(req, true);
    const id = req.nextUrl.searchParams.get('sessionId') || '';
    const subId = req.nextUrl.searchParams.get('submissionId') || '';
    if (!/^[\w-]{1,128}$/.test(subId)) throw new ApiError(400, 'Invalid image.');
    const { ref, host } = await access(id, user.uid);
    if (host && user.facilitator !== true)
      throw new ApiError(403, 'Facilitator access is required.');
    const sub = (await ref.collection('submissions').doc(subId).get()).data();
    if (!sub || (!host && user.uid !== subId && sub.status !== 'approved'))
      throw new ApiError(404, 'Image unavailable.');
    const [buffer] = await bucket.file(sub.storagePath).download();
    return new Response(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'image/webp',
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (e) {
    return failure(e);
  }
}
