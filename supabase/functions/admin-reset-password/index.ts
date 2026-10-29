import { requireUser } from '../_shared/auth.ts';
import { audit } from '../_shared/audit.ts';
import { HttpError, dbError, parse, serve, z } from '../_shared/http.ts';
import { generateTemporaryPassword } from '../_shared/password.ts';
import { SENHA_TEMP_VALIDADE_H } from '../_shared/portalConfig.ts';
import { revokeSessions } from '../_shared/sessions.ts';

const schema = z.object({
  user_id: z.string().uuid('Usuário inválido.'),
  motivo: z.string().trim().min(5, 'Informe o motivo (mínimo de 5 caracteres).').max(300, 'Motivo muito longo.'),
});

serve(async (ctx) => {
  const auth = await requireUser(ctx, { admin: true, stepUp: true });
  const input = parse(schema, ctx.body);
  const svc = auth.svc;

  if (input.user_id === auth.user.id) {
    throw new HttpError(400, 'SELF_RESET', 'Use a tela de perfil para trocar a sua própria senha.');
  }
  const { data: target } = await svc
    .from('pp_profiles')
    .select('id, username, must_change_password, password_issued_at, temp_password_expires_at, shared_account')
    .eq('id', input.user_id)
    .maybeSingle();
  if (!target) throw new HttpError(404, 'NOT_FOUND', 'Usuário não encontrado.');
  if (target.shared_account) {
    throw new HttpError(
      409,
      'SHARED_ACCOUNT',
      'Esta conta é compartilhada com outro sistema da empresa. A senha é a mesma nos dois e não pode ser redefinida por aqui.',
    );
  }

  const password = generateTemporaryPassword();
  const issuedAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + SENHA_TEMP_VALIDADE_H * 3_600_000).toISOString();

  const { error: stateError } = await svc.rpc('pp_admin_set_password_state', {
    p_actor: auth.user.id,
    p_id: input.user_id,
    p_must_change: true,
    p_issued_at: issuedAt,
    p_expires_at: expiresAt,
  });
  if (stateError) throw dbError(stateError);

  const { data: authUser } = await svc.auth.admin.getUserById(input.user_id);
  const { error: authError } = await svc.auth.admin.updateUserById(input.user_id, {
    password,
    app_metadata: { ...(authUser?.user?.app_metadata ?? {}), must_change_password: true },
  });
  if (authError) {
    await svc.rpc('pp_admin_set_password_state', {
      p_actor: auth.user.id,
      p_id: input.user_id,
      p_must_change: target.must_change_password,
      p_issued_at: target.password_issued_at,
      p_expires_at: target.temp_password_expires_at,
    });
    throw new HttpError(500, 'INTERNAL', 'Não foi possível gerar a senha temporária. Tente novamente.');
  }

  await revokeSessions(svc, input.user_id);
  await svc.rpc('pp_admin_handle_reset_requests', { p_actor: auth.user.id, p_user: input.user_id, p_status: 'resolved' });
  await audit(svc, ctx, {
    actorId: auth.user.id,
    action: 'SENHA_TEMP_GERADA',
    tableName: 'pp_profiles',
    recordId: input.user_id,
    reason: input.motivo,
    metadata: { usuario: target.username },
    sessionId: auth.sessionId,
    username: auth.profile.username,
  });

  return { usuario: target.username, senha_temporaria: password, expira_em: expiresAt };
});
