import { NextRequest, NextResponse, after } from 'next/server';
import { z } from 'zod';
import { identity, requireOrigin, failure, boundedText, ApiError, sessionRef } from '@/lib/server';
import { closeSession, cleanSession, ticket, checkTicket, verifyDeleted } from '@/lib/cleanup';
import { store } from '@/lib/admin';
export const runtime = 'nodejs';
const schema = z.object({
  sessionId: z.string(),
  action: z.enum(['authorize', 'end', 'status', 'retry']),
  ticket: z.string().optional(),
  confirmed: z.literal(true).optional(),
});
export async function POST(req: NextRequest) {
  try {
    requireOrigin(req);
    const user = await identity(req);
    if (user.facilitator !== true) throw new ApiError(403, 'Facilitator access is required.');
    const data = schema.parse(JSON.parse(await boundedText(req, 2048)));
    sessionRef(data.sessionId);
    // Validate signing configuration before making any destructive change.
    const proof = ticket(data.sessionId, user.uid);
    if (data.action === 'authorize') {
      const session = (await sessionRef(data.sessionId).get()).data();
      if (session?.hostId !== user.uid)
        throw new ApiError(403, 'Only this workshop’s facilitator can end it.');
      return NextResponse.json(
        { state: 'authorized', ticket: proof },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }
    if (data.action === 'end') {
      if (!data.confirmed) throw new ApiError(400, 'Explicit deletion confirmation is required.');
      if (data.ticket) checkTicket(data.sessionId, user.uid, data.ticket);
      const exists =
        (await sessionRef(data.sessionId).get()).exists ||
        (await store.doc(`cleanupJobs/${data.sessionId}`).get()).exists;
      if (exists || !data.ticket) await closeSession(data.sessionId, user.uid);
      after(() => cleanSession(data.sessionId));
    } else if (data.ticket) checkTicket(data.sessionId, user.uid, data.ticket);
    else {
      const job = await store.doc(`cleanupJobs/${data.sessionId}`).get();
      if (job.data()?.hostId !== user.uid)
        throw new ApiError(403, 'Cleanup authorization is required.');
    }
    if (data.action === 'retry') await cleanSession(data.sessionId);
    const job = await store.doc(`cleanupJobs/${data.sessionId}`).get();
    if (!job.exists) {
      await verifyDeleted(data.sessionId);
      return NextResponse.json(
        { state: 'complete', ticket: proof },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }
    return NextResponse.json(
      { state: job.data()!.state, error: job.data()!.error || '', ticket: proof },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    return failure(e);
  }
}

// Only unfinished jobs are listed; completed workshops leave no history record.
export async function GET(req: NextRequest) {
  try {
    const user = await identity(req);
    if (user.facilitator !== true) throw new ApiError(403, 'Facilitator access is required.');
    const jobs = await store
      .collection('cleanupJobs')
      .where('hostId', '==', user.uid)
      .select('state', 'error')
      .get();
    return NextResponse.json(
      {
        jobs: jobs.docs.map((job) => ({
          id: job.id,
          state: job.data().state,
          error: job.data().error || '',
        })),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    return failure(e);
  }
}
