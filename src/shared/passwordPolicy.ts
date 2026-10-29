// Política de senha do portal. Este arquivo tem uma cópia idêntica em
// supabase/functions/_shared/passwordPolicy.ts (um teste garante que são iguais).
// O cliente usa para feedback; a Edge Function usa como regra.

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_BYTES = 72;

export const PASSWORD_RULE_TEXT =
  'Mínimo de 12 caracteres, com letras maiúsculas e minúsculas, números e caractere especial. Sem números em sequência.';

export const PASSWORD_MESSAGES = {
  minLength: 'A senha precisa ter no mínimo 12 caracteres.',
  maxLength: 'A senha pode ter no máximo 72 caracteres.',
  spaces: 'A senha não pode ter espaços.',
  classes: 'A senha precisa ter letras, números e caracteres especiais.',
  upper: 'A senha precisa ter pelo menos uma letra maiúscula.',
  lower: 'A senha precisa ter pelo menos uma letra minúscula.',
  sequence: 'A senha não pode ter números em sequência, como 123 ou 987.',
  pwned: 'Esta senha apareceu em vazamentos. Escolha outra.',
} as const;

export function utf8Length(value: string): number {
  return new TextEncoder().encode(value).length;
}

// 3 ou mais dígitos adjacentes crescentes ou decrescentes (123, 987, 012).
export function hasDigitSequence(value: string): boolean {
  for (let i = 0; i + 2 < value.length; i++) {
    const a = value.charCodeAt(i) - 48;
    const b = value.charCodeAt(i + 1) - 48;
    const c = value.charCodeAt(i + 2) - 48;
    const digits = [a, b, c].every((d) => d >= 0 && d <= 9);
    if (digits && ((b === a + 1 && c === b + 1) || (b === a - 1 && c === b - 1))) return true;
  }
  return false;
}

const hasLetter = (v: string) => /[A-Za-z]/.test(v);
const hasDigit = (v: string) => /[0-9]/.test(v);
const hasSpecial = (v: string) => /[^A-Za-z0-9]/.test(v);
const hasUpper = (v: string) => /[A-Z]/.test(v);
const hasLower = (v: string) => /[a-z]/.test(v);

/** Primeira regra violada (na ordem da política) ou null se a senha atende. */
export function validatePassword(value: string): string | null {
  if (value.length < PASSWORD_MIN_LENGTH) return PASSWORD_MESSAGES.minLength;
  if (utf8Length(value) > PASSWORD_MAX_BYTES) return PASSWORD_MESSAGES.maxLength;
  if (/\s/.test(value)) return PASSWORD_MESSAGES.spaces;
  if (!hasLetter(value) || !hasDigit(value) || !hasSpecial(value)) return PASSWORD_MESSAGES.classes;
  if (!hasUpper(value)) return PASSWORD_MESSAGES.upper;
  if (!hasLower(value)) return PASSWORD_MESSAGES.lower;
  if (hasDigitSequence(value)) return PASSWORD_MESSAGES.sequence;
  return null;
}

export interface PasswordChecklistItem {
  id: 'length' | 'upper' | 'lower' | 'number' | 'special' | 'sequence';
  label: string;
  test: (value: string) => boolean;
}

export const PASSWORD_CHECKLIST: PasswordChecklistItem[] = [
  { id: 'length', label: '12 caracteres', test: (v) => v.length >= PASSWORD_MIN_LENGTH && utf8Length(v) <= PASSWORD_MAX_BYTES },
  { id: 'upper', label: 'Maiúscula', test: hasUpper },
  { id: 'lower', label: 'Minúscula', test: hasLower },
  { id: 'number', label: 'Número', test: hasDigit },
  { id: 'special', label: 'Especial', test: (v) => hasSpecial(v) && !/\s/.test(v) },
  { id: 'sequence', label: 'Sem sequência', test: (v) => v.length > 0 && !hasDigitSequence(v) },
];
