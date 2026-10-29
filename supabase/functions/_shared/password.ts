export { generateTemporaryPassword } from './passwordGenerator.ts';
export { PASSWORD_MESSAGES, validatePassword } from './passwordPolicy.ts';

/**
 * Consulta o HIBP por k-anonimato (só os 5 primeiros caracteres do SHA-1 saem do servidor).
 * true = vazada, false = não encontrada, null = serviço indisponível (aceitar e registrar aviso).
 */
export async function isPasswordPwned(password: string): Promise<boolean | null> {
  try {
    const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(password));
    const hash = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
    const prefix = hash.slice(0, 5);
    const suffix = hash.slice(5);
    const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { 'Add-Padding': 'true', 'User-Agent': 'normaq-pecas-paralelas' },
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) return null;
    const body = await response.text();
    return body.split('\n').some((line) => {
      const [candidate, count] = line.trim().split(':');
      return candidate === suffix && Number(count) > 0;
    });
  } catch {
    return null;
  }
}
