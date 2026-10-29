/*
# Create parts catalog table (single-tenant, no auth)

1. New Tables
- `parts`
  - `id` (uuid, primary key)
  - `part_number` (text, unique, not null) - o código da peça paralela
  - `description` (text, not null) - descrição da peça
  - `brand` (text) - marca/fabricante da peça paralela
  - `category` (text) - categoria da peça (ex: Motor, Suspensão, Freio)
  - `oem_reference` (text) - referência OEM original que a peça substitui
  - `specifications` (text) - especificações técnicas
  - `stock_quantity` (integer, default 0) - quantidade em estoque
  - `unit_price` (numeric, default 0) - preço unitário
  - `created_at` (timestamptz, default now())
  - `updated_at` (timestamptz, default now())

2. Security
- Enable RLS on `parts`.
- Grant CRUD to `anon` + `authenticated` so the Data API can reach the table.
- Allow anon + authenticated CRUD because the data is intentionally shared/public (no sign-in app).
- Add full-text search indexes on part_number and description for search.

3. Indexes
- Unique index on `part_number`
- GIN index on tsvector for search by part_number and description
*/

CREATE TABLE IF NOT EXISTS parts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  part_number text UNIQUE NOT NULL,
  description text NOT NULL,
  brand text DEFAULT '',
  category text DEFAULT '',
  oem_reference text DEFAULT '',
  specifications text DEFAULT '',
  stock_quantity integer NOT NULL DEFAULT 0,
  unit_price numeric(10,2) NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE parts ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON parts TO anon, authenticated;

DROP POLICY IF EXISTS "anon_select_parts" ON parts;
CREATE POLICY "anon_select_parts" ON parts FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_parts" ON parts;
CREATE POLICY "anon_insert_parts" ON parts FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_parts" ON parts;
CREATE POLICY "anon_update_parts" ON parts FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_parts" ON parts;
CREATE POLICY "anon_delete_parts" ON parts FOR DELETE
  TO anon, authenticated USING (true);

-- Index for searching by part_number (case-insensitive)
CREATE INDEX IF NOT EXISTS idx_parts_part_number_lower ON parts (lower(part_number));

-- Index for searching by description (case-insensitive)
CREATE INDEX IF NOT EXISTS idx_parts_description_lower ON parts (lower(description));

-- Index for category filtering
CREATE INDEX IF NOT EXISTS idx_parts_category ON parts (category);

-- Insert sample data
INSERT INTO parts (part_number, description, brand, category, oem_reference, specifications, stock_quantity, unit_price)
VALUES
  ('PAR-OF001', 'Filtro de oleo motor 2.0 16V', 'Tecfil', 'Motor', 'OEM-90915-10001', 'Rosca M20x1.5 - Altura 65mm', 45, 28.90),
  ('PAR-AR002', 'Filtro de ar esportivo cônico', 'K&N', 'Motor', 'OEM-17801-0H050', 'Fluxo 30% maior que original', 12, 189.00),
  ('PAR-FR003', 'Pastilha de freio dianteira', 'Bosch', 'Freio', 'OEM-04465-0K010', 'Material ceramico - 4 rodas', 30, 145.50),
  ('PAR-DS004', 'Amortecedor dianteiro gas', 'Monroe', 'Suspensao', 'OEM-48510-0K020', 'Gas pressurizado - Par', 18, 320.00),
  ('PAR-EM005', 'Vela de ignicao iridium', 'NGK', 'Motor', 'OEM-90919-01247', 'Iridium IX - Conjunto 4 velas', 60, 22.50),
  ('PAR-CB006', 'Kit embreagem completa', 'Sachs', 'Motor', 'OEM-31210-0M010', 'Disco + platô + rolamento', 8, 680.00),
  ('PAR-BT007', 'Bateria 60Ah 540A', 'Moura', 'Eletrica', 'OEM-28800-0R020', '60Ah - 540 CCA - 12V', 25, 389.00),
  ('PAR-CD008', 'Cabo de vela silicon 7mm', 'CableTech', 'Eletrica', 'OEM-90980-01101', 'Kit 4 cabos - Alta isolação', 40, 48.00),
  ('PAR-AB009', 'Kit amortecedor traseiro', 'Cofap', 'Suspensao', 'OEM-48530-0K030', 'Par - Oleo 10W', 15, 275.00),
  ('PAR-RD010', 'Radiador alumínio premium', 'Viscotech', 'Refrigeracao', 'OEM-19010-0M010', 'Aluminio - 3 fileiras de aletas', 10, 520.00)
ON CONFLICT (part_number) DO NOTHING;
