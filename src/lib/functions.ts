import { supabase, supabaseAnonKey, supabaseUrl } from '@/lib/supabase';

export class FunctionError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public extra: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

export const isStepUpError = (err: unknown) => err instanceof FunctionError && err.code === 'STEP_UP_REQUIRED';

/** Chama uma Edge Function com o token da sessão atual (ou só a chave pública, se não houver sessão). */
export async function callFunction<T = Record<string, unknown>>(name: string, body: unknown = {}): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token ?? supabaseAnonKey;
  let response: Response;
  try {
    response = await fetch(`${supabaseUrl}/functions/v1/${name}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body ?? {}),
    });
  } catch {
    throw new FunctionError(0, 'NETWORK', 'Sem conexão com o servidor. Tente novamente.');
  }
  let payload: Record<string, unknown> = {};
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }
  if (!response.ok) {
    const { error, code, ...extra } = payload;
    throw new FunctionError(
      response.status,
      typeof code === 'string' ? code : 'ERROR',
      typeof error === 'string' ? error : 'Não foi possível concluir a operação. Tente novamente.',
      extra,
    );
  }
  return payload as T;
}

export function functionErrorMessage(err: unknown, fallback = 'Não foi possível concluir a operação. Tente novamente.') {
  return err instanceof Error && err.message ? err.message : fallback;
}
