# Portal de Peças Paralelas (NORMAQ)

Catálogo de peças paralelas (consulta, cadastro, importação de planilha e fotos) dentro de um portal corporativo seguro: login `nome.sobrenome`, MFA TOTP, troca obrigatória da senha temporária, gestão de usuários, auditoria imutável e página LGPD.

Stack: React 18, Vite 7, TypeScript, Tailwind 3.4, React Router 7, Zod 4, Supabase (Auth, Postgres com RLS, Storage, Edge Functions em Deno).

## Comandos

```bash
npm install
npm run dev        # desenvolvimento
npm run typecheck  # TypeScript
npm test           # Vitest
npm run lint
npm run build
```

## Onde mexer

| O que | Onde |
| --- | --- |
| Nome, logo, cor, frase do login, benefícios, menu, política de MFA, inatividade, validade da senha temporária, retenção | `src/config/portal.ts` |
| Cor da marca usada pelos componentes (`--brand`) e demais tokens dos temas claro e noturno | `src/index.css` |
| Valores de segurança usados no servidor (domínio técnico, step-up, validade da temporária) | `supabase/functions/_shared/portalConfig.ts` (um teste garante que batem com `portal.ts`) |
| Política de senha | `src/shared/passwordPolicy.ts` e a cópia idêntica em `supabase/functions/_shared/passwordPolicy.ts` (um teste garante que são iguais) |

Logos: coloque `public/brand/logo-horizontal.png` (menu aberto, fundo branco) e, se quiser, `public/brand/login-bg.jpg` (fundo do login). Sem eles, o portal mostra o nome da empresa e um fundo de cidade à noite.

### Criar uma página nova dentro do shell

1. Crie o componente em `src/features/<area>/MinhaPagina.tsx` usando o kit de `@/components/ui` (`PageHeader`, `Card`, `Table`, `FilterPanel`, `ConfirmDialog` etc.) e só tokens de cor (`bg-card`, `text-foreground`, `bg-brand`...).
2. Registre a rota em `src/App.tsx`, dentro do bloco `RotaProtegida`. Se for só para admin, envolva em `SomenteAdmin`.
3. Acrescente o item em `MENU` (`src/config/portal.ts`), com `somenteAdmin: true` se for o caso. Esconder do menu é só UX: a permissão real fica na RLS e nas Edge Functions.

## Arquitetura de segurança (resumo)

- **Projeto Supabase compartilhado** com o sistema "adiantamento-viagens": tudo deste portal usa o prefixo `pp_` (`pp_profiles`, `pp_user_roles`, `pp_audit_logs`...). As tabelas `profiles`, `user_roles` e a função `has_role` do outro sistema não são tocadas. Um usuário do Auth sem linha em `pp_profiles` não entra neste portal ("Usuário ou senha inválidos.").
- **RLS** em todas as tabelas `pp_` e em `parts`, com uma política `RESTRICTIVE` baseada em `pp_session_allowed()` (perfil ativo, sem troca de senha pendente e AAL2 quando o MFA é obrigatório ou já cadastrado). O acesso anônimo ao catálogo e ao upload de fotos foi removido; a leitura pública das fotos continua.
- **Edge Functions** (`supabase/functions`) fazem toda operação privilegiada: `login`, `logout`, `request-password-reset`, `dismiss-reset-request`, `admin-create-user`, `admin-update-user`, `admin-reset-password`, `change-own-password`, `admin-reset-mfa`, `admin-delete-user`, `mfa-events`. Eventos VIEW/EXPORT/ACCESS vão direto pela RPC `pp_record_audit_event`.
- **Auditoria** em `pp_audit_logs`: trigger em `pp_profiles`, `pp_user_roles`, `pp_app_settings` e `parts`; eventos de segurança gravados pelas Edge Functions com o ator explícito; UPDATE sempre bloqueado e DELETE só pela rotina de retenção (`pp_apply_data_retention`).

## Implantação (ordem recomendada)

1. **Migration**: aplique `supabase/migrations/20261029170000_portal_seguranca.sql` (SQL Editor ou `supabase db push`). A partir daqui o catálogo exige login; faça os passos 2 a 4 em seguida.
2. **Secrets** das Edge Functions:
   ```bash
   supabase secrets set ALLOWED_ORIGINS="https://seu-dominio,http://localhost:5173" \
     THROTTLE_HMAC_KEY="<32+ caracteres aleatórios>" \
     TURNSTILE_SECRET_KEY="<opcional>"
   ```
   `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` já são injetadas pelo Supabase nas funções. Tire o `localhost` de `ALLOWED_ORIGINS` em produção.
3. **Edge Functions**: `supabase functions deploy` (o `supabase/config.toml` desliga a verificação de JWT só em `login` e `request-password-reset`).
4. **Primeiro admin** (manual):
   - No painel Auth > Users, crie `lucas.cruz@normaq.local` com e-mail confirmado e uma senha forte digitada por você.
   - No SQL Editor:
     ```sql
     insert into public.pp_profiles (id, username, email, name, must_change_password)
     select id, 'lucas.cruz', email, 'Lucas Cruz', false from auth.users where email = 'lucas.cruz@normaq.local';
     insert into public.pp_user_roles (user_id, role)
     select id, 'admin' from auth.users where email = 'lucas.cruz@normaq.local';
     update auth.users
        set raw_app_meta_data = raw_app_meta_data || '{"role":"admin","must_change_password":false}'::jsonb
      where email = 'lucas.cruz@normaq.local';
     ```
   - No primeiro login o portal pede o cadastro do MFA. Cadastre também um segundo celular.
5. **Conta de emergência (break-glass)**: crie um segundo admin dedicado (ex.: `emergencia.normaq`), com MFA cadastrado num aparelho guardado com a TI, credenciais offline e uso sempre revisado em Auditoria / Logs.

### MFA em produção sem travar ninguém

A política padrão é `admin` (obrigatório para administradores, opcional para usuários). Cadastre o MFA do primeiro admin e da conta de emergência antes de qualquer mudança. Para exigir de todos, troque `MFA_OBRIGATORIO` em `portal.ts` **e** `update public.pp_app_settings set mfa_policy = 'todos';` (os usuários sem fator serão levados ao cadastro no próximo acesso).

Perda do aparelho: use o segundo fator do próprio usuário ou peça a **outro admin** o "Resetar MFA" em Gestão de usuários. O Supabase não tem códigos de recuperação.

## Configurações manuais no provedor

> **Atenção:** as configurações de Auth valem para o projeto Supabase inteiro, ou seja, também para o "adiantamento-viagens". Combine com o responsável antes de mudar.

1. Desativar "Allow new users to sign up" e logins anônimos (confirme que o outro sistema não depende de cadastro público).
2. Senha mínima 12 com maiúscula, minúscula, número e símbolo; proteção contra senhas vazadas (se o plano permitir) e "Secure password change".
3. Habilitar MFA TOTP; configurar o hook de verificação MFA, se disponível.
4. Expiração do JWT entre 15 e 30 min; tempo máximo de sessão e timeout de inatividade (se o plano permitir).
5. Rate limits do Auth em valores conservadores; criar as chaves do Turnstile (`VITE_TURNSTILE_SITE_KEY` no front e `TURNSTILE_SECRET_KEY` nas funções).
6. Secrets das Edge Functions: `ALLOWED_ORIGINS`, `THROTTLE_HMAC_KEY`, `TURNSTILE_SECRET_KEY` (`SUPABASE_SERVICE_ROLE_KEY` já é injetada).
7. Primeiro admin e conta de emergência como na seção de implantação. Não alterar as senhas dos admins existentes do outro sistema.
8. Alertas externos (e-mail ou chat) para: papel alterado, admin criado, MFA resetado, rajada de `LOGIN_FALHA`, uso da conta de emergência. Exportação periódica dos logs para armazenamento externo imutável.
9. Cabeçalhos de segurança e CSP na hospedagem (HSTS, `frame-ancestors`, `X-Content-Type-Options`). O `index.html` tem um script inline de tema: inclua o hash dele na CSP.

## Suposições adotadas

- Backend no projeto compartilhado "adiantamento-viagens", com prefixo `pp_` em tabelas, funções e políticas.
- Contas compartilhadas: quem já tem conta no Auth do projeto entra no portal por **Gestão de usuários > Vincular conta existente** (mesma senha do outro sistema). Nessas contas (`pp_profiles.shared_account`) o portal não bane, não exclui e não redefine a senha no Auth; desativar ou remover tira só o acesso ao portal e encerra só as sessões abertas por ele. Resetar MFA remove o autenticador também do outro sistema.
- Peças podem ser criadas, editadas e excluídas por qualquer usuário logado com sessão válida (admin ou usuário). O catálogo deixou de ser público.
- Página inicial após o login: `/catalogo` (o uso principal do portal). O `/dashboard` mostra indicadores reais do catálogo.
- Senha temporária válida por 72 h; sem expiração periódica de senha.
- O script local de importação em lote (que usava a chave anônima) não funciona mais depois da migration; use a tela Importar (Excel e Fotos), já logado.
- Turnstile é opcional: sem as chaves, o login segue só com o limite de tentativas (5 falhas em 15 min por usuário, 20 por IP).
