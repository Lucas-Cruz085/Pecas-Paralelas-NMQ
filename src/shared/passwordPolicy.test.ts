import { describe, expect, it } from 'vitest';
import clientCopy from './passwordPolicy.ts?raw';
import serverCopy from '../../supabase/functions/_shared/passwordPolicy.ts?raw';
import { generateTemporaryPassword, randomInt } from '../../supabase/functions/_shared/passwordGenerator.ts';
import { PASSWORD_CHECKLIST, PASSWORD_MESSAGES, hasDigitSequence, validatePassword } from './passwordPolicy';

describe('política de senha', () => {
  it('aceita uma senha que atende todas as regras', () => {
    expect(validatePassword('Abcdefghij1!')).toBeNull();
  });

  it.each([
    ['Abcdefgh123!', PASSWORD_MESSAGES.sequence],
    ['Abcdef9876!x', PASSWORD_MESSAGES.sequence],
    ['Abc1!', PASSWORD_MESSAGES.minLength],
    [`Aa1!${'x'.repeat(69)}`, PASSWORD_MESSAGES.maxLength],
    ['abcdefghij1!', PASSWORD_MESSAGES.upper],
    ['ABCDEFGHIJ1!', PASSWORD_MESSAGES.lower],
    ['Abcdefghij12', PASSWORD_MESSAGES.classes],
    ['Abcdefg hij1!', PASSWORD_MESSAGES.spaces],
  ])('recusa %s', (senha, mensagem) => {
    expect(validatePassword(senha)).toBe(mensagem);
  });

  it('mede o limite em bytes UTF-8', () => {
    const comAcento = `Aa1!${'é'.repeat(35)}`;
    expect(comAcento.length).toBeLessThan(72);
    expect(validatePassword(comAcento)).toBe(PASSWORD_MESSAGES.maxLength);
  });

  it('só considera sequência 3 ou mais dígitos adjacentes', () => {
    expect(hasDigitSequence('a12b')).toBe(false);
    expect(hasDigitSequence('a111b')).toBe(false);
    expect(hasDigitSequence('1a2a3')).toBe(false);
    expect(hasDigitSequence('x012y')).toBe(true);
    expect(hasDigitSequence('x210y')).toBe(true);
  });

  it('checklist marca cada requisito', () => {
    const estado = Object.fromEntries(PASSWORD_CHECKLIST.map((item) => [item.id, item.test('Abcdefghij1!')]));
    expect(estado).toEqual({ length: true, upper: true, lower: true, number: true, special: true, sequence: true });
    expect(PASSWORD_CHECKLIST.find((i) => i.id === 'sequence')!.test('Abc123')).toBe(false);
  });

  it('cliente e Edge Function usam cópias idênticas', () => {
    expect(serverCopy.replace(/\r\n/g, '\n')).toBe(clientCopy.replace(/\r\n/g, '\n'));
  });
});

describe('gerador de senha temporária', () => {
  it('gera 30 senhas válidas, diferentes e sem sequência', () => {
    const senhas = Array.from({ length: 30 }, () => generateTemporaryPassword());
    expect(new Set(senhas).size).toBe(30);
    for (const senha of senhas) {
      expect(senha).toHaveLength(12);
      expect(validatePassword(senha)).toBeNull();
      expect(hasDigitSequence(senha)).toBe(false);
      expect(senha.replace(/\D/g, '')).toHaveLength(2);
      expect(senha).not.toMatch(/[O0Il1]/);
    }
  });

  it('randomInt fica dentro do intervalo', () => {
    for (let i = 0; i < 500; i++) {
      const n = randomInt(7);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(7);
    }
  });
});
