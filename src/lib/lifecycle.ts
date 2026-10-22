import { ApiError } from './server';

export const MAX_PARTICIPANTS = 60;
export function retentionMs() {
  const hours = Number(process.env.WORKSHOP_RETENTION_HOURS ?? 4);
  if (!Number.isFinite(hours) || hours <= 0 || hours > 168)
    throw new Error('WORKSHOP_RETENTION_HOURS must be greater than 0 and at most 168.');
  return Math.min(hours, 4) * 3600_000;
}
export function assertActive(session: FirebaseFirestore.DocumentData | undefined) {
  if (!session || session.lifecycle === 'closing' || session.expiresAt <= Date.now())
    throw new ApiError(
      410,
      'This workshop has ended. Ask the facilitator to delete its temporary data.',
    );
}
