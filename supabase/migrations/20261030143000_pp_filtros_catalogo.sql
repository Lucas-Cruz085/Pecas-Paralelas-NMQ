/*
  Opções dos filtros do catálogo (Marca e Grupo) com a quantidade de peças.
  SECURITY INVOKER: respeita a RLS de public.parts (só sessão válida do portal).
  O Grupo usa a coluna category.
*/

CREATE OR REPLACE FUNCTION public.pp_part_filter_options()
RETURNS TABLE (field text, value text, total bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT 'brand'::text, btrim(p.brand), count(*)
  FROM public.parts p
  WHERE nullif(btrim(p.brand), '') IS NOT NULL
  GROUP BY btrim(p.brand)
  UNION ALL
  SELECT 'category'::text, btrim(p.category), count(*)
  FROM public.parts p
  WHERE nullif(btrim(p.category), '') IS NOT NULL
  GROUP BY btrim(p.category)
  ORDER BY 1, 2;
$$;

REVOKE ALL ON FUNCTION public.pp_part_filter_options() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pp_part_filter_options() TO authenticated;
