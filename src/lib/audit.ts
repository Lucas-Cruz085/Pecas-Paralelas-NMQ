import { supabase } from '@/lib/supabase';

type EventoAuditavel = 'VIEW' | 'EXPORT' | 'ACCESS';

/** Registra VIEW/EXPORT/ACCESS sem bloquear a tela (fire-and-forget). */
export function registrarEvento(
  acao: EventoAuditavel,
  tabela: string | null,
  registro: string | null = null,
  metadata: { format?: string; kind?: string; rows?: number } = {},
) {
  void supabase
    .rpc('pp_record_audit_event', { p_action: acao, p_table_name: tabela, p_record_id: registro, p_reason: null, p_metadata: metadata })
    .then(({ error }) => {
      if (error) console.warn('Não foi possível registrar o evento de auditoria.');
    });
}
