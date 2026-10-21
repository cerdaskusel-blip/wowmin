import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { randomInt } from 'crypto';
import { store } from '@/lib/admin';
import {
  identity,
  requireOrigin,
  failure,
  limit,
  ApiError,
  sessionRef,
  access,
  boundedText,
} from '@/lib/server';
import {
  nextStage,
  STAGE_INFO,
  rankVotes,
  Stage,
  remainingMs,
  acceptingVotes,
} from '@/lib/workshop';
export const runtime = 'nodejs';
const text = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((s) => !/[\u0000-\u001f\u007f]/.test(s));
const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('create'), title: text(70) }),
  z.object({
    action: z.literal('join'),
    code: z.string().regex(/^[A-Z2-9]{6}$/),
    nickname: text(24),
  }),
  z.object({ action: z.literal('advance'), sessionId: z.string() }),
  z.object({ action: z.literal('extend'), sessionId: z.string() }),
  z.object({ action: z.literal('pause'), sessionId: z.string() }),
  z.object({ action: z.literal('resume'), sessionId: z.string() }),
  z.object({
    action: z.literal('transition'),
    sessionId: z.string(),
    stage: z.enum(['lobby', 'prompt', 'generate', 'submit', 'gallery']),
  }),
  z.object({
    action: z.literal('progress'),
    sessionId: z.string(),
    progress: z.enum(['prompt-ready', 'generating']),
  }),
  z.object({
    action: z.literal('moderate'),
    sessionId: z.string(),
    submissionId: z.string().regex(/^[\w-]{1,128}$/),
    status: z.enum(['approved', 'rejected']),
    reason: z.string().trim().max(120).optional(),
  }),
  z.object({
    action: z.literal('vote'),
    sessionId: z.string(),
    submissionId: z.string().regex(/^[\w-]{1,128}$/),
  }),
]);
export async function POST(req: NextRequest) {
  try {
    requireOrigin(req);
    const user = await identity(req);
    await limit(`action:${user.uid}`, 90);
    const body = await boundedText(req, 4096);
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      throw new ApiError(400, 'Invalid request format.');
    }
    const data = schema.parse(parsed);
    const now = Date.now();
    if (data.action === 'create') {
      if (user.facilitator !== true) throw new ApiError(403, 'Facilitator access is required.');
      await limit(`create:${user.uid}`, 6, 3600_000);
      const ref = store.collection('sessions').doc();
      const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      const code = Array.from({ length: 6 }, () => alphabet[randomInt(alphabet.length)]).join('');
      await store.runTransaction(async (tx) => {
        const codeRef = store.doc(`codes/${code}`);
        if ((await tx.get(codeRef)).exists)
          throw new ApiError(409, 'Please try creating the workshop again.');
        tx.create(codeRef, { sessionId: ref.id, expiresAt: now + 86400_000 });
        tx.create(ref, {
          id: ref.id,
          title: data.title,
          code,
          hostId: user.uid,
          stage: 'lobby',
          stageEndsAt: now + 60_000,
          createdAt: now,
          expiresAt: now + 86400_000,
        });
      });
      return NextResponse.json({ sessionId: ref.id });
    }
    if (data.action === 'join') {
      await limit(`join:${user.uid}`, 10);
      const code = await store.doc(`codes/${data.code}`).get();
      const record = code.data();
      if (!record || record.expiresAt < now)
        throw new ApiError(404, 'That code is not active. Check it with your facilitator.');
      const ref = sessionRef(record.sessionId);
      // Independent seat documents avoid a shared write lock when the entire room joins.
      const seats = Array.from({ length: 75 }, (_, i) => i);
      for (let i = seats.length - 1; i > 0; i--) {
        const j = randomInt(i + 1);
        [seats[i], seats[j]] = [seats[j], seats[i]];
      }
      let admitted = false;
      for (const seat of seats) {
        admitted = await store.runTransaction(async (tx) => {
          const memberRef = ref.collection('members').doc(user.uid);
          const seatRef = ref.collection('seats').doc(String(seat));
          const [s, m, reservation] = await Promise.all([
            tx.get(ref),
            tx.get(memberRef),
            tx.get(seatRef),
          ]);
          const session = s.data();
          if (!session || session.expiresAt < Date.now())
            throw new ApiError(409, 'This workshop is closed.');
          if (session.hostId === user.uid)
            throw new ApiError(409, 'Use a different browser profile to join as a participant.');
          if (m.exists) return true;
          if (session.stage === 'results') throw new ApiError(409, 'This workshop is closed.');
          if (reservation.exists) return false;
          tx.create(seatRef, { memberId: user.uid });
          tx.create(memberRef, {
            id: user.uid,
            nickname: data.nickname,
            progress: 'joined',
            joinedAt: now,
          });
          tx.create(ref.collection('attendance').doc(user.uid), { joinedAt: now });
          return true;
        });
        if (admitted) break;
      }
      if (!admitted) throw new ApiError(409, 'This workshop is full.');
      return NextResponse.json({ sessionId: ref.id });
    }
    const { ref, host } = await access(data.sessionId, user.uid);
    if (host && user.facilitator !== true)
      throw new ApiError(403, 'Facilitator access is required.');
    if (
      ['advance', 'extend', 'pause', 'resume', 'transition', 'moderate'].includes(data.action) &&
      !host
    )
      throw new ApiError(403, 'Only the facilitator can do that.');
    await store.runTransaction(async (tx) => {
      const s = (await tx.get(ref)).data()!;
      if (s.expiresAt < Date.now()) throw new ApiError(410, 'This workshop has expired.');
      if (data.action === 'advance' || data.action === 'transition') {
        if (data.action === 'transition' && ['vote', 'results'].includes(s.stage))
          throw new ApiError(409, 'Stages cannot reopen after voting starts.');
        const next = data.action === 'transition' ? data.stage : nextStage(s.stage as Stage);
        if (!next) throw new ApiError(409, 'The workshop is complete.');
        if (next === 'vote') {
          const approved = await tx.get(
            ref.collection('submissions').where('status', '==', 'approved'),
          );
          if (approved.empty)
            throw new ApiError(409, 'Approve at least one sticker before opening voting.');
        }
        let results = {};
        if (next === 'results') {
          const [subs, votes] = await Promise.all([
            tx.get(ref.collection('submissions').where('status', '==', 'approved')),
            tx.get(ref.collection('votes')),
          ]);
          results = {
            winners: rankVotes(
              subs.docs.map((d) => ({ id: d.id, nickname: d.data().nickname })),
              votes.docs.map((d) => ({ submissionId: d.data().submissionId })),
            ),
            totalVotes: votes.size,
          };
        }
        tx.update(ref, {
          stage: next,
          pausedRemainingMs: null,
          stageEndsAt: STAGE_INFO[next].seconds ? Date.now() + STAGE_INFO[next].seconds * 1000 : 0,
          ...results,
        });
      } else if (data.action === 'pause') {
        if (s.stage === 'results' || s.pausedRemainingMs != null)
          throw new ApiError(409, 'This stage cannot be paused.');
        tx.update(ref, { pausedRemainingMs: remainingMs(s as Parameters<typeof remainingMs>[0]) });
      } else if (data.action === 'resume') {
        if (s.pausedRemainingMs == null)
          throw new ApiError(409, 'The workshop is already running.');
        tx.update(ref, { stageEndsAt: Date.now() + s.pausedRemainingMs, pausedRemainingMs: null });
      } else if (data.action === 'extend') {
        if (s.stage === 'results') throw new ApiError(409, 'The workshop is complete.');
        tx.update(
          ref,
          s.pausedRemainingMs != null
            ? { pausedRemainingMs: s.pausedRemainingMs + 60_000 }
            : { stageEndsAt: Math.max(s.stageEndsAt, Date.now()) + 60_000 },
        );
      } else if (data.action === 'moderate') {
        if (['vote', 'results'].includes(s.stage))
          throw new ApiError(409, 'Moderation closes when voting opens.');
        const sub = ref.collection('submissions').doc(data.submissionId);
        if (!(await tx.get(sub)).exists) throw new ApiError(404, 'Sticker not found.');
        tx.update(sub, {
          status: data.status,
          reason:
            data.status === 'rejected'
              ? data.reason || 'Please upload a classroom-friendly finished sticker.'
              : '',
        });
      } else if (data.action === 'progress') {
        if (host) throw new ApiError(403, 'Join as a participant first.');
        const member = ref.collection('members').doc(user.uid);
        const current = (await tx.get(member)).data();
        if (!['submitted', 'voted'].includes(current?.progress))
          tx.update(member, { progress: data.progress });
      } else if (data.action === 'vote') {
        if (host) throw new ApiError(403, 'Facilitators cannot vote.');
        if (!acceptingVotes(s as Parameters<typeof acceptingVotes>[0]))
          throw new ApiError(409, 'Voting is closed.');
        if (data.submissionId === user.uid)
          throw new ApiError(409, 'Choose another creator’s sticker.');
        const vote = ref.collection('votes').doc(user.uid);
        const [existing, sub] = await Promise.all([
          tx.get(vote),
          tx.get(ref.collection('submissions').doc(data.submissionId)),
        ]);
        if (existing.exists) throw new ApiError(409, 'Your vote has already been counted.');
        if (sub.data()?.status !== 'approved')
          throw new ApiError(409, 'This sticker is not available for voting.');
        tx.create(vote, { submissionId: data.submissionId, createdAt: Date.now() });
        tx.update(ref.collection('members').doc(user.uid), { progress: 'voted' });
        tx.update(ref.collection('attendance').doc(user.uid), { voted: true });
      }
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
