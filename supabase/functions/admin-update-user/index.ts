import { assertStepUp, requireUser } from '../_shared/auth.ts';
import { audit } from '../_shared/audit.ts';
import { HttpError, dbError, parse, serve, z } from '../_shared/http.ts';
import { revokePortalSessions, revokeSessions } from '../_shared/sessions.ts';

const optionalText = z
  .string()
  .trim()
  .max(120)
  .optional()
  .nullable()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || v.length >= 2, 'Setor e cargo precisam ter pelo menos 2 caracteres.');

const schema = z.object({
  user_id: z.string().uuid('Usuário inválido.'),
  nome: z.string().trim().min(2, 'Informe o nome completo.').max(120, 'Nome muito longo.'),
  setor: optionalText,
  cargo: optionalText,
  papel: z.enum(['admin', 'user', 'consultor']),
  ativo: z.boolean(),
});

const BAN_FOREVER = '876000h';

serve(async (ctx) => {
  const auth = await requireUser(ctx, { admin: true });
  const input = parse(schema, ctx.body);
  const svc = auth.svc;

  const { data: target } = await svc
    .from('pp_profiles')
    .select('id, username, active, shared_account')
    .eq('id', input.user_id)
    .maybeSingle();
  if (!target) throw new HttpError(404, 'NOT_FOUND', 'Usuário não encontrado.');

  const { data: roles } = await svc.from('pp_user_roles').select('role').eq('user_id', input.user_id);
  const has = (role: string) => roles?.some((r) => r.role === role);
  const currentRole = has('admin') ? 'admin' : has('user') ? 'user' : has('consultor') ? 'consultor' : 'user';
  const roleChanged = currentRole !== input.papel;
  const activeChanged = target.active !== input.ativo;

  if (input.user_id === auth.user.id) {
    if (input.papel !== 'admin') throw new HttpError(400, 'SELF_DEMOTE', 'Você não pode remover o seu próprio acesso de administrador.');
    if (!input.ativo) throw new HttpError(400, 'SELF_DISABLE', 'Você não pode desativar a si mesmo.');
  }
  if (roleChanged || activeChanged) assertStepUp(auth);

  const { error } = await svc.rpc('pp_admin_update_profile', {
    p_actor: auth.user.id,
    p_id: input.user_id,
    p_name: input.nome,
    p_department: input.setor,
    p_job_title: input.cargo,
    p_active: input.ativo,
    p_role: input.papel,
  });
  if (error) throw dbError(error);

  const base = { actorId: auth.user.id, tableName: 'pp_profiles', recordId: input.user_id, sessionId: auth.sessionId, username: auth.profile.username };

  // Conta compartilhada: banir ou mexer no app_metadata afetaria o outro sistema.
  if ((roleChanged || activeChanged) && !target.shared_account) {
    const { data: authUser } = await svc.auth.admin.getUserById(input.user_id);
    const appMetadata = { ...(authUser?.user?.app_metadata ?? {}), role: input.papel };
    const { error: authError } = await svc.auth.admin.updateUserById(input.user_id, {
      app_metadata: appMetadata,
      ...(activeChanged ? { ban_duration: input.ativo ? 'none' : BAN_FOREVER } : {}),
    });
    if (authError) console.error(`[${ctx.requestId}] falha ao sincronizar Auth:`, authError.status ?? 'sem status');
  }

  if (roleChanged) {
    await audit(svc, ctx, { ...base, action: 'PAPEL_ALTERADO', metadata: { de: currentRole, para: input.papel } });
  }
  if (activeChanged && !input.ativo) {
    await (target.shared_account ? revokePortalSessions(svc, input.user_id) : revokeSessions(svc, input.user_id));
    await audit(svc, ctx, { ...base, action: 'USUARIO_DESATIVADO', metadata: { usuario: target.username } });
  }
  if (activeChanged && input.ativo) {
    await audit(svc, ctx, { ...base, action: 'USUARIO_REATIVADO', metadata: { usuario: target.username } });
  }
  return { ok: true };
});
