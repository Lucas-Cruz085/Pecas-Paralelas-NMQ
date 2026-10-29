import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

/** Encerra as linhas de atividade abertas (mantém a sessão indicada, se houver). */
export async function closeActivitySessions(svc: SupabaseClient, userId: string, keepSessionId?: string | null) {
  const { data } = await svc
    .from('pp_user_activity_sessions')
    .select('id, login_at, session_id')
    .eq('user_id', userId)
    .is('logout_at', null);
  const now = new Date();
  await Promise.all(
    (data ?? [])
      .filter((row) => !keepSessionId || row.session_id !== keepSessionId)
      .map((row) =>
        svc
          .from('pp_user_activity_sessions')
          .update({
            logout_at: now.toISOString(),
            duration_seconds: Math.max(0, Math.round((now.getTime() - new Date(row.login_at).getTime()) / 1000)),
          })
          .eq('id', row.id),
      ),
  );
}

/** Revoga sessões e refresh tokens do usuário no Auth e fecha a atividade. */
export async function revokeSessions(svc: SupabaseClient, userId: string, keepSessionId?: string | null) {
  await svc.rpc('pp_revoke_user_sessions', { p_user: userId, p_except_session: keepSessionId ?? null });
  await closeActivitySessions(svc, userId, keepSessionId);
}

/** Conta compartilhada: encerra só as sessões abertas pelo portal (as do outro sistema continuam). */
export async function revokePortalSessions(svc: SupabaseClient, userId: string) {
  await svc.rpc('pp_revoke_portal_sessions', { p_user: userId });
  await closeActivitySessions(svc, userId);
}
