import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, KeyRound, X } from 'lucide-react';
import { storageKey } from '@/config/portal';
import { useToast } from '@/components/ui/Toast';
import { callFunction, functionErrorMessage } from '@/lib/functions';
import { supabase } from '@/lib/supabase';

interface Aviso {
  id: string;
  user_id: string;
  requested_at: string;
  nome: string;
}

export const EVENTO_AVISOS = storageKey('avisos');

export function NotificationBell() {
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [aberto, setAberto] = useState(false);
  const [dispensando, setDispensando] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const toast = useToast();

  const carregar = useCallback(async () => {
    const { data: pedidos, error } = await supabase
      .from('pp_password_reset_requests')
      .select('id, user_id, requested_at')
      .eq('status', 'open')
      .order('requested_at', { ascending: false })
      .limit(20);
    if (error || !pedidos) return;
    const ids = pedidos.map((p) => p.user_id);
    const { data: perfis } = ids.length
      ? await supabase.from('pp_profiles').select('id, name').in('id', ids)
      : { data: [] as { id: string; name: string }[] };
    const nomes = new Map((perfis ?? []).map((p) => [p.id, p.name]));
    setAvisos(pedidos.map((p) => ({ ...p, nome: nomes.get(p.user_id) ?? 'Usuário' })));
  }, []);

  useEffect(() => {
    void carregar();
    const timer = window.setInterval(() => void carregar(), 20_000);
    const onFocus = () => void carregar();
    window.addEventListener('focus', onFocus);
    window.addEventListener(EVENTO_AVISOS, onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener(EVENTO_AVISOS, onFocus);
    };
  }, [carregar]);

  useEffect(() => {
    if (!aberto) return;
    const onClick = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setAberto(false);
    };
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setAberto(false);
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [aberto]);

  const dispensar = async (aviso: Aviso) => {
    setDispensando(aviso.id);
    try {
      await callFunction('dismiss-reset-request', { user_id: aviso.user_id });
      setAvisos((lista) => lista.filter((a) => a.user_id !== aviso.user_id));
    } catch (err) {
      toast.error(functionErrorMessage(err));
    } finally {
      setDispensando(null);
    }
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-label={avisos.length ? `Avisos: ${avisos.length} pendente(s)` : 'Avisos'}
        aria-expanded={aberto}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <Bell size={18} aria-hidden="true" />
        {avisos.length > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white">
            {avisos.length}
          </span>
        )}
      </button>

      {aberto && (
        <div className="card-surface absolute right-0 top-11 z-50 w-80 overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <span className="section-label">Troca de senha</span>
            <button type="button" onClick={() => setAberto(false)} aria-label="Fechar avisos" className="rounded p-1 text-muted-foreground hover:text-foreground">
              <X size={14} aria-hidden="true" />
            </button>
          </div>
          {avisos.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">Nenhum aviso pendente.</p>
          ) : (
            <ul className="max-h-80 divide-y divide-border overflow-y-auto">
              {avisos.map((aviso) => (
                <li key={aviso.id} className="px-4 py-3">
                  <div className="flex items-start gap-2">
                    <KeyRound size={16} className="mt-0.5 shrink-0 text-warning" aria-hidden="true" />
                    <p className="flex-1 text-sm text-foreground">{aviso.nome} solicitou a troca de senha.</p>
                    <button
                      type="button"
                      onClick={() => void dispensar(aviso)}
                      disabled={dispensando === aviso.id}
                      aria-label={`Dispensar aviso de ${aviso.nome}`}
                      className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-50"
                    >
                      <X size={14} aria-hidden="true" />
                    </button>
                  </div>
                  <div className="mt-2 flex gap-2 pl-6">
                    <button
                      type="button"
                      onClick={() => {
                        setAberto(false);
                        navigate(`/usuarios#reset-${aviso.user_id}`);
                      }}
                      className="text-xs font-semibold text-brand-strong hover:underline"
                    >
                      Alterar senha
                    </button>
                    <button
                      type="button"
                      onClick={() => void dispensar(aviso)}
                      disabled={dispensando === aviso.id}
                      className="text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
                    >
                      Dispensar
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
