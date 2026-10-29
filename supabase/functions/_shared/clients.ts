import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { HttpError } from './http.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

const noSession = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false };

/** Cliente com a chave pública; com token, age como o usuário (RLS aplicada). */
export function anonClient(accessToken?: string): SupabaseClient {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) throw new HttpError(500, 'CONFIG', 'Configuração do servidor incompleta.');
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: noSession,
    global: accessToken ? { headers: { Authorization: `Bearer ${accessToken}` } } : undefined,
  });
}

/** Cliente privilegiado. Só instancie depois de validar sessão, papel e AAL. */
export function serviceClient(): SupabaseClient {
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!SUPABASE_URL || !key) throw new HttpError(500, 'CONFIG', 'Configuração do servidor incompleta.');
  return createClient(SUPABASE_URL, key, { auth: noSession });
}

export interface JwtClaims {
  sub?: string;
  aal?: string;
  session_id?: string;
  amr?: { method: string; timestamp: number }[];
}

/** Lê o payload de um JWT já validado pelo Auth (getUser). Não usar para decidir autenticidade. */
export function decodeJwt(token: string): JwtClaims {
  try {
    const payload = token.split('.')[1] ?? '';
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(padded), (c) => c.charCodeAt(0))));
  } catch {
    return {};
  }
}
