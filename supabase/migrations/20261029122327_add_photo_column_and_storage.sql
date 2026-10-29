/*
# Add photo_url column to parts table and create storage bucket

1. Modified Tables
- `parts`
  - Added `photo_url` (text, nullable) - URL da foto da peça carregada pelo colaborador

2. Storage
- Create public storage bucket `part-photos` for storing part images
- Allow anon + authenticated to upload and read photos (single-tenant app, no auth)

3. Security
- RLS policies on storage.objects for the part-photos bucket
*/

ALTER TABLE parts ADD COLUMN IF NOT EXISTS photo_url text DEFAULT NULL;

-- Create storage bucket for part photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('part-photos', 'part-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: allow anon + authenticated to upload and read photos
DROP POLICY IF EXISTS "anon_read_part_photos" ON storage.objects;
CREATE POLICY "anon_read_part_photos" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'part-photos');

DROP POLICY IF EXISTS "anon_insert_part_photos" ON storage.objects;
CREATE POLICY "anon_insert_part_photos" ON storage.objects
  FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'part-photos');

DROP POLICY IF EXISTS "anon_update_part_photos" ON storage.objects;
CREATE POLICY "anon_update_part_photos" ON storage.objects
  FOR UPDATE TO anon, authenticated
  USING (bucket_id = 'part-photos') WITH CHECK (bucket_id = 'part-photos');

DROP POLICY IF EXISTS "anon_delete_part_photos" ON storage.objects;
CREATE POLICY "anon_delete_part_photos" ON storage.objects
  FOR DELETE TO anon, authenticated
  USING (bucket_id = 'part-photos');
