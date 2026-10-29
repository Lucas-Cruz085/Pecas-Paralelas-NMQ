import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { RequestContext } from './http.ts';

export interface AuditEvent {
  actorId: string | null;
  action: string;
  tableName?: string | null;
  recordId?: string | null;
  reason?: string | null;
  metadata?: Record<string, unknown>;
  sessionId?: string | null;
  username?: string | null;
}

/** Grava um evento de auditoria. Nunca passe senha, token, chave ou segredo TOTP em metadata. */
export async function audit(svc: SupabaseClient, ctx: RequestContext, event: AuditEvent): Promise<void> {
  const { error } = await svc.rpc('pp_audit_write', {
    p_actor_id: event.actorId,
    p_action: event.action,
    p_table_name: event.tableName ?? null,
    p_record_id: event.recordId ?? null,
    p_reason: event.reason ?? null,
    p_metadata: event.metadata ?? {},
    p_ip: ctx.ip,
    p_user_agent: ctx.userAgent,
    p_request_id: ctx.requestId,
    p_session_id: event.sessionId ?? null,
    p_username: event.username ?? null,
  });
  if (error) console.error(`[${ctx.requestId}] falha ao auditar ${event.action}:`, error.code ?? 'sem código');
}
