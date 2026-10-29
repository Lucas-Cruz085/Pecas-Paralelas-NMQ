import { serviceClient } from '../_shared/clients.ts';
import { audit } from '../_shared/audit.ts';
import { HttpError, parse, serve, z } from '../_shared/http.ts';
import { USERNAME_RE } from '../_shared/portalConfig.ts';
import { throttleKey, throttleRegister, throttleStatus } from '../_shared/throttle.ts';

const GENERIC = 'Se a conta existir, os administradores receberão o pedido.';

const schema = z.object({
  usuario: z.string().trim().toLowerCase().min(1, 'Informe o usuário para solicitar a troca de senha.').max(120),
});

serve(async (ctx) => {
  const input = parse(schema, ctx.body);
  const svc = serviceClient();
  const ipKey = await throttleKey(`ip:${ctx.ip ?? 'desconhecido'}`);

  const state = await throttleStatus(svc, ipKey, 'reset_ip', 3600);
  if (state.blocked) throw new HttpError(429, 'RATE_LIMITED', 'Muitas tentativas. Aguarde alguns minutos e tente novamente.');
  await throttleRegister(svc, ipKey, 'reset_ip', true, 5, 3600, 3600);

  if (!USERNAME_RE.test(input.usuario)) return { message: GENERIC };

  const { data: profile } = await svc
    .from('pp_profiles')
    .select('id, username, active')
    .eq('username', input.usuario)
    .maybeSingle();
  if (!profile || !profile.active) return { message: GENERIC };

  const since = new Date(Date.now() - 15 * 60_000).toISOString();
  const { data: recent } = await svc
    .from('pp_password_reset_requests')
    .select('id')
    .eq('user_id', profile.id)
    .or(`status.eq.open,requested_at.gte."${since}"`)
    .limit(1);
  if (recent && recent.length > 0) return { message: GENERIC };

  const { data: created, error } = await svc
    .from('pp_password_reset_requests')
    .insert({ user_id: profile.id })
    .select('id')
    .single();
  if (!error && created) {
    await audit(svc, ctx, {
      actorId: profile.id,
      action: 'SENHA_PEDIDO',
      tableName: 'pp_password_reset_requests',
      recordId: created.id,
      username: profile.username,
    });
  }
  return { message: GENERIC };
});
