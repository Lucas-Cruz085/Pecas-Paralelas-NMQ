import { anonClient } from '../_shared/clients.ts';
import { requireUser } from '../_shared/auth.ts';
import { audit } from '../_shared/audit.ts';
import { HttpError, dbError, parse, serve, z } from '../_shared/http.ts';
import { PASSWORD_MESSAGES, isPasswordPwned, validatePassword } from '../_shared/password.ts';
import { revokeSessions } from '../_shared/sessions.ts';
import { throttleKey, throttleRegister, throttleStatus } from '../_shared/throttle.ts';

const schema = z.object({
  senha_atual: z.string().min(1, 'Informe a senha atual.').max(200),
  nova_senha: z.string().min(1, 'Informe a nova senha.').max(200),
});

serve(async (ctx) => {
  const auth = await requireUser(ctx, { allowPendingPassword: true, aal2IfEnrolled: true });
  const input = parse(schema, ctx.body);
  const svc = auth.svc;

  const key = await throttleKey(`pwchange:${auth.user.id}`);
  if ((await throttleStatus(svc, key, 'pwchange_user')).blocked) {
    throw new HttpError(429, 'RATE_LIMITED', 'Muitas tentativas. Aguarde alguns minutos e tente novamente.');
  }

  const verifier = anonClient();
  const { error: verifyError } = await verifier.auth.signInWithPassword({ email: auth.profile.email, password: input.senha_atual });
  if (verifyError) {
    await throttleRegister(svc, key, 'pwchange_user', true, 5);
    throw new HttpError(400, 'WRONG_PASSWORD', 'Senha atual incorreta.');
  }
  await verifier.auth.signOut({ scope: 'local' }).catch(() => undefined);
  await throttleRegister(svc, key, 'pwchange_user', false);

  const policyError = validatePassword(input.nova_senha);
  if (policyError) throw new HttpError(400, 'WEAK_PASSWORD', policyError);
  if (input.nova_senha === input.senha_atual) throw new HttpError(400, 'SAME_PASSWORD', 'A nova senha precisa ser diferente da atual.');

  const pwned = await isPasswordPwned(input.nova_senha);
  if (pwned) throw new HttpError(400, 'PWNED_PASSWORD', PASSWORD_MESSAGES.pwned);
  if (pwned === null) console.warn(`[${ctx.requestId}] HIBP indisponível; senha aceita sem a verificação de vazamento.`);

  const { error: authError } = await svc.auth.admin.updateUserById(auth.user.id, {
    password: input.nova_senha,
    app_metadata: { ...(auth.user.app_metadata ?? {}), must_change_password: false },
  });
  if (authError) {
    const weak = /weak|pwned|leak/i.test(authError.message ?? '');
    throw new HttpError(400, 'PASSWORD_REJECTED', weak ? PASSWORD_MESSAGES.pwned : 'Não foi possível trocar a senha. Tente novamente.');
  }

  const { error: stateError } = await svc.rpc('pp_admin_set_password_state', {
    p_actor: auth.user.id,
    p_id: auth.user.id,
    p_must_change: false,
    p_issued_at: null,
    p_expires_at: null,
  });
  if (stateError) throw dbError(stateError);

  await revokeSessions(svc, auth.user.id, auth.sessionId);
  await audit(svc, ctx, {
    actorId: auth.user.id,
    action: 'SENHA_ALTERADA',
    tableName: 'pp_profiles',
    recordId: auth.user.id,
    metadata: { primeiro_acesso: auth.profile.must_change_password },
    sessionId: auth.sessionId,
    username: auth.profile.username,
  });
  return { ok: true };
});
