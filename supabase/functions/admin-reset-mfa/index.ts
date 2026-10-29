import { requireUser } from '../_shared/auth.ts';
import { audit } from '../_shared/audit.ts';
import { HttpError, parse, serve, z } from '../_shared/http.ts';
import { revokePortalSessions, revokeSessions } from '../_shared/sessions.ts';

const schema = z.object({
  user_id: z.string().uuid('Usuário inválido.'),
  motivo: z.string().trim().min(5, 'Informe o motivo (mínimo de 5 caracteres).').max(300, 'Motivo muito longo.'),
});

serve(async (ctx) => {
  const auth = await requireUser(ctx, { admin: true, stepUp: true });
  const input = parse(schema, ctx.body);
  const svc = auth.svc;

  if (input.user_id === auth.user.id) {
    throw new HttpError(400, 'SELF_MFA_RESET', 'Para trocar o seu próprio autenticador, use a tela de segurança do perfil.');
  }
  const { data: target } = await svc.from('pp_profiles').select('id, username, shared_account').eq('id', input.user_id).maybeSingle();
  if (!target) throw new HttpError(404, 'NOT_FOUND', 'Usuário não encontrado.');

  const { data: factors, error: listError } = await svc.auth.admin.mfa.listFactors({ userId: input.user_id });
  if (listError) throw new HttpError(500, 'INTERNAL', 'Não foi possível consultar o autenticador. Tente novamente.');
  for (const factor of factors?.factors ?? []) {
    const { error } = await svc.auth.admin.mfa.deleteFactor({ id: factor.id, userId: input.user_id });
    if (error) throw new HttpError(500, 'INTERNAL', 'Não foi possível remover o autenticador. Tente novamente.');
  }

  await (target.shared_account ? revokePortalSessions(svc, input.user_id) : revokeSessions(svc, input.user_id));
  await audit(svc, ctx, {
    actorId: auth.user.id,
    action: 'MFA_RESETADO_POR_ADMIN',
    tableName: 'auth.mfa_factors',
    recordId: input.user_id,
    reason: input.motivo,
    metadata: { usuario: target.username, fatores: factors?.factors?.length ?? 0, conta_compartilhada: target.shared_account },
    sessionId: auth.sessionId,
    username: auth.profile.username,
  });
  return { ok: true };
});
