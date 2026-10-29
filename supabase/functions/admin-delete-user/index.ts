import { requireUser } from '../_shared/auth.ts';
import { audit } from '../_shared/audit.ts';
import { HttpError, dbError, parse, serve, z } from '../_shared/http.ts';
import { revokePortalSessions, revokeSessions } from '../_shared/sessions.ts';

const schema = z.object({
  user_id: z.string().uuid('Usuário inválido.'),
  confirmacao: z.string().trim().toLowerCase().max(120),
});

serve(async (ctx) => {
  const auth = await requireUser(ctx, { admin: true, stepUp: true });
  const input = parse(schema, ctx.body);
  const svc = auth.svc;

  if (input.user_id === auth.user.id) throw new HttpError(400, 'SELF_DELETE', 'Não é possível excluir o próprio usuário.');

  const { data: target } = await svc
    .from('pp_profiles')
    .select('id, username, name, shared_account')
    .eq('id', input.user_id)
    .maybeSingle();
  if (!target) throw new HttpError(404, 'NOT_FOUND', 'Usuário não encontrado.');
  if (input.confirmacao !== target.username) throw new HttpError(400, 'CONFIRMATION', 'Digite o usuário exatamente como aparece para confirmar.');

  if (target.shared_account) await revokePortalSessions(svc, input.user_id);

  const { error } = await svc.rpc('pp_admin_delete_profile', { p_actor: auth.user.id, p_id: input.user_id });
  if (error) throw dbError(error);

  // Conta compartilhada continua no Auth: só o acesso ao portal é removido.
  if (!target.shared_account) {
    await revokeSessions(svc, input.user_id);
    const { error: authError } = await svc.auth.admin.deleteUser(input.user_id);
    if (authError && authError.status !== 404) {
      console.error(`[${ctx.requestId}] perfil removido, mas a conta do Auth não:`, authError.status ?? 'sem status');
    }
  }

  await audit(svc, ctx, {
    actorId: auth.user.id,
    action: target.shared_account ? 'USUARIO_DESVINCULADO' : 'USUARIO_EXCLUIDO',
    tableName: 'pp_profiles',
    recordId: input.user_id,
    metadata: { usuario: target.username, nome: target.name, conta_compartilhada: target.shared_account },
    sessionId: auth.sessionId,
    username: auth.profile.username,
  });
  return { ok: true, conta_mantida: target.shared_account };
});
