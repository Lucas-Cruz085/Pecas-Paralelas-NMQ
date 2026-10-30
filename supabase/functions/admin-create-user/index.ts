import { requireUser } from '../_shared/auth.ts';
import { audit } from '../_shared/audit.ts';
import { HttpError, parse, serve, z } from '../_shared/http.ts';
import { generateTemporaryPassword } from '../_shared/password.ts';
import { DOMINIO_TECNICO, SENHA_TEMP_VALIDADE_H, USERNAME_RE } from '../_shared/portalConfig.ts';

const optionalText = z
  .string()
  .trim()
  .max(120)
  .optional()
  .nullable()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || v.length >= 2, 'Setor e cargo precisam ter pelo menos 2 caracteres.');

const schema = z.object({
  usuario: z.string().trim().toLowerCase().regex(USERNAME_RE, 'Use o formato nome.sobrenome, só letras minúsculas e números.'),
  nome: z.string().trim().min(2, 'Informe o nome completo.').max(120, 'Nome muito longo.'),
  setor: optionalText,
  cargo: optionalText,
  papel: z.enum(['admin', 'user', 'consultor']),
});

serve(async (ctx) => {
  const auth = await requireUser(ctx, { admin: true, stepUp: true });
  const input = parse(schema, ctx.body);
  const svc = auth.svc;
  const email = `${input.usuario}@${DOMINIO_TECNICO}`;

  const { data: existing } = await svc.from('pp_profiles').select('id').eq('username', input.usuario).maybeSingle();
  if (existing) throw new HttpError(409, 'DUPLICATE', 'Usuário já existe.');

  const password = generateTemporaryPassword();
  const expiresAt = new Date(Date.now() + SENHA_TEMP_VALIDADE_H * 3_600_000).toISOString();

  const { data: created, error: createError } = await svc.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { role: input.papel, must_change_password: true, portal: 'normaq-pecas-paralelas' },
    user_metadata: { name: input.nome },
  });
  if (createError || !created.user) {
    const duplicated = /already|registered|exists/i.test(createError?.message ?? '');
    if (duplicated) {
      throw new HttpError(
        409,
        'EXISTS_IN_AUTH',
        'Essa pessoa já tem conta corporativa (usada em outro sistema). Use "Vincular conta existente" para dar acesso sem mudar a senha dela.',
        { usuario: input.usuario },
      );
    }
    throw new HttpError(500, 'INTERNAL', 'Não foi possível criar o usuário. Tente novamente.');
  }

  const { error: profileError } = await svc.rpc('pp_admin_create_profile', {
    p_actor: auth.user.id,
    p_id: created.user.id,
    p_username: input.usuario,
    p_email: email,
    p_name: input.nome,
    p_department: input.setor,
    p_job_title: input.cargo,
    p_role: input.papel,
    p_temp_expires_at: expiresAt,
  });
  if (profileError) {
    const { error: rollbackError } = await svc.auth.admin.deleteUser(created.user.id);
    if (rollbackError) {
      throw new HttpError(500, 'PARTIAL', 'A conta foi criada, mas o papel não foi aplicado. Exclua o usuário no painel do Auth e tente de novo.');
    }
    throw new HttpError(500, 'INTERNAL', 'Não foi possível criar o usuário. Tente novamente.');
  }

  await audit(svc, ctx, {
    actorId: auth.user.id,
    action: 'USUARIO_CRIADO',
    tableName: 'pp_profiles',
    recordId: created.user.id,
    metadata: { usuario: input.usuario, papel: input.papel },
    sessionId: auth.sessionId,
    username: auth.profile.username,
  });

  return { user_id: created.user.id, usuario: input.usuario, senha_temporaria: password, expira_em: expiresAt };
});
