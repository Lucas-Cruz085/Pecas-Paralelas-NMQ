import { requireUser } from '../_shared/auth.ts';
import { audit } from '../_shared/audit.ts';
import { HttpError, dbError, parse, serve, z } from '../_shared/http.ts';

const schema = z.object({ user_id: z.string().uuid('Usuário inválido.') });

serve(async (ctx) => {
  const auth = await requireUser(ctx, { admin: true });
  const input = parse(schema, ctx.body);

  const { data: handled, error } = await auth.svc.rpc('pp_admin_handle_reset_requests', {
    p_actor: auth.user.id,
    p_user: input.user_id,
    p_status: 'dismissed',
  });
  if (error) throw dbError(error);
  if (!handled) throw new HttpError(404, 'NOT_FOUND', 'Não há pedido pendente para este usuário.');

  await audit(auth.svc, ctx, {
    actorId: auth.user.id,
    action: 'SENHA_PEDIDO_DISPENSADO',
    tableName: 'pp_password_reset_requests',
    recordId: input.user_id,
    sessionId: auth.sessionId,
    username: auth.profile.username,
  });
  return { ok: true };
});
