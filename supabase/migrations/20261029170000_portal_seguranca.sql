/*
# Portal de Peças Paralelas — base de segurança (usuários, papéis, MFA, sessões, auditoria, LGPD)

IMPORTANTE: este banco é compartilhado com outro sistema (adiantamento-viagens).
Tudo do portal usa o prefixo `pp_` para não tocar em `profiles`, `user_roles`, `has_role`
nem em políticas de outras tabelas/buckets. Contas do outro sistema não têm linha em
`pp_profiles` e, por isso, não acessam nada deste portal.

1. Tabelas: pp_profiles, pp_user_roles, pp_app_settings, pp_user_activity_sessions,
   pp_password_reset_requests, pp_auth_throttle, pp_audit_logs
2. Funções: pp_has_role, pp_session_allowed, pp_profile_active, auditoria (trigger, write,
   record_event, search), sessões (touch, revoke), funções administrativas só de service_role
3. RLS: permissivas por papel/dono + RESTRICTIVE com pp_session_allowed() em todas as tabelas
4. parts e bucket part-photos deixam de aceitar anon: exigem login com sessão liberada
*/

-- ---------------------------------------------------------------------------
-- 1. Tipos e tabelas
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE public.pp_app_role AS ENUM ('admin', 'user');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.pp_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  username text NOT NULL UNIQUE CHECK (username ~ '^[a-z0-9]+(\.[a-z0-9]+)+$'),
  email text NOT NULL UNIQUE,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 2 AND 120),
  department text CHECK (department IS NULL OR char_length(btrim(department)) BETWEEN 2 AND 120),
  job_title text CHECK (job_title IS NULL OR char_length(btrim(job_title)) BETWEEN 2 AND 120),
  contact_email text,
  active boolean NOT NULL DEFAULT true,
  must_change_password boolean NOT NULL DEFAULT true,
  password_issued_at timestamptz,
  temp_password_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pp_user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  role public.pp_app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

CREATE TABLE IF NOT EXISTS public.pp_app_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  mfa_policy text NOT NULL DEFAULT 'admin' CHECK (mfa_policy IN ('admin', 'todos')),
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.pp_app_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

-- user_id sem FK: a trilha de acesso sobrevive à exclusão do usuário.
CREATE TABLE IF NOT EXISTS public.pp_user_activity_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  username text,
  session_id text,
  ip_address text,
  user_agent text,
  login_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  logout_at timestamptz,
  duration_seconds integer,
  CHECK (logout_at IS NULL OR logout_at >= login_at)
);
CREATE INDEX IF NOT EXISTS idx_pp_sessions_user ON public.pp_user_activity_sessions (user_id, login_at DESC);

CREATE TABLE IF NOT EXISTS public.pp_password_reset_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  requested_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'dismissed', 'resolved')),
  handled_by uuid,
  handled_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_pp_reset_open ON public.pp_password_reset_requests (user_id) WHERE status = 'open';

CREATE TABLE IF NOT EXISTS public.pp_auth_throttle (
  key_hash text NOT NULL,
  kind text NOT NULL,
  window_start timestamptz NOT NULL DEFAULT now(),
  count integer NOT NULL DEFAULT 0,
  blocked_until timestamptz,
  PRIMARY KEY (key_hash, kind)
);

CREATE TABLE IF NOT EXISTS public.pp_audit_logs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid,
  username text,
  action text NOT NULL,
  table_name text,
  record_id text,
  changed_fields text[] NOT NULL DEFAULT '{}',
  old_value jsonb,
  new_value jsonb,
  field_changes jsonb NOT NULL DEFAULT '[]'::jsonb,
  ip_address text,
  user_agent text,
  session_id text,
  request_id text,
  transaction_id text,
  reason text,
  log_level text NOT NULL DEFAULT 'detailed' CHECK (log_level IN ('basic', 'detailed', 'transactional')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_pp_audit_created ON public.pp_audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pp_audit_user ON public.pp_audit_logs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pp_audit_table ON public.pp_audit_logs (table_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pp_audit_action ON public.pp_audit_logs (action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pp_audit_fields ON public.pp_audit_logs USING gin (changed_fields);
CREATE INDEX IF NOT EXISTS idx_pp_audit_changes ON public.pp_audit_logs USING gin (field_changes jsonb_path_ops);
CREATE INDEX IF NOT EXISTS idx_pp_audit_tx ON public.pp_audit_logs (transaction_id) WHERE transaction_id IS NOT NULL;

COMMENT ON TABLE public.pp_audit_logs IS
  'Trilha de auditoria append-only do Portal de Peças Paralelas (LGPD arts. 10, 16 e 37). '
  'UPDATE é sempre bloqueado; DELETE só pela rotina de retenção (5 anos, validar com o jurídico). '
  'Senhas, tokens e segredos nunca são gravados; e-mail, CPF e telefone são mascarados.';

-- ---------------------------------------------------------------------------
-- 2. Funções de autorização
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.pp_has_role(_user_id uuid, _role public.pp_app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN auth.role() = 'service_role'
      OR _user_id = (SELECT auth.uid())
      OR EXISTS (SELECT 1 FROM public.pp_user_roles r WHERE r.user_id = (SELECT auth.uid()) AND r.role = 'admin')
    THEN EXISTS (SELECT 1 FROM public.pp_user_roles r WHERE r.user_id = _user_id AND r.role = _role)
    ELSE false
  END;
$$;

CREATE OR REPLACE FUNCTION public.pp_profile_active()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (SELECT 1 FROM public.pp_profiles p WHERE p.id = (SELECT auth.uid()) AND p.active);
$$;

CREATE OR REPLACE FUNCTION public.pp_session_allowed()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_claims jsonb := coalesce(auth.jwt(), '{}'::jsonb);
  v_policy text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;
  IF coalesce(v_claims -> 'app_metadata' ->> 'must_change_password', 'false') = 'true' THEN
    RETURN false;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.pp_profiles p WHERE p.id = v_uid AND p.active AND NOT p.must_change_password
  ) THEN
    RETURN false;
  END IF;
  IF coalesce(v_claims ->> 'aal', 'aal1') = 'aal2' THEN
    RETURN true;
  END IF;

  SELECT s.mfa_policy INTO v_policy FROM public.pp_app_settings s LIMIT 1;
  RETURN coalesce(v_policy, 'admin') = 'admin'
    AND NOT EXISTS (SELECT 1 FROM public.pp_user_roles r WHERE r.user_id = v_uid AND r.role = 'admin')
    AND NOT EXISTS (
      SELECT 1 FROM auth.mfa_factors f
      WHERE f.user_id = v_uid AND f.status = 'verified' AND f.factor_type = 'totp'
    );
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Triggers de proteção
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.pp_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pp_profiles_updated_at ON public.pp_profiles;
CREATE TRIGGER trg_pp_profiles_updated_at
  BEFORE UPDATE ON public.pp_profiles
  FOR EACH ROW EXECUTE FUNCTION public.pp_touch_updated_at();

-- Segunda camada além do GRANT por coluna: o próprio usuário não altera campos sensíveis.
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
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pp_profiles_protect ON public.pp_profiles;
CREATE TRIGGER trg_pp_profiles_protect
  BEFORE UPDATE ON public.pp_profiles
  FOR EACH ROW EXECUTE FUNCTION public.pp_protect_profile_sensitive_columns();

CREATE OR REPLACE FUNCTION public.pp_other_active_admin_exists(p_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.pp_user_roles r
    JOIN public.pp_profiles p ON p.id = r.user_id
    WHERE r.role = 'admin' AND p.active AND r.user_id <> p_user
  );
$$;

CREATE OR REPLACE FUNCTION public.pp_guard_last_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user uuid;
  v_is_admin boolean;
BEGIN
  IF TG_TABLE_NAME = 'pp_user_roles' THEN
    IF OLD.role <> 'admin' OR (TG_OP = 'UPDATE' AND NEW.role = 'admin' AND NEW.user_id = OLD.user_id) THEN
      RETURN coalesce(NEW, OLD);
    END IF;
    v_user := OLD.user_id;
    -- Só importa se o admin removido está ativo.
    IF NOT EXISTS (SELECT 1 FROM public.pp_profiles p WHERE p.id = v_user AND p.active) THEN
      RETURN coalesce(NEW, OLD);
    END IF;
  ELSE
    v_user := OLD.id;
    IF TG_OP = 'UPDATE' AND NOT (OLD.active AND NOT NEW.active) THEN
      RETURN NEW;
    END IF;
    v_is_admin := EXISTS (SELECT 1 FROM public.pp_user_roles r WHERE r.user_id = v_user AND r.role = 'admin');
    IF NOT v_is_admin OR NOT OLD.active THEN
      RETURN coalesce(NEW, OLD);
    END IF;
  END IF;

  IF NOT public.pp_other_active_admin_exists(v_user) THEN
    RAISE EXCEPTION 'Mantenha ao menos um administrador ativo.' USING ERRCODE = 'P0001';
  END IF;
  RETURN coalesce(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_pp_roles_last_admin ON public.pp_user_roles;
CREATE TRIGGER trg_pp_roles_last_admin
  BEFORE UPDATE OR DELETE ON public.pp_user_roles
  FOR EACH ROW EXECUTE FUNCTION public.pp_guard_last_admin();

DROP TRIGGER IF EXISTS trg_pp_profiles_last_admin ON public.pp_profiles;
CREATE TRIGGER trg_pp_profiles_last_admin
  BEFORE UPDATE OR DELETE ON public.pp_profiles
  FOR EACH ROW EXECUTE FUNCTION public.pp_guard_last_admin();

-- ---------------------------------------------------------------------------
-- 4. Auditoria
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.pp_audit_redact_value(p_key text, p_value jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_text text;
  v_digits text;
BEGIN
  IF p_value IS NULL OR p_value = 'null'::jsonb THEN
    RETURN p_value;
  END IF;
  IF p_key IS DISTINCT FROM 'must_change_password'
     AND p_key ~* '(password|senha|token|secret|api_key|access_token|refresh_token|private_key|service_role|credential|authorization)' THEN
    RETURN to_jsonb('[REDACTED]'::text);
  END IF;
  IF jsonb_typeof(p_value) <> 'string' THEN
    RETURN p_value;
  END IF;

  v_text := p_value #>> '{}';
  IF v_text ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RETURN to_jsonb(left(split_part(v_text, '@', 1), 2) || '***@' || split_part(v_text, '@', 2));
  END IF;
  IF v_text ~ '^\d{3}\.\d{3}\.\d{3}-\d{2}$' OR v_text ~ '^\d{11}$' THEN
    RETURN to_jsonb('***.***.***-**'::text);
  END IF;
  IF v_text ~ '^\(?\d{2}\)?\s?9?\d{4}-?\d{4}$' AND v_text ~ '[()\-\s]' THEN
    v_digits := regexp_replace(v_text, '\D', '', 'g');
    RETURN to_jsonb('(' || left(v_digits, 2) || ')****' || right(v_digits, 2));
  END IF;
  IF char_length(v_text) > 240 THEN
    RETURN to_jsonb(left(v_text, 240) || '…');
  END IF;
  RETURN p_value;
END;
$$;

CREATE OR REPLACE FUNCTION public.pp_audit_request_context()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  v_headers jsonb;
  v_ip text;
BEGIN
  BEGIN
    v_headers := coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb);
  EXCEPTION WHEN others THEN
    v_headers := '{}'::jsonb;
  END;
  v_ip := coalesce(
    v_headers ->> 'cf-connecting-ip',
    btrim(split_part(v_headers ->> 'x-forwarded-for', ',', 1)),
    v_headers ->> 'x-real-ip'
  );
  RETURN jsonb_build_object(
    'ip', nullif(v_ip, ''),
    'user_agent', v_headers ->> 'user-agent',
    'request_id', coalesce(v_headers ->> 'x-request-id', v_headers ->> 'cf-ray'),
    'session_id', auth.jwt() ->> 'session_id'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.pp_audit_actor()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL THEN
    BEGIN
      v_actor := nullif(current_setting('app.actor_id', true), '')::uuid;
    EXCEPTION WHEN others THEN
      v_actor := NULL;
    END;
  END IF;
  RETURN v_actor;
END;
$$;

CREATE OR REPLACE FUNCTION public.pp_audit_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ignore text[] := ARRAY['id', 'created_at', 'updated_at', 'last_seen_at', 'duration_seconds', 'search_tsv', 'code_search'];
  v_old jsonb := CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE '{}'::jsonb END;
  v_new jsonb := CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE '{}'::jsonb END;
  v_keys text[];
  v_key text;
  v_before jsonb;
  v_after jsonb;
  v_changed text[] := '{}';
  v_changes jsonb := '[]'::jsonb;
  v_old_values jsonb := '{}'::jsonb;
  v_new_values jsonb := '{}'::jsonb;
  v_actor uuid := public.pp_audit_actor();
  v_ctx jsonb := public.pp_audit_request_context();
  v_record text;
BEGIN
  SELECT array_agg(DISTINCT k) INTO v_keys
  FROM (SELECT jsonb_object_keys(v_old) AS k UNION SELECT jsonb_object_keys(v_new)) s;

  FOREACH v_key IN ARRAY coalesce(v_keys, '{}') LOOP
    CONTINUE WHEN v_key = ANY (v_ignore);
    v_before := v_old -> v_key;
    v_after := v_new -> v_key;
    CONTINUE WHEN TG_OP = 'UPDATE' AND v_before IS NOT DISTINCT FROM v_after;
    CONTINUE WHEN TG_OP = 'INSERT' AND (v_after IS NULL OR v_after = 'null'::jsonb);
    CONTINUE WHEN TG_OP = 'DELETE' AND (v_before IS NULL OR v_before = 'null'::jsonb);

    v_before := public.pp_audit_redact_value(v_key, v_before);
    v_after := public.pp_audit_redact_value(v_key, v_after);
    v_changed := v_changed || v_key;
    v_old_values := v_old_values || jsonb_build_object(v_key, v_before);
    v_new_values := v_new_values || jsonb_build_object(v_key, v_after);
    v_changes := v_changes || jsonb_build_array(jsonb_build_object(
      'campo', v_key,
      'valor_anterior', v_before,
      'valor_novo', v_after,
      'mascarado', (v_before IS DISTINCT FROM v_old -> v_key) OR (v_after IS DISTINCT FROM v_new -> v_key)
    ));
  END LOOP;

  IF TG_OP = 'UPDATE' AND cardinality(v_changed) = 0 THEN
    RETURN NULL;
  END IF;

  v_record := coalesce(v_new ->> 'id', v_old ->> 'id', v_new ->> 'user_id', v_old ->> 'user_id');

  INSERT INTO public.pp_audit_logs (
    user_id, username, action, table_name, record_id, changed_fields, old_value, new_value,
    field_changes, ip_address, user_agent, session_id, request_id, transaction_id, log_level, metadata
  ) VALUES (
    v_actor,
    (SELECT p.username FROM public.pp_profiles p WHERE p.id = v_actor),
    CASE TG_OP WHEN 'INSERT' THEN 'CREATE' WHEN 'UPDATE' THEN 'UPDATE' ELSE 'DELETE' END,
    TG_TABLE_NAME,
    v_record,
    v_changed,
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE v_old_values END,
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE v_new_values END,
    v_changes,
    v_ctx ->> 'ip',
    v_ctx ->> 'user_agent',
    v_ctx ->> 'session_id',
    v_ctx ->> 'request_id',
    txid_current()::text,
    'transactional',
    jsonb_build_object('tg_op', TG_OP, 'table_schema', TG_TABLE_SCHEMA)
  );
  RETURN NULL;
END;
$$;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['pp_profiles', 'pp_user_roles', 'pp_app_settings', 'parts'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_pp_audit ON public.%I', t);
    EXECUTE format(
      'CREATE TRIGGER trg_pp_audit AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.pp_audit_trigger()',
      t
    );
  END LOOP;
END $$;

-- Eventos de segurança: só Edge Functions (service_role), com o ator explícito.
CREATE OR REPLACE FUNCTION public.pp_audit_write(
  p_actor_id uuid,
  p_action text,
  p_table_name text DEFAULT NULL,
  p_record_id text DEFAULT NULL,
  p_reason text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_ip text DEFAULT NULL,
  p_user_agent text DEFAULT NULL,
  p_request_id text DEFAULT NULL,
  p_session_id text DEFAULT NULL,
  p_username text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.pp_audit_logs (
    user_id, username, action, table_name, record_id, reason, metadata,
    ip_address, user_agent, request_id, session_id, transaction_id, log_level
  ) VALUES (
    p_actor_id,
    coalesce(p_username, (SELECT p.username FROM public.pp_profiles p WHERE p.id = p_actor_id)),
    p_action,
    p_table_name,
    p_record_id,
    left(p_reason, 500),
    coalesce(p_metadata, '{}'::jsonb),
    p_ip,
    left(p_user_agent, 400),
    p_request_id,
    p_session_id,
    txid_current()::text,
    'detailed'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.pp_record_audit_event(
  p_action text,
  p_table_name text DEFAULT NULL,
  p_record_id text DEFAULT NULL,
  p_reason text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_ctx jsonb := public.pp_audit_request_context();
  v_meta jsonb := '{}'::jsonb;
  v_key text;
BEGIN
  IF v_uid IS NULL OR NOT public.pp_session_allowed() THEN
    RAISE EXCEPTION 'Sessão não autenticada.' USING ERRCODE = '42501';
  END IF;
  IF p_action NOT IN ('VIEW', 'EXPORT', 'ACCESS') THEN
    RAISE EXCEPTION 'Ação não permitida.' USING ERRCODE = '22023';
  END IF;
  IF p_metadata IS NOT NULL AND octet_length(p_metadata::text) > 2048 THEN
    RAISE EXCEPTION 'Metadados muito grandes.' USING ERRCODE = '22023';
  END IF;

  FOR v_key IN SELECT jsonb_object_keys(coalesce(p_metadata, '{}'::jsonb)) LOOP
    IF v_key IN ('format', 'kind', 'rows') THEN
      v_meta := v_meta || jsonb_build_object(v_key, p_metadata -> v_key);
    END IF;
  END LOOP;
  v_meta := v_meta || jsonb_build_object(
    'is_admin', EXISTS (SELECT 1 FROM public.pp_user_roles r WHERE r.user_id = v_uid AND r.role = 'admin')
  );

  IF p_action IN ('VIEW', 'ACCESS') AND EXISTS (
    SELECT 1 FROM public.pp_audit_logs l
    WHERE l.user_id = v_uid AND l.action = p_action
      AND l.table_name IS NOT DISTINCT FROM p_table_name
      AND l.record_id IS NOT DISTINCT FROM p_record_id
      AND l.created_at > now() - interval '15 minutes'
  ) THEN
    RETURN;
  END IF;

  INSERT INTO public.pp_audit_logs (
    user_id, username, action, table_name, record_id, reason, metadata,
    ip_address, user_agent, session_id, request_id, transaction_id, log_level
  ) VALUES (
    v_uid,
    (SELECT p.username FROM public.pp_profiles p WHERE p.id = v_uid),
    p_action,
    p_table_name,
    p_record_id,
    left(p_reason, 200),
    v_meta,
    v_ctx ->> 'ip',
    v_ctx ->> 'user_agent',
    v_ctx ->> 'session_id',
    v_ctx ->> 'request_id',
    txid_current()::text,
    CASE WHEN p_action = 'EXPORT' THEN 'detailed' ELSE 'basic' END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.pp_search_audit_logs(
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_user_id uuid DEFAULT NULL,
  p_action text DEFAULT NULL,
  p_table_name text DEFAULT NULL,
  p_field text DEFAULT NULL,
  p_limit integer DEFAULT 200,
  p_username text DEFAULT NULL,
  p_detail text DEFAULT NULL
)
RETURNS SETOF public.pp_audit_logs
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT l.*
  FROM public.pp_audit_logs l
  WHERE (p_from IS NULL OR l.created_at >= p_from)
    AND (p_to IS NULL OR l.created_at <= p_to)
    AND (p_user_id IS NULL OR l.user_id = p_user_id)
    AND (p_username IS NULL OR coalesce(l.username, 'sistema') ILIKE '%' || p_username || '%')
    AND (
      p_action IS NULL
      OR l.action = p_action
      OR (p_action = 'CREATE' AND l.action = 'INSERT')
      OR (p_action = 'SENHA' AND l.action LIKE 'SENHA%')
      OR (p_action = 'MFA' AND l.action LIKE 'MFA%')
    )
    AND (p_table_name IS NULL OR l.table_name = p_table_name)
    AND (
      p_field IS NULL
      OR p_field = ANY (l.changed_fields)
      OR l.field_changes @> jsonb_build_array(jsonb_build_object('campo', p_field))
    )
    AND (
      p_detail IS NULL
      OR l.record_id ILIKE '%' || p_detail || '%'
      OR l.reason ILIKE '%' || p_detail || '%'
      OR l.field_changes::text ILIKE '%' || p_detail || '%'
      OR l.metadata::text ILIKE '%' || p_detail || '%'
    )
  ORDER BY l.created_at DESC
  LIMIT greatest(1, least(coalesce(p_limit, 200), 500));
$$;

-- Imutabilidade: UPDATE nunca; DELETE só pela rotina de retenção em linhas antigas.
CREATE OR REPLACE FUNCTION public.pp_audit_logs_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'audit_logs é imutável' USING ERRCODE = '42501';
  END IF;
  IF current_setting('app.retention', true) IS DISTINCT FROM 'on'
     OR OLD.created_at > now() - interval '5 years' THEN
    RAISE EXCEPTION 'audit_logs é imutável' USING ERRCODE = '42501';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_pp_audit_immutable ON public.pp_audit_logs;
CREATE TRIGGER trg_pp_audit_immutable
  BEFORE UPDATE OR DELETE ON public.pp_audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.pp_audit_logs_immutable();

CREATE OR REPLACE FUNCTION public.pp_apply_data_retention(p_dry_run boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_logs integer;
  v_sessions integer;
BEGIN
  SELECT count(*) INTO v_logs FROM public.pp_audit_logs WHERE created_at < now() - interval '5 years';
  SELECT count(*) INTO v_sessions FROM public.pp_user_activity_sessions WHERE login_at < now() - interval '12 months';
  IF NOT p_dry_run THEN
    PERFORM set_config('app.retention', 'on', true);
    DELETE FROM public.pp_audit_logs WHERE created_at < now() - interval '5 years';
    DELETE FROM public.pp_user_activity_sessions WHERE login_at < now() - interval '12 months';
  END IF;
  RETURN jsonb_build_object('dry_run', p_dry_run, 'audit_logs', v_logs, 'sessions', v_sessions);
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. Sessões
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.pp_touch_session()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_session text := auth.jwt() ->> 'session_id';
BEGIN
  IF v_uid IS NULL OR NOT public.pp_profile_active() THEN
    RETURN;
  END IF;
  UPDATE public.pp_user_activity_sessions s
  SET last_seen_at = now()
  WHERE s.id = (
    SELECT s2.id FROM public.pp_user_activity_sessions s2
    WHERE s2.user_id = v_uid AND s2.logout_at IS NULL
      AND (v_session IS NULL OR s2.session_id IS NULL OR s2.session_id = v_session)
    ORDER BY s2.login_at DESC
    LIMIT 1
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.pp_revoke_user_sessions(p_user uuid, p_except_session uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  DELETE FROM auth.refresh_tokens rt
  WHERE rt.user_id = p_user::text
    AND (p_except_session IS NULL OR rt.session_id IS DISTINCT FROM p_except_session);
  DELETE FROM auth.sessions s
  WHERE s.user_id = p_user
    AND (p_except_session IS NULL OR s.id <> p_except_session);
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. Funções administrativas (só service_role; o ator vai para a auditoria)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.pp_assert_service_role()
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.pp_admin_create_profile(
  p_actor uuid,
  p_id uuid,
  p_username text,
  p_email text,
  p_name text,
  p_department text,
  p_job_title text,
  p_role public.pp_app_role,
  p_temp_expires_at timestamptz
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
    id, username, email, name, department, job_title, active,
    must_change_password, password_issued_at, temp_password_expires_at
  ) VALUES (
    p_id, p_username, p_email, p_name, p_department, p_job_title, true,
    true, now(), p_temp_expires_at
  );
  INSERT INTO public.pp_user_roles (user_id, role) VALUES (p_id, p_role);
END;
$$;

CREATE OR REPLACE FUNCTION public.pp_admin_update_profile(
  p_actor uuid,
  p_id uuid,
  p_name text,
  p_department text,
  p_job_title text,
  p_active boolean,
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
  UPDATE public.pp_profiles
  SET name = p_name, department = p_department, job_title = p_job_title, active = p_active
  WHERE id = p_id;
  IF p_role IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.pp_user_roles r WHERE r.user_id = p_id AND r.role = p_role
  ) THEN
    INSERT INTO public.pp_user_roles (user_id, role) VALUES (p_id, p_role);
    DELETE FROM public.pp_user_roles WHERE user_id = p_id AND role <> p_role;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.pp_admin_set_password_state(
  p_actor uuid,
  p_id uuid,
  p_must_change boolean,
  p_issued_at timestamptz,
  p_expires_at timestamptz
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.pp_assert_service_role();
  PERFORM set_config('app.actor_id', p_actor::text, true);
  UPDATE public.pp_profiles
  SET must_change_password = p_must_change,
      password_issued_at = p_issued_at,
      temp_password_expires_at = p_expires_at
  WHERE id = p_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.pp_admin_delete_profile(p_actor uuid, p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.pp_assert_service_role();
  PERFORM set_config('app.actor_id', p_actor::text, true);
  DELETE FROM public.pp_user_roles WHERE user_id = p_id;
  DELETE FROM public.pp_password_reset_requests WHERE user_id = p_id;
  DELETE FROM public.pp_profiles WHERE id = p_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.pp_admin_handle_reset_requests(p_actor uuid, p_user uuid, p_status text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count integer;
BEGIN
  PERFORM public.pp_assert_service_role();
  UPDATE public.pp_password_reset_requests
  SET status = p_status, handled_by = p_actor, handled_at = now()
  WHERE user_id = p_user AND status = 'open';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.pp_throttle_register(
  p_key_hash text,
  p_kind text,
  p_failed boolean,
  p_max integer DEFAULT 5,
  p_window_seconds integer DEFAULT 900,
  p_block_seconds integer DEFAULT 900
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.pp_auth_throttle;
BEGIN
  PERFORM public.pp_assert_service_role();
  IF NOT p_failed THEN
    DELETE FROM public.pp_auth_throttle WHERE key_hash = p_key_hash AND kind = p_kind;
    RETURN jsonb_build_object('count', 0, 'blocked', false);
  END IF;

  INSERT INTO public.pp_auth_throttle AS t (key_hash, kind, window_start, count)
  VALUES (p_key_hash, p_kind, now(), 1)
  ON CONFLICT (key_hash, kind) DO UPDATE
  SET count = CASE WHEN t.window_start < now() - make_interval(secs => p_window_seconds) THEN 1 ELSE t.count + 1 END,
      window_start = CASE WHEN t.window_start < now() - make_interval(secs => p_window_seconds) THEN now() ELSE t.window_start END
  RETURNING * INTO v_row;

  IF v_row.count >= p_max THEN
    UPDATE public.pp_auth_throttle
    SET blocked_until = now() + make_interval(secs => p_block_seconds)
    WHERE key_hash = p_key_hash AND kind = p_kind
    RETURNING * INTO v_row;
  END IF;
  RETURN jsonb_build_object('count', v_row.count, 'blocked', v_row.blocked_until IS NOT NULL AND v_row.blocked_until > now());
END;
$$;

CREATE OR REPLACE FUNCTION public.pp_throttle_status(p_key_hash text, p_kind text, p_window_seconds integer DEFAULT 900)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.pp_auth_throttle;
BEGIN
  PERFORM public.pp_assert_service_role();
  SELECT * INTO v_row FROM public.pp_auth_throttle WHERE key_hash = p_key_hash AND kind = p_kind;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('count', 0, 'blocked', false);
  END IF;
  RETURN jsonb_build_object(
    'count', CASE WHEN v_row.window_start < now() - make_interval(secs => p_window_seconds) THEN 0 ELSE v_row.count END,
    'blocked', v_row.blocked_until IS NOT NULL AND v_row.blocked_until > now()
  );
END;
$$;

-- Lista para a tela de usuários (inclui o status do MFA, que fica no schema auth).
CREATE OR REPLACE FUNCTION public.pp_admin_list_users()
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
         p.created_at
  FROM public.pp_profiles p
  ORDER BY p.name;
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. RLS e GRANTs das tabelas do portal
-- ---------------------------------------------------------------------------

ALTER TABLE public.pp_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pp_user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pp_app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pp_user_activity_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pp_password_reset_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pp_auth_throttle ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pp_audit_logs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.pp_profiles, public.pp_user_roles, public.pp_app_settings,
  public.pp_user_activity_sessions, public.pp_password_reset_requests,
  public.pp_auth_throttle, public.pp_audit_logs FROM anon, authenticated, PUBLIC;

GRANT SELECT ON public.pp_profiles, public.pp_user_roles, public.pp_app_settings,
  public.pp_user_activity_sessions, public.pp_password_reset_requests, public.pp_audit_logs TO authenticated;
GRANT UPDATE (name, department, job_title) ON public.pp_profiles TO authenticated;
GRANT ALL ON public.pp_profiles, public.pp_user_roles, public.pp_app_settings,
  public.pp_user_activity_sessions, public.pp_password_reset_requests,
  public.pp_auth_throttle, public.pp_audit_logs TO service_role;

-- pp_profiles
DROP POLICY IF EXISTS pp_profiles_select ON public.pp_profiles;
CREATE POLICY pp_profiles_select ON public.pp_profiles FOR SELECT TO authenticated
  USING (id = (SELECT auth.uid()) OR public.pp_has_role((SELECT auth.uid()), 'admin'));
DROP POLICY IF EXISTS pp_profiles_update_own ON public.pp_profiles;
CREATE POLICY pp_profiles_update_own ON public.pp_profiles FOR UPDATE TO authenticated
  USING (id = (SELECT auth.uid())) WITH CHECK (id = (SELECT auth.uid()));
DROP POLICY IF EXISTS pp_profiles_gate_select ON public.pp_profiles;
CREATE POLICY pp_profiles_gate_select ON public.pp_profiles AS RESTRICTIVE FOR SELECT TO authenticated
  USING ((SELECT public.pp_session_allowed()) OR (id = (SELECT auth.uid()) AND active));
DROP POLICY IF EXISTS pp_profiles_gate_update ON public.pp_profiles;
CREATE POLICY pp_profiles_gate_update ON public.pp_profiles AS RESTRICTIVE FOR UPDATE TO authenticated
  USING ((SELECT public.pp_session_allowed())) WITH CHECK ((SELECT public.pp_session_allowed()));

-- pp_user_roles
DROP POLICY IF EXISTS pp_roles_select ON public.pp_user_roles;
CREATE POLICY pp_roles_select ON public.pp_user_roles FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR public.pp_has_role((SELECT auth.uid()), 'admin'));
DROP POLICY IF EXISTS pp_roles_gate_select ON public.pp_user_roles;
CREATE POLICY pp_roles_gate_select ON public.pp_user_roles AS RESTRICTIVE FOR SELECT TO authenticated
  USING ((SELECT public.pp_session_allowed()) OR (user_id = (SELECT auth.uid()) AND (SELECT public.pp_profile_active())));

-- pp_app_settings: a política de MFA é lida antes de a sessão estar liberada (cadastro de MFA).
DROP POLICY IF EXISTS pp_settings_select ON public.pp_app_settings;
CREATE POLICY pp_settings_select ON public.pp_app_settings FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS pp_settings_gate_select ON public.pp_app_settings;
CREATE POLICY pp_settings_gate_select ON public.pp_app_settings AS RESTRICTIVE FOR SELECT TO authenticated
  USING ((SELECT public.pp_session_allowed()) OR (SELECT public.pp_profile_active()));

-- Tabelas só de admin
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['pp_user_activity_sessions', 'pp_password_reset_requests', 'pp_audit_logs'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_admin_select', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.pp_has_role((SELECT auth.uid()), ''admin''))',
      t || '_admin_select', t
    );
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_gate', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING ((SELECT public.pp_session_allowed())) WITH CHECK ((SELECT public.pp_session_allowed()))',
      t || '_gate', t
    );
  END LOOP;
END $$;
-- pp_auth_throttle: RLS ligada e nenhuma política (só service_role).

-- ---------------------------------------------------------------------------
-- 8. Catálogo (parts) e fotos: só usuários logados com sessão liberada
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "anon_select_parts" ON public.parts;
DROP POLICY IF EXISTS "anon_insert_parts" ON public.parts;
DROP POLICY IF EXISTS "anon_update_parts" ON public.parts;
DROP POLICY IF EXISTS "anon_delete_parts" ON public.parts;

REVOKE ALL ON public.parts FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.parts TO authenticated;

DROP POLICY IF EXISTS pp_parts_select ON public.parts;
CREATE POLICY pp_parts_select ON public.parts FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS pp_parts_insert ON public.parts;
CREATE POLICY pp_parts_insert ON public.parts FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS pp_parts_update ON public.parts;
CREATE POLICY pp_parts_update ON public.parts FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS pp_parts_delete ON public.parts;
CREATE POLICY pp_parts_delete ON public.parts FOR DELETE TO authenticated USING (true);
DROP POLICY IF EXISTS pp_parts_gate ON public.parts;
CREATE POLICY pp_parts_gate ON public.parts AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.pp_session_allowed())) WITH CHECK ((SELECT public.pp_session_allowed()));

-- storage.objects é compartilhado com outros buckets: as condições ficam só nas políticas do part-photos.
DROP POLICY IF EXISTS "anon_insert_part_photos" ON storage.objects;
DROP POLICY IF EXISTS "anon_update_part_photos" ON storage.objects;
DROP POLICY IF EXISTS "anon_delete_part_photos" ON storage.objects;

DROP POLICY IF EXISTS pp_part_photos_insert ON storage.objects;
CREATE POLICY pp_part_photos_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'part-photos' AND (SELECT public.pp_session_allowed()));
DROP POLICY IF EXISTS pp_part_photos_update ON storage.objects;
CREATE POLICY pp_part_photos_update ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'part-photos' AND (SELECT public.pp_session_allowed()))
  WITH CHECK (bucket_id = 'part-photos' AND (SELECT public.pp_session_allowed()));
DROP POLICY IF EXISTS pp_part_photos_delete ON storage.objects;
CREATE POLICY pp_part_photos_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'part-photos' AND (SELECT public.pp_session_allowed()));

-- ---------------------------------------------------------------------------
-- 9. Permissões de execução das funções
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION
  public.pp_has_role(uuid, public.pp_app_role),
  public.pp_profile_active(),
  public.pp_session_allowed(),
  public.pp_other_active_admin_exists(uuid),
  public.pp_audit_redact_value(text, jsonb),
  public.pp_audit_request_context(),
  public.pp_audit_actor(),
  public.pp_audit_write(uuid, text, text, text, text, jsonb, text, text, text, text, text),
  public.pp_record_audit_event(text, text, text, text, jsonb),
  public.pp_search_audit_logs(timestamptz, timestamptz, uuid, text, text, text, integer, text, text),
  public.pp_apply_data_retention(boolean),
  public.pp_touch_session(),
  public.pp_revoke_user_sessions(uuid, uuid),
  public.pp_assert_service_role(),
  public.pp_admin_create_profile(uuid, uuid, text, text, text, text, text, public.pp_app_role, timestamptz),
  public.pp_admin_update_profile(uuid, uuid, text, text, text, boolean, public.pp_app_role),
  public.pp_admin_set_password_state(uuid, uuid, boolean, timestamptz, timestamptz),
  public.pp_admin_delete_profile(uuid, uuid),
  public.pp_admin_handle_reset_requests(uuid, uuid, text),
  public.pp_throttle_register(text, text, boolean, integer, integer, integer),
  public.pp_throttle_status(text, text, integer),
  public.pp_admin_list_users()
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.pp_has_role(uuid, public.pp_app_role),
  public.pp_profile_active(),
  public.pp_session_allowed(),
  public.pp_admin_list_users(),
  public.pp_record_audit_event(text, text, text, text, jsonb),
  public.pp_search_audit_logs(timestamptz, timestamptz, uuid, text, text, text, integer, text, text),
  public.pp_touch_session()
TO authenticated;

GRANT EXECUTE ON FUNCTION
  public.pp_has_role(uuid, public.pp_app_role),
  public.pp_profile_active(),
  public.pp_session_allowed(),
  public.pp_other_active_admin_exists(uuid),
  public.pp_audit_write(uuid, text, text, text, text, jsonb, text, text, text, text, text),
  public.pp_apply_data_retention(boolean),
  public.pp_revoke_user_sessions(uuid, uuid),
  public.pp_assert_service_role(),
  public.pp_admin_create_profile(uuid, uuid, text, text, text, text, text, public.pp_app_role, timestamptz),
  public.pp_admin_update_profile(uuid, uuid, text, text, text, boolean, public.pp_app_role),
  public.pp_admin_set_password_state(uuid, uuid, boolean, timestamptz, timestamptz),
  public.pp_admin_delete_profile(uuid, uuid),
  public.pp_admin_handle_reset_requests(uuid, uuid, text),
  public.pp_throttle_register(text, text, boolean, integer, integer, integer),
  public.pp_throttle_status(text, text, integer)
TO service_role;
