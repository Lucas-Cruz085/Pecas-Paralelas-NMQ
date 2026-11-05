/*
  Sincronização de estoque por filial (n8n -> Edge Function sync-stock).

  pp_sync_branch_stock(p_rows) recebe [{partnumber, filial, quantidade}] e, para as peças já
  cadastradas, troca só a quantidade (qty) de cada filial recebida e recalcula stock_quantity.
  Preço, descrição, fotos e filiais não recebidas ficam como estão; nada é criado ou apagado.
  Só grava quando o valor muda, para a auditoria de parts registrar apenas mudanças reais.
  Executável somente pelo service_role (Edge Function).
*/

CREATE OR REPLACE FUNCTION public.pp_sync_branch_stock(p_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_received integer;
  v_found integer;
  v_updated integer;
  v_missing text[];
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'Formato inválido: envie uma lista de itens.';
  END IF;

  v_received := jsonb_array_length(p_rows);

  WITH input AS (
    SELECT upper(btrim(r ->> 'partnumber')) AS pn,
           upper(btrim(r ->> 'filial')) AS filial,
           greatest(round((r ->> 'quantidade')::numeric), 0)::integer AS qty
    FROM jsonb_array_elements(p_rows) r
  ),
  per_part AS (
    SELECT pn, jsonb_object_agg(filial, qty) AS q
    FROM (SELECT pn, filial, sum(qty)::integer AS qty FROM input GROUP BY pn, filial) a
    GROUP BY pn
  ),
  target AS (
    SELECT p.id,
           (
             SELECT coalesce(jsonb_object_agg(
                      k,
                      CASE WHEN pp.q ? k
                        THEN coalesce(p.branch_stock -> k, '{"last_price": null}'::jsonb) || jsonb_build_object('qty', (pp.q ->> k)::integer)
                        ELSE p.branch_stock -> k
                      END), '{}'::jsonb)
             FROM (SELECT jsonb_object_keys(coalesce(p.branch_stock, '{}'::jsonb)) AS k UNION SELECT jsonb_object_keys(pp.q)) keys
           ) AS new_stock
    FROM public.parts p
    JOIN per_part pp ON upper(btrim(p.part_number)) = pp.pn
  ),
  computed AS (
    SELECT t.id, t.new_stock,
           (SELECT coalesce(sum(coalesce((v ->> 'qty')::integer, 0)), 0)::integer FROM jsonb_each(t.new_stock) e(k, v)) AS new_total
    FROM target t
  ),
  upd AS (
    UPDATE public.parts p
    SET branch_stock = c.new_stock,
        stock_quantity = c.new_total
    FROM computed c
    WHERE p.id = c.id
      AND (p.branch_stock IS DISTINCT FROM c.new_stock OR p.stock_quantity IS DISTINCT FROM c.new_total)
    RETURNING p.id
  )
  SELECT (SELECT count(*) FROM computed), (SELECT count(*) FROM upd) INTO v_found, v_updated;

  SELECT coalesce(array_agg(DISTINCT i.pn ORDER BY i.pn), '{}')
  INTO v_missing
  FROM (SELECT upper(btrim(r ->> 'partnumber')) AS pn FROM jsonb_array_elements(p_rows) r) i
  WHERE NOT EXISTS (SELECT 1 FROM public.parts p WHERE upper(btrim(p.part_number)) = i.pn);

  RETURN jsonb_build_object(
    'recebidos', v_received,
    'pecas_encontradas', v_found,
    'pecas_atualizadas', v_updated,
    'nao_encontrados', to_jsonb(v_missing)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.pp_sync_branch_stock(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pp_sync_branch_stock(jsonb) TO service_role;
