import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Factor, Session } from '@supabase/supabase-js';
import { SEGURANCA, type Papel } from '@/config/portal';
import { callFunction } from '@/lib/functions';
import { supabase } from '@/lib/supabase';
import { mfaObrigatorioPara, type EstadoSessao } from './resolverRota';

export interface PerfilPortal {
  id: string;
  username: string;
  email: string;
  name: string;
  department: string | null;
  job_title: string | null;
  active: boolean;
  must_change_password: boolean;
  created_at: string;
}

interface AuthContextValue {
  carregando: boolean;
  session: Session | null;
  perfil: PerfilPortal | null;
  papel: Papel | null;
  aalAtual: string | null;
  aalProximo: string | null;
  fatores: Factor[];
  fatoresVerificados: Factor[];
  politicaMfa: 'admin' | 'todos';
  estado: EstadoSessao;
  aviso: string | null;
  limparAviso: () => void;
  recarregar: () => Promise<void>;
  sair: (aviso?: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const PERFIL_COLUNAS = 'id, username, email, name, department, job_title, active, must_change_password, created_at';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [sessionPronta, setSessionPronta] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [perfil, setPerfil] = useState<PerfilPortal | null>(null);
  const [papel, setPapel] = useState<Papel | null>(null);
  const [aal, setAal] = useState<{ atual: string | null; proximo: string | null }>({ atual: null, proximo: null });
  const [fatores, setFatores] = useState<Factor[]>([]);
  const [politicaMfa, setPoliticaMfa] = useState<'admin' | 'todos'>(SEGURANCA.MFA_OBRIGATORIO);
  const [aviso, setAviso] = useState<string | null>(null);
  const usuarioCarregado = useRef<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setSessionPronta(true);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setSessionPronta(true);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  const carregar = useCallback(async (atual: Session | null) => {
    if (!atual) {
      usuarioCarregado.current = null;
      setPerfil(null);
      setPapel(null);
      setAal({ atual: null, proximo: null });
      setFatores([]);
      setCarregando(false);
      return;
    }
    if (usuarioCarregado.current !== atual.user.id) setCarregando(true);

    const [perfilRes, papeisRes, aalRes, fatoresRes, configRes] = await Promise.all([
      supabase.from('pp_profiles').select(PERFIL_COLUNAS).eq('id', atual.user.id).maybeSingle<PerfilPortal>(),
      supabase.from('pp_user_roles').select('role').eq('user_id', atual.user.id),
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
      supabase.auth.mfa.listFactors(),
      supabase.from('pp_app_settings').select('mfa_policy').maybeSingle<{ mfa_policy: 'admin' | 'todos' }>(),
    ]);

    if (!perfilRes.error && !perfilRes.data) {
      // Conta sem perfil ativo neste portal: encerra a sessão local sem detalhar o motivo.
      await supabase.auth.signOut({ scope: 'local' });
      setAviso('Acesso não autorizado. Procure o administrador.');
      return;
    }

    usuarioCarregado.current = atual.user.id;
    if (perfilRes.data) setPerfil(perfilRes.data);
    setPapel((papeisRes.data ?? []).some((r) => r.role === 'admin') ? 'admin' : 'user');
    setAal({ atual: aalRes.data?.currentLevel ?? null, proximo: aalRes.data?.nextLevel ?? null });
    setFatores(fatoresRes.data?.all ?? []);
    if (configRes.data?.mfa_policy) setPoliticaMfa(configRes.data.mfa_policy);
    setCarregando(false);
  }, []);

  useEffect(() => {
    if (!sessionPronta) return;
    void carregar(session);
  }, [sessionPronta, session?.access_token, carregar]); // eslint-disable-line react-hooks/exhaustive-deps

  const recarregar = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    await carregar(data.session);
  }, [carregar]);

  const sair = useCallback(async (mensagem?: string) => {
    try {
      await callFunction('logout');
    } catch {
      // segue com a saída local mesmo se o servidor não responder
    }
    await supabase.auth.signOut({ scope: 'local' });
    if (mensagem) setAviso(mensagem);
  }, []);

  const fatoresVerificados = useMemo(
    () => fatores.filter((f) => f.factor_type === 'totp' && f.status === 'verified'),
    [fatores],
  );

  const estado = useMemo<EstadoSessao>(
    () => ({
      temSessao: Boolean(session && perfil),
      aalAtual: aal.atual,
      aalProximo: aal.proximo,
      trocaSenhaPendente: Boolean(perfil?.must_change_password),
      mfaObrigatorio: mfaObrigatorioPara(papel, politicaMfa),
      temFatorVerificado: fatoresVerificados.length > 0,
    }),
    [session, perfil, aal, papel, politicaMfa, fatoresVerificados.length],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      carregando: !sessionPronta || carregando,
      session,
      perfil,
      papel,
      aalAtual: aal.atual,
      aalProximo: aal.proximo,
      fatores,
      fatoresVerificados,
      politicaMfa,
      estado,
      aviso,
      limparAviso: () => setAviso(null),
      recarregar,
      sair,
    }),
    [sessionPronta, carregando, session, perfil, papel, aal, fatores, fatoresVerificados, politicaMfa, estado, aviso, recarregar, sair],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth precisa estar dentro de AuthProvider');
  return context;
}
