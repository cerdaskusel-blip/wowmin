import { createHmac } from 'node:crypto';
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
// 30-bit keyed Feistel permutation: unique six-character codes without storing
// a historical code/session list. Epoch prefixes extend the space when needed.
export function sequenceCode(sequence: bigint, key: string) {
  const base = 1n << 30n;
  let left = Number((sequence % base) >> 15n);
  let right = Number(sequence % base) & 32767;
  for (let round = 0; round < 6; round++) {
    const f =
      createHmac('sha256', key).update(`${round}:${right}`).digest().readUInt16BE(0) & 32767;
    [left, right] = [right, left ^ f];
  }
  let value = BigInt(left * 32768 + right);
  let code = '';
  for (let i = 0; i < 6; i++) {
    code = alphabet[Number(value % 32n)] + code;
    value /= 32n;
  }
  let epoch = sequence / base;
  let prefix = '';
  while (epoch) {
    prefix = alphabet[Number(epoch % 32n)] + prefix;
    epoch /= 32n;
  }
  return prefix + code;
}
