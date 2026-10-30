/*
  Papel "consultor": só consulta o catálogo (leitura). Não cria, edita nem exclui peças ou fotos.
  Filtro "Marca" do catálogo passa a usar o fornecedor (supplier); "Grupo" usa category.
*/

ALTER TYPE public.pp_app_role ADD VALUE IF NOT EXISTS 'consultor';

-- Quem pode alterar o catálogo: sessão liberada e papel admin ou user.
CREATE OR REPLACE FUNCTION public.pp_can_edit_parts()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.pp_session_allowed()
     AND EXISTS (
       SELECT 1 FROM public.pp_user_roles r
       WHERE r.user_id = (SELECT auth.uid()) AND r.role::text IN ('admin', 'user')
     );
$$;

REVOKE ALL ON FUNCTION public.pp_can_edit_parts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pp_can_edit_parts() TO authenticated;

-- Políticas restritivas: somam-se ao pp_parts_gate (sessão) e barram escrita do consultor.
DROP POLICY IF EXISTS pp_parts_write_insert ON public.parts;
CREATE POLICY pp_parts_write_insert ON public.parts AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.pp_can_edit_parts()));
DROP POLICY IF EXISTS pp_parts_write_update ON public.parts;
CREATE POLICY pp_parts_write_update ON public.parts AS RESTRICTIVE FOR UPDATE TO authenticated
  USING ((SELECT public.pp_can_edit_parts())) WITH CHECK ((SELECT public.pp_can_edit_parts()));
DROP POLICY IF EXISTS pp_parts_write_delete ON public.parts;
CREATE POLICY pp_parts_write_delete ON public.parts AS RESTRICTIVE FOR DELETE TO authenticated
  USING ((SELECT public.pp_can_edit_parts()));

-- storage.objects é compartilhado: as condições ficam só nas políticas do bucket part-photos.
DROP POLICY IF EXISTS pp_part_photos_insert ON storage.objects;
CREATE POLICY pp_part_photos_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'part-photos' AND (SELECT public.pp_can_edit_parts()));
DROP POLICY IF EXISTS pp_part_photos_update ON storage.objects;
CREATE POLICY pp_part_photos_update ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'part-photos' AND (SELECT public.pp_can_edit_parts()))
  WITH CHECK (bucket_id = 'part-photos' AND (SELECT public.pp_can_edit_parts()));
DROP POLICY IF EXISTS pp_part_photos_delete ON storage.objects;
CREATE POLICY pp_part_photos_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'part-photos' AND (SELECT public.pp_can_edit_parts()));

-- Opções dos filtros: Marca = fornecedor (sem diferenciar maiúsculas), Grupo = category.
DROP FUNCTION IF EXISTS public.pp_part_filter_options();
CREATE FUNCTION public.pp_part_filter_options()
RETURNS TABLE (field text, value text, total bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT 'supplier'::text, upper(btrim(p.supplier)), count(*)
  FROM public.parts p
  WHERE nullif(btrim(p.supplier), '') IS NOT NULL
  GROUP BY upper(btrim(p.supplier))
  UNION ALL
  SELECT 'category'::text, btrim(p.category), count(*)
  FROM public.parts p
  WHERE nullif(btrim(p.category), '') IS NOT NULL
  GROUP BY btrim(p.category)
  ORDER BY 1, 2;
$$;

REVOKE ALL ON FUNCTION public.pp_part_filter_options() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pp_part_filter_options() TO authenticated;
