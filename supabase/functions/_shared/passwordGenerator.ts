import { validatePassword } from './passwordPolicy.ts';

const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWER = 'abcdefghijkmnopqrstuvwxyz';
const DIGITS = '23456789';
const SPECIAL = '!@#$%&*?';
const NO_DIGITS = UPPER + LOWER + SPECIAL;

// Sorteio sem viés: descarta valores >= floor(2^32 / n) * n.
export function randomInt(n: number): number {
  const limit = Math.floor(2 ** 32 / n) * n;
  const buf = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(buf);
    if (buf[0] < limit) return buf[0] % n;
  }
}

const pick = (set: string) => set[randomInt(set.length)];

/** 12 caracteres: 1 maiúscula, 1 minúscula, 1 especial, exatamente 2 números e 7 sem números. */
export function generateTemporaryPassword(): string {
  for (let attempt = 0; attempt < 20; attempt++) {
    const chars = [pick(UPPER), pick(LOWER), pick(SPECIAL), pick(DIGITS), pick(DIGITS)];
    while (chars.length < 12) chars.push(pick(NO_DIGITS));
    for (let i = chars.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      [chars[i], chars[j]] = [chars[j], chars[i]];
    }
    const candidate = chars.join('');
    if (validatePassword(candidate) === null) return candidate;
  }
  throw new Error('Não foi possível gerar uma senha temporária válida.');
}
