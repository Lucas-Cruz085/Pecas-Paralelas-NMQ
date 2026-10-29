import { requireUser } from '../_shared/auth.ts';
import { audit } from '../_shared/audit.ts';
import { parse, serve, z } from '../_shared/http.ts';

const schema = z.object({
  evento: z.enum(['MFA_ATIVADO', 'MFA_REMOVIDO', 'MFA_FALHA']),
});

serve(async (ctx) => {
  const auth = await requireUser(ctx, { allowPendingPassword: true });
  const input = parse(schema, ctx.body);
  if (input.evento === 'MFA_REMOVIDO' && auth.aal !== 'aal2') {
    return { ok: false };
  }
  await audit(auth.svc, ctx, {
    actorId: auth.user.id,
    action: input.evento,
    tableName: 'auth.mfa_factors',
    recordId: auth.user.id,
    sessionId: auth.sessionId,
    username: auth.profile.username,
  });
  return { ok: true };
});
