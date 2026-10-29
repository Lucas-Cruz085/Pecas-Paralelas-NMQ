/*
  Contas do Auth compartilhadas com outros sistemas do mesmo projeto Supabase.

  O Auth é do projeto inteiro: quem já tem conta (ex.: adiantamento-viagens) não pode ser
  "criado" de novo. O admin vincula a conta existente ao portal, sem mudar a senha.
  Em conta compartilhada o portal nunca bane, exclui nem troca a senha no Auth, e só
  encerra as sessões abertas pelo próprio portal.
*/

ALTER TABLE public.pp_profiles ADD COLUMN IF NOT EXISTS shared_account boolean NOT NULL DEFAULT false;

-- Perfis que não foram criados pelo portal (admin-create-user grava app_metadata.portal).
UPDATE public.pp_profiles p
SET shared_account = true
FROM auth.users u
WHERE u.id = p.id
  AND NOT p.shared_account
  AND coalesce(u.raw_app_meta_data ->> 'portal', '') <> 'normaq-pecas-paralelas';

CREATE OR REPLACE FUNCTION public.pp_protect_profile_sensitive_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.role() = 'service_role' OR auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  IF auth.uid() = OLD.id AND NOT EXISTS (
    SELECT 1 FROM public.pp_user_roles r WHERE r.user_id = auth.uid() AND r.role = 'admin'
  ) THEN
    NEW.id := OLD.id;
    NEW.email := OLD.email;
    NEW.username := OLD.username;
    NEW.active := OLD.active;
    NEW.must_change_password := OLD.must_change_password;
    NEW.password_issued_at := OLD.password_issued_at;
    NEW.temp_password_expires_at := OLD.temp_password_expires_at;
    NEW.contact_email := OLD.contact_email;
    NEW.shared_account := OLD.shared_account;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.pp_admin_link_profile(
  p_actor uuid,
  p_id uuid,
  p_username text,
  p_email text,
  p_name text,
  p_department text,
  p_job_title text,
  p_role public.pp_app_role
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.pp_assert_service_role();
  PERFORM set_config('app.actor_id', p_actor::text, true);
  INSERT INTO public.pp_profiles (
    id, username, email, name, department, job_title, active, must_change_password, shared_account
  ) VALUES (
    p_id, p_username, p_email, p_name, p_department, p_job_title, true, false, true
  );
  INSERT INTO public.pp_user_roles (user_id, role) VALUES (p_id, p_role);
END;
$$;

-- Só as sessões que o portal abriu (login grava o session_id em pp_user_activity_sessions).
CREATE OR REPLACE FUNCTION public.pp_revoke_portal_sessions(p_user uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.pp_assert_service_role();
  DELETE FROM auth.refresh_tokens rt
  WHERE rt.user_id = p_user::text
    AND rt.session_id::text IN (
      SELECT a.session_id FROM public.pp_user_activity_sessions a
      WHERE a.user_id = p_user AND a.session_id IS NOT NULL
    );
  DELETE FROM auth.sessions s
  WHERE s.user_id = p_user
    AND s.id::text IN (
      SELECT a.session_id FROM public.pp_user_activity_sessions a
      WHERE a.user_id = p_user AND a.session_id IS NOT NULL
    );
END;
$$;

-- Contas do Auth que ainda não têm acesso ao portal (para "Vincular conta existente").
CREATE OR REPLACE FUNCTION public.pp_admin_list_auth_candidates(p_domain text)
RETURNS TABLE (
  id uuid,
  username text,
  email text,
  name text,
  department text,
  username_valid boolean,
  created_at timestamptz,
  last_sign_in_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_outros boolean := to_regclass('public.profiles') IS NOT NULL;
BEGIN
  IF NOT public.pp_session_allowed()
     OR NOT EXISTS (SELECT 1 FROM public.pp_user_roles r WHERE r.user_id = auth.uid() AND r.role = 'admin') THEN
    RAISE EXCEPTION 'Apenas administradores podem executar esta ação.' USING ERRCODE = '42501';
  END IF;
  IF p_domain IS NULL OR p_domain !~ '^[a-z0-9.-]+$' THEN
    RAISE EXCEPTION 'Domínio inválido.' USING ERRCODE = '22023';
  END IF;

  -- public.profiles pertence ao outro sistema: só leitura, e só se existir.
  RETURN QUERY EXECUTE format($q$
    SELECT u.id,
           lower(split_part(u.email, '@', 1)),
           lower(u.email)::text,
           left(coalesce(
             nullif(btrim(%1$s ->> 'full_name'), ''),
             nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
             nullif(btrim(u.raw_user_meta_data ->> 'name'), ''),
             initcap(replace(split_part(u.email, '@', 1), '.', ' '))
           ), 120),
           nullif(btrim(%1$s ->> 'setor'), ''),
           lower(split_part(u.email, '@', 1)) ~ '^[a-z0-9]+(\.[a-z0-9]+)+$',
           u.created_at,
           u.last_sign_in_at
    FROM auth.users u
    %2$s
    WHERE u.deleted_at IS NULL
      AND coalesce(u.is_anonymous, false) = false
      AND lower(u.email) LIKE '%%@' || $1
      AND NOT EXISTS (SELECT 1 FROM public.pp_profiles p WHERE p.id = u.id)
    ORDER BY 4
  $q$,
    CASE WHEN v_outros THEN 'to_jsonb(pr)' ELSE 'NULL::jsonb' END,
    CASE WHEN v_outros THEN 'LEFT JOIN public.profiles pr ON pr.id = u.id' ELSE '' END
  ) USING lower(p_domain);
END;
$$;

-- Lista da tela de usuários agora informa se a conta é compartilhada.
DROP FUNCTION IF EXISTS public.pp_admin_list_users();
CREATE FUNCTION public.pp_admin_list_users()
RETURNS TABLE (
  id uuid,
  username text,
  email text,
  name text,
  department text,
  job_title text,
  active boolean,
  must_change_password boolean,
  temp_password_expires_at timestamptz,
  role text,
  mfa_enabled boolean,
  shared_account boolean,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
BEGIN
  IF NOT public.pp_session_allowed()
     OR NOT EXISTS (SELECT 1 FROM public.pp_user_roles r WHERE r.user_id = auth.uid() AND r.role = 'admin') THEN
    RAISE EXCEPTION 'Apenas administradores podem executar esta ação.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT p.id, p.username, p.email, p.name, p.department, p.job_title, p.active,
         p.must_change_password, p.temp_password_expires_at,
         coalesce((SELECT r.role::text FROM public.pp_user_roles r WHERE r.user_id = p.id ORDER BY r.role LIMIT 1), 'user'),
         EXISTS (SELECT 1 FROM auth.mfa_factors f WHERE f.user_id = p.id AND f.status = 'verified'),
         p.shared_account,
         p.created_at
  FROM public.pp_profiles p
  ORDER BY p.name;
END;
$$;

REVOKE ALL ON FUNCTION
  public.pp_admin_link_profile(uuid, uuid, text, text, text, text, text, public.pp_app_role),
  public.pp_revoke_portal_sessions(uuid),
  public.pp_admin_list_auth_candidates(text),
  public.pp_admin_list_users()
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.pp_admin_list_auth_candidates(text),
  public.pp_admin_list_users()
TO authenticated;

GRANT EXECUTE ON FUNCTION
  public.pp_admin_link_profile(uuid, uuid, text, text, text, text, text, public.pp_app_role),
  public.pp_revoke_portal_sessions(uuid)
TO service_role;
