import { requireUser } from '../_shared/auth.ts';
import { audit } from '../_shared/audit.ts';
import { HttpError, dbError, parse, serve, z } from '../_shared/http.ts';
import { DOMINIO_TECNICO, USERNAME_RE } from '../_shared/portalConfig.ts';

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
});

// Dá acesso ao portal a uma conta que já existe no Auth (outro sistema do projeto), sem tocar na senha.
serve(async (ctx) => {
  const auth = await requireUser(ctx, { admin: true, stepUp: true });
  const input = parse(schema, ctx.body);
  const svc = auth.svc;

  const { data: existing } = await svc.from('pp_profiles').select('id').eq('id', input.user_id).maybeSingle();
  if (existing) throw new HttpError(409, 'DUPLICATE', 'Esta pessoa já tem acesso ao portal.');

  const { data: found, error: findError } = await svc.auth.admin.getUserById(input.user_id);
  if (findError || !found?.user) throw new HttpError(404, 'NOT_FOUND', 'Conta não encontrada no Auth.');

  const email = (found.user.email ?? '').toLowerCase();
  const [usuario, dominio] = email.split('@');
  if (dominio !== DOMINIO_TECNICO || !USERNAME_RE.test(usuario ?? '')) {
    throw new HttpError(400, 'NOT_ELIGIBLE', `Só é possível vincular contas no formato nome.sobrenome@${DOMINIO_TECNICO}.`);
  }

  const { data: taken } = await svc.from('pp_profiles').select('id').eq('username', usuario).maybeSingle();
  if (taken) throw new HttpError(409, 'DUPLICATE', 'Já existe um usuário do portal com esse login.');

  const { error } = await svc.rpc('pp_admin_link_profile', {
    p_actor: auth.user.id,
    p_id: input.user_id,
    p_username: usuario,
    p_email: email,
    p_name: input.nome,
    p_department: input.setor,
    p_job_title: input.cargo,
    p_role: input.papel,
  });
  if (error) throw dbError(error);

  await audit(svc, ctx, {
    actorId: auth.user.id,
    action: 'USUARIO_VINCULADO',
    tableName: 'pp_profiles',
    recordId: input.user_id,
    metadata: { usuario, papel: input.papel, conta_compartilhada: true },
    sessionId: auth.sessionId,
    username: auth.profile.username,
  });

  return { usuario };
});
