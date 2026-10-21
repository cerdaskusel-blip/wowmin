import test from 'node:test';
import assert from 'node:assert/strict';
import { sequenceCode } from '../src/lib/join-code';
test('join codes do not reuse a sequence value and extend after the first epoch', () => {
  const codes = new Set(
    Array.from({ length: 5000 }, (_, i) => sequenceCode(BigInt(i), 'test-key')),
  );
  assert.equal(codes.size, 5000);
  for (const code of codes) assert.match(code, /^[A-Z2-9]{6}$/);
  const boundary = 1n << 30n;
  assert.notEqual(sequenceCode(0n, 'test-key'), sequenceCode(boundary, 'test-key'));
  assert.equal(sequenceCode(boundary, 'test-key').length, 7);
  assert.equal(sequenceCode(42n, 'test-key'), sequenceCode(42n, 'test-key'));
});
