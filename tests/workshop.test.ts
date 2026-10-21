import test from 'node:test';
import assert from 'node:assert/strict';
import { makePrompt, rankVotes, nextStage, STAGES, STAGE_INFO } from '../src/lib/workshop';
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
