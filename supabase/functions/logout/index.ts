import { anonClient, decodeJwt, serviceClient } from '../_shared/clients.ts';
import { audit } from '../_shared/audit.ts';
import { HttpError, serve } from '../_shared/http.ts';

serve(async (ctx) => {
  const header = ctx.req.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) throw new HttpError(401, 'UNAUTHENTICATED', 'Sessão não autenticada.');

  const { data, error } = await anonClient(token).auth.getUser(token);
  if (error || !data.user) return { ok: true };

  const svc = serviceClient();
  const sessionId = decodeJwt(token).session_id ?? null;
  const { data: rows } = await svc
    .from('pp_user_activity_sessions')
    .select('id, login_at, session_id, username')
    .eq('user_id', data.user.id)
    .is('logout_at', null)
    .order('login_at', { ascending: false });
  const current = (rows ?? []).find((row) => row.session_id === sessionId) ?? rows?.[0];
  if (current) {
    const now = new Date();
    await svc
      .from('pp_user_activity_sessions')
      .update({
        logout_at: now.toISOString(),
        duration_seconds: Math.max(0, Math.round((now.getTime() - new Date(current.login_at).getTime()) / 1000)),
      })
      .eq('id', current.id);
  }
  await audit(svc, ctx, {
    actorId: data.user.id,
    action: 'LOGOUT',
    tableName: 'auth',
    username: current?.username ?? null,
    sessionId,
  });
  await svc.auth.admin.signOut(token, 'local').catch(() => undefined);
  return { ok: true };
});
