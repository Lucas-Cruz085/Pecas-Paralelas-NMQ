/*
# Campos da planilha "Fornecedores Paralelos" + busca por código sem separadores

1. Modified Tables
- `parts`
  - `alt_code` (text) - "Cód. Diversos": referência alternativa / do fornecedor
  - `supplier` (text) - fornecedor da peça paralela
  - `cost_price` (numeric) - custo
  - `last_purchase_date` (date) - data da última compra
  - `branch_stock` (jsonb) - estoque e preço da última compra por filial
      ex: {"REC": {"qty": 1, "last_price": 90.75}, "PNM": {"qty": 0, "last_price": null}}
  - `code_search` (text, generated) - part_number + alt_code em maiúsculas e só com
      letras/números, para que "30-925633P", "30/925633P" e "30925633P" encontrem a mesma peça
  - `unit_price` ampliado para numeric(12,2) (há itens acima de R$ 10.000)

2. Trigger
- `updated_at` passa a ser atualizado automaticamente em todo UPDATE
*/

ALTER TABLE parts ADD COLUMN IF NOT EXISTS alt_code text NOT NULL DEFAULT '';
ALTER TABLE parts ADD COLUMN IF NOT EXISTS supplier text NOT NULL DEFAULT '';
ALTER TABLE parts ADD COLUMN IF NOT EXISTS cost_price numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE parts ADD COLUMN IF NOT EXISTS last_purchase_date date DEFAULT NULL;
ALTER TABLE parts ADD COLUMN IF NOT EXISTS branch_stock jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE parts ALTER COLUMN unit_price TYPE numeric(12,2);

ALTER TABLE parts ADD COLUMN IF NOT EXISTS code_search text
  GENERATED ALWAYS AS (
    regexp_replace(upper(part_number || ' ' || alt_code), '[^A-Z0-9 ]', '', 'g')
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_parts_supplier ON parts (supplier);

CREATE OR REPLACE FUNCTION set_parts_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_parts_updated_at ON parts;
CREATE TRIGGER trg_parts_updated_at
  BEFORE UPDATE ON parts
  FOR EACH ROW EXECUTE FUNCTION set_parts_updated_at();
