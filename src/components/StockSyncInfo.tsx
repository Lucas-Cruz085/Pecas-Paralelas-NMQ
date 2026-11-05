import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface StockSync {
  synced_at: string;
  pecas_atualizadas: number | null;
}

const RECARREGAR_MS = 5 * 60 * 1000;

const dataHora = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

function haQuantoTempo(iso: string, agora: number): string {
  const minutos = Math.max(0, Math.round((agora - new Date(iso).getTime()) / 60000));
  if (minutos < 1) return 'agora há pouco';
  if (minutos < 60) return `há ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `há ${horas} h${minutos % 60 ? ` ${minutos % 60} min` : ''}`;
  const dias = Math.floor(horas / 24);
  return `há ${dias} ${dias === 1 ? 'dia' : 'dias'}`;
}

/** Aviso discreto com a última sincronização automática do saldo de estoque (n8n). */
export default function StockSyncInfo() {
  const [sync, setSync] = useState<StockSync | null>(null);
  const [carregado, setCarregado] = useState(false);
  const [agora, setAgora] = useState(() => Date.now());

  useEffect(() => {
    let active = true;
    const carregar = () =>
      void supabase.rpc('pp_last_stock_sync').then(({ data, error }) => {
        if (!active) return;
        if (error) console.error('Stock sync info error:', error);
        setSync(((data ?? []) as StockSync[])[0] ?? null);
        setCarregado(true);
        setAgora(Date.now());
      });
    carregar();
    const recarga = window.setInterval(carregar, RECARREGAR_MS);
    const relogio = window.setInterval(() => setAgora(Date.now()), 60 * 1000);
    return () => {
      active = false;
      window.clearInterval(recarga);
      window.clearInterval(relogio);
    };
  }, []);

  if (!carregado) return null;

  return (
    <div
      className="flex items-center gap-2.5 rounded-xl border border-border bg-card px-3.5 py-2 text-xs text-muted-foreground"
      title={
        sync?.pecas_atualizadas != null
          ? `${sync.pecas_atualizadas} peça(s) com saldo alterado nesta sincronização`
          : undefined
      }
    >
      <RefreshCw size={14} className="shrink-0 text-brand-strong" aria-hidden="true" />
      {sync ? (
        <span>
          Saldo de estoque atualizado em{' '}
          <span className="font-semibold text-foreground">{dataHora.format(new Date(sync.synced_at))}</span>
          <span className="ml-1.5 text-muted-foreground/80">({haQuantoTempo(sync.synced_at, agora)})</span>
        </span>
      ) : (
        <span>Saldo de estoque ainda não sincronizado automaticamente.</span>
      )}
    </div>
  );
}
