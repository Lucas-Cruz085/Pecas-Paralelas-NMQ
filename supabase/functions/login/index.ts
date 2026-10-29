import { anonClient, decodeJwt, serviceClient } from '../_shared/clients.ts';
import { audit } from '../_shared/audit.ts';
import { HttpError, parse, serve, z } from '../_shared/http.ts';
import { DOMINIO_TECNICO, USERNAME_RE } from '../_shared/portalConfig.ts';
import { closeActivitySessions } from '../_shared/sessions.ts';
import { throttleKey, throttleRegister, throttleStatus, turnstileEnabled, verifyTurnstile } from '../_shared/throttle.ts';

const INVALID = 'Usuário ou senha inválidos.';
const BLOCKED = 'Muitas tentativas. Aguarde alguns minutos e tente novamente.';
const CAPTCHA_AFTER = 3;

const schema = z.object({
  usuario: z.string().trim().toLowerCase().max(120),
  senha: z.string().min(1).max(200),
  captcha: z.string().max(4096).optional(),
});

serve(async (ctx) => {
  const input = parse(schema, ctx.body);
  const svc = serviceClient();
  const ipKey = await throttleKey(`ip:${ctx.ip ?? 'desconhecido'}`);
  const userKey = await throttleKey(`user:${input.usuario}`);

  const [ipState, userState] = await Promise.all([
    throttleStatus(svc, ipKey, 'login_ip'),
    throttleStatus(svc, userKey, 'login_user'),
  ]);
  if (ipState.blocked || userState.blocked) throw new HttpError(429, 'RATE_LIMITED', BLOCKED);

  const failures = Math.max(ipState.count, userState.count);
  if (turnstileEnabled() && failures >= CAPTCHA_AFTER && !(await verifyTurnstile(input.captcha, ctx.ip))) {
    throw new HttpError(400, 'CAPTCHA_REQUIRED', 'Confirme que você não é um robô.', { captcha_required: true });
  }

  const fail = async (reason: string, userId: string | null = null): Promise<never> => {
    const [ipAfter, userAfter] = await Promise.all([
      throttleRegister(svc, ipKey, 'login_ip', true, 20),
      throttleRegister(svc, userKey, 'login_user', true, 5),
    ]);
    await audit(svc, ctx, {
      actorId: userId,
      action: 'LOGIN_FALHA',
      tableName: 'auth',
      username: USERNAME_RE.test(input.usuario) ? input.usuario : null,
      metadata: { motivo: reason },
    });
    if (ipAfter.blocked || userAfter.blocked) throw new HttpError(429, 'RATE_LIMITED', BLOCKED);
    const captchaRequired = turnstileEnabled() && Math.max(ipAfter.count, userAfter.count) >= CAPTCHA_AFTER;
    throw new HttpError(401, 'INVALID_CREDENTIALS', INVALID, { captcha_required: captchaRequired });
  };

  if (!USERNAME_RE.test(input.usuario)) return fail('formato');

  const client = anonClient();
  const { data, error } = await client.auth.signInWithPassword({
    email: `${input.usuario}@${DOMINIO_TECNICO}`,
    password: input.senha,
  });
  if (error || !data.session || !data.user) return fail('credenciais');

  const discard = () => client.auth.signOut({ scope: 'local' }).catch(() => undefined);

  const { data: profile } = await svc
    .from('pp_profiles')
    .select('id, username, active, must_change_password, temp_password_expires_at')
    .eq('id', data.user.id)
    .maybeSingle();

  // Conta do Auth sem perfil neste portal (ex.: usuário de outro sistema do projeto).
  if (!profile) {
    await discard();
    return fail('sem_perfil');
  }
  if (!profile.active) {
    await discard();
    await audit(svc, ctx, { actorId: profile.id, action: 'LOGIN_FALHA', tableName: 'auth', username: profile.username, metadata: { motivo: 'inativo' } });
    throw new HttpError(403, 'ACCOUNT_DISABLED', 'Esta conta está desativada. Procure o administrador.');
  }
  if (
    profile.must_change_password &&
    profile.temp_password_expires_at &&
    new Date(profile.temp_password_expires_at).getTime() < Date.now()
  ) {
    await discard();
    await audit(svc, ctx, { actorId: profile.id, action: 'LOGIN_FALHA', tableName: 'auth', username: profile.username, metadata: { motivo: 'senha_temporaria_expirada' } });
    throw new HttpError(403, 'TEMP_PASSWORD_EXPIRED', 'Senha temporária expirada. Peça um novo reset ao administrador.');
  }

  await Promise.all([
    throttleRegister(svc, ipKey, 'login_ip', false),
    throttleRegister(svc, userKey, 'login_user', false),
  ]);

  const sessionId = decodeJwt(data.session.access_token).session_id ?? null;
  await closeActivitySessions(svc, profile.id);
  await svc.from('pp_user_activity_sessions').insert({
    user_id: profile.id,
    username: profile.username,
    session_id: sessionId,
    ip_address: ctx.ip,
    user_agent: ctx.userAgent,
  });
  await audit(svc, ctx, { actorId: profile.id, action: 'LOGIN', tableName: 'auth', username: profile.username, sessionId });

  return {
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    must_change_password: profile.must_change_password,
  };
});
