import test from 'node:test';
import assert from 'node:assert/strict';
import {
  makePrompt,
  rankVotes,
  nextStage,
  STAGES,
  STAGE_INFO,
  remainingMs,
  acceptingVotes,
  acceptingSubmissions,
} from '../src/lib/workshop';
test('default timed workshop is exactly fifteen minutes', () => {
  assert.equal(
    STAGES.reduce((n, s) => n + STAGE_INFO[s].seconds, 0),
    900,
  );
  assert.equal(nextStage('vote'), 'results');
  assert.equal(nextStage('results'), null);
});
test('prompts preserve customized captions and selected style without asking for selfies', () => {
  const prompt = makePrompt('Keep exploring!', 'comic', 'A curious fox');
  assert.match(prompt, /Keep exploring!/);
  assert.match(prompt, /pop-art comic/);
  assert.match(prompt, /A curious fox/);
  assert.match(prompt, /no real person, selfie/);
});
test('leaderboard preserves ties, excludes zero votes, and limits ranks', () => {
  const subs = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id, nickname: id }));
  const votes = ['a', 'a', 'b', 'b', 'c', 'd'].map((submissionId) => ({ submissionId }));
  assert.deepEqual(
    rankVotes(subs, votes).map((w) => [w.id, w.rank, w.votes]),
    [
      ['a', 1, 2],
      ['b', 1, 2],
      ['c', 3, 1],
      ['d', 3, 1],
    ],
  );
  assert.deepEqual(rankVotes(subs, []), []);
});

test('paused clocks freeze and server windows close at expiry', () => {
  const s = {
    stage: 'generate' as const,
    stageEndsAt: 10000,
    pausedRemainingMs: null as number | null,
  };
  assert.equal(acceptingSubmissions(s, 9999), true);
  assert.equal(acceptingSubmissions(s, 10000), false);
  s.pausedRemainingMs = 5000;
  assert.equal(remainingMs(s, 20000), 5000);
  assert.equal(acceptingSubmissions(s, 5000), false);
  assert.equal(acceptingVotes({ ...s, stage: 'vote' }, 5000), false);
  assert.equal(acceptingVotes({ ...s, stage: 'vote', pausedRemainingMs: null }, 9999), true);
});

test('activity creative stages share their deadline and retain paused time', async () => {
  const { nextStageDeadline, capDeadline } = await import('../src/lib/workshop');
  const activity = {
    id: 'a',
    ownerId: 'host',
    title: 'Aktiviti',
    description: 'Arahan',
    durationMinutes: 25,
    prompts: ['Prompt'],
    createdAt: 0,
    updatedAt: 0,
  };
  const session = {
    activity,
    stage: 'generate' as const,
    stageEndsAt: 1500000,
    expiresAt: 14400000,
    pausedRemainingMs: null as number | null,
  };
  assert.equal(nextStageDeadline(session, 'submit', 100000), 1500000);
  assert.equal(nextStageDeadline({ ...session, stage: 'submit' }, 'generate', 120000), 1500000);
  assert.equal(
    nextStageDeadline({ ...session, pausedRemainingMs: 300000 }, 'submit', 900000),
    1200000,
  );
  assert.equal(nextStageDeadline(session, 'gallery', 100000), 160000);
  assert.equal(nextStageDeadline(session, 'vote', 100000), 220000);
  assert.equal(nextStageDeadline(session, 'results', 100000), 160000);
  assert.equal(capDeadline(session, 20000000), session.expiresAt);
  assert.equal(nextStageDeadline({ ...session, stageEndsAt: 99999 }, 'submit', 100000), 100000);
});

test('legacy stage timers still reset to their existing durations', async () => {
  const { nextStageDeadline, capDeadline } = await import('../src/lib/workshop');
  const session = { stage: 'generate' as const, stageEndsAt: 1500000, expiresAt: 14400000 };
  assert.equal(nextStageDeadline(session, 'submit', 100000), 280000);
  assert.equal(nextStageDeadline(session, 'generate', 100000), 400000);
  assert.equal(capDeadline(session, 20000000), 20000000);
});
