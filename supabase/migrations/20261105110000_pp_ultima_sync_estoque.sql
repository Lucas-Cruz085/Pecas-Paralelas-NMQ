/*
  Data/hora da última sincronização de estoque (evento ESTOQUE_SINCRONIZADO gravado pela sync-stock),
  para o aviso discreto na tela Importar. Expõe só o horário e os contadores, não o log inteiro.
*/

CREATE OR REPLACE FUNCTION public.pp_last_stock_sync()
RETURNS TABLE (synced_at timestamptz, recebidos integer, pecas_encontradas integer, pecas_atualizadas integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT l.created_at,
         (l.metadata ->> 'recebidos')::integer,
         (l.metadata ->> 'pecas_encontradas')::integer,
         (l.metadata ->> 'pecas_atualizadas')::integer
  FROM public.pp_audit_logs l
  WHERE public.pp_session_allowed()
    AND l.action = 'ESTOQUE_SINCRONIZADO'
  ORDER BY l.created_at DESC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.pp_last_stock_sync() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pp_last_stock_sync() TO authenticated;
