import test from 'node:test';
import assert from 'node:assert/strict';
import { activityFields, activityRequest } from '../src/lib/activities';
const valid = {
  title: ' Aktiviti Bahasa ',
  description: 'Bina idea bersama.\nPilih watak.',
  durationMinutes: 15,
  prompts: [' Prompt bebas\nbaris kedua '],
};
test('activity fields preserve multiline Malay prompts and normalize surrounding whitespace', () => {
  const parsed = activityFields.parse(valid);
  assert.equal(parsed.title, 'Aktiviti Bahasa');
  assert.equal(parsed.prompts[0], 'Prompt bebas\nbaris kedua');
  assert.equal(parsed.description, valid.description);
  assert.equal(
    activityFields.parse({ ...valid, prompts: Array(5).fill('Idea') }).prompts.length,
    5,
  );
});
test('activity validation rejects empty, excess or unsafe prompt content', () => {
  for (const prompts of [
    [],
    Array(6).fill('Idea'),
    [' '],
    ['unsafe\u0000text'],
    ['a'.repeat(2001)],
  ])
    assert.equal(activityFields.safeParse({ ...valid, prompts }).success, false);
});
test('activity duration and field limits reject invalid activity definitions', () => {
  for (const durationMinutes of [0, -1, 1.5, 241, Infinity])
    assert.equal(activityFields.safeParse({ ...valid, durationMinutes }).success, false);
  for (const invalid of [
    { title: '' },
    { title: 'a'.repeat(71) },
    { description: ' ' },
    { description: 'a'.repeat(2001) },
  ])
    assert.equal(activityFields.safeParse({ ...valid, ...invalid }).success, false);
});
test('clients cannot assign template ownership or timestamps and deletion requires confirmation', () => {
  for (const extra of [
    { ownerId: 'forged' },
    { createdAt: 1 },
    { updatedAt: 1 },
    { id: '../elsewhere' },
  ])
    assert.equal(activityRequest.safeParse({ action: 'save', ...valid, ...extra }).success, false);
  for (const confirmed of [undefined, false])
    assert.equal(
      activityRequest.safeParse({ action: 'delete', id: 'A'.repeat(20), confirmed }).success,
      false,
    );
  assert.equal(
    activityRequest.safeParse({ action: 'delete', id: 'A'.repeat(20), confirmed: true }).success,
    true,
  );
});
