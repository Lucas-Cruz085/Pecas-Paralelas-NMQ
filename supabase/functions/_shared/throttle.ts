import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { HttpError } from './http.ts';

let hmacKey: CryptoKey | null = null;

/** HMAC-SHA256 do identificador (IP ou usuário); o valor puro nunca é gravado. */
export async function throttleKey(value: string): Promise<string> {
  if (!hmacKey) {
    const secret = Deno.env.get('THROTTLE_HMAC_KEY');
    if (!secret || secret.length < 32) throw new HttpError(500, 'CONFIG', 'Configuração do servidor incompleta.');
    hmacKey = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  }
  const signature = await crypto.subtle.sign('HMAC', hmacKey, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(signature), (b) => b.toString(16).padStart(2, '0')).join('');
}

export interface ThrottleState {
  count: number;
  blocked: boolean;
}

export async function throttleStatus(svc: SupabaseClient, keyHash: string, kind: string, windowSeconds = 900): Promise<ThrottleState> {
  const { data, error } = await svc.rpc('pp_throttle_status', { p_key_hash: keyHash, p_kind: kind, p_window_seconds: windowSeconds });
  if (error) throw new HttpError(500, 'INTERNAL', 'Não foi possível concluir a operação. Tente novamente.');
  return data as ThrottleState;
}

export async function throttleRegister(
  svc: SupabaseClient,
  keyHash: string,
  kind: string,
  failed: boolean,
  max = 5,
  windowSeconds = 900,
  blockSeconds = 900,
): Promise<ThrottleState> {
  const { data, error } = await svc.rpc('pp_throttle_register', {
    p_key_hash: keyHash,
    p_kind: kind,
    p_failed: failed,
    p_max: max,
    p_window_seconds: windowSeconds,
    p_block_seconds: blockSeconds,
  });
  if (error) throw new HttpError(500, 'INTERNAL', 'Não foi possível concluir a operação. Tente novamente.');
  return data as ThrottleState;
}

export const turnstileEnabled = () => Boolean(Deno.env.get('TURNSTILE_SECRET_KEY'));

export async function verifyTurnstile(token: string | undefined, ip: string | null): Promise<boolean> {
  const secret = Deno.env.get('TURNSTILE_SECRET_KEY');
  if (!secret) return true;
  if (!token) return false;
  const form = new FormData();
  form.append('secret', secret);
  form.append('response', token);
  if (ip) form.append('remoteip', ip);
  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(5000),
    });
    const result = (await response.json()) as { success?: boolean };
    return result.success === true;
  } catch {
    return false;
  }
}
