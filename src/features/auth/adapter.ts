import { callFunction, FunctionError } from '@/lib/functions';
import { supabase } from '@/lib/supabase';

export interface ResultadoLogin {
  captchaObrigatorio: boolean;
}

/** Envia o login para a Edge Function `login` e instala a sessão devolvida. */
export async function entrar(usuario: string, senha: string, captcha?: string): Promise<void> {
  const data = await callFunction<{ access_token: string; refresh_token: string }>('login', {
    usuario: usuario.trim().toLowerCase(),
    senha,
    captcha,
  });
  const { error } = await supabase.auth.setSession({ access_token: data.access_token, refresh_token: data.refresh_token });
  if (error) throw new FunctionError(500, 'SESSION', 'Não foi possível entrar. Tente novamente.');
}

export async function pedirTrocaDeSenha(usuario: string): Promise<string> {
  const data = await callFunction<{ message: string }>('request-password-reset', { usuario: usuario.trim().toLowerCase() });
  return data.message;
}

export function mensagemDeLogin(err: unknown): { mensagem: string; captcha: boolean } {
  if (err instanceof FunctionError) {
    const captcha = err.extra.captcha_required === true || err.code === 'CAPTCHA_REQUIRED';
    if (err.status === 429) return { mensagem: 'Muitas tentativas. Aguarde alguns minutos.', captcha };
    if (err.status === 0 || err.status >= 500) return { mensagem: 'Não foi possível entrar. Tente novamente.', captcha };
    return { mensagem: err.message, captcha };
  }
  return { mensagem: 'Não foi possível entrar. Tente novamente.', captcha: false };
}
