import { useEffect, useRef, useState } from 'react';
import { SEGURANCA, storageKey } from '@/config/portal';
import { supabase, supabaseAnonKey, supabaseUrl } from '@/lib/supabase';

const EVENTOS = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'wheel'] as const;
const AVISO_ANTES_MS = 60_000;
const EVENTO_CONTINUAR = storageKey('continuar-sessao');

/** Aviso 1 minuto antes e logout após INATIVIDADE_MIN sem atividade. Conveniência; o limite real fica no Auth. */
export function useInatividade(ativo: boolean, aoExpirar: () => void) {
  const [avisando, setAvisando] = useState(false);
  const ultimo = useRef(Date.now());
  const expirarRef = useRef(aoExpirar);
  expirarRef.current = aoExpirar;

  useEffect(() => {
    if (!ativo) return;
    const limite = SEGURANCA.INATIVIDADE_MIN * 60_000;
    ultimo.current = Date.now();
    let avisoAtivo = false;

    const registrar = () => {
      if (avisoAtivo) return;
      ultimo.current = Date.now();
    };
    EVENTOS.forEach((evento) => window.addEventListener(evento, registrar, { passive: true }));

    const timer = window.setInterval(() => {
      const parado = Date.now() - ultimo.current;
      if (parado >= limite) {
        window.clearInterval(timer);
        expirarRef.current();
      } else if (parado >= limite - AVISO_ANTES_MS && !avisoAtivo) {
        avisoAtivo = true;
        setAvisando(true);
      }
    }, 5_000);

    const continuar = () => {
      avisoAtivo = false;
      ultimo.current = Date.now();
      setAvisando(false);
    };
    window.addEventListener(EVENTO_CONTINUAR, continuar);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener(EVENTO_CONTINUAR, continuar);
      EVENTOS.forEach((evento) => window.removeEventListener(evento, registrar));
    };
  }, [ativo]);

  const continuar = () => window.dispatchEvent(new Event(EVENTO_CONTINUAR));
  return { avisando, continuar };
}

/** Atualiza last_seen_at da própria sessão: 2 s após entrar, a cada 120 s e no pagehide. Informativo. */
export function useHeartbeat(ativo: boolean) {
  useEffect(() => {
    if (!ativo) return;
    const tocar = () => {
      void supabase.rpc('pp_touch_session').then(
        () => undefined,
        () => undefined,
      );
    };
    const primeiro = window.setTimeout(tocar, 2_000);
    const intervalo = window.setInterval(tocar, 120_000);

    const aoSair = async () => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return;
      void fetch(`${supabaseUrl}/rest/v1/rpc/pp_touch_session`, {
        method: 'POST',
        keepalive: true,
        headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: '{}',
      }).catch(() => undefined);
    };
    window.addEventListener('pagehide', aoSair);

    return () => {
      window.clearTimeout(primeiro);
      window.clearInterval(intervalo);
      window.removeEventListener('pagehide', aoSair);
    };
  }, [ativo]);
}
