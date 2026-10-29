import * as XLSX from 'xlsx';
import type { BranchStock, PartInput } from '@/lib/supabase';
import { normalizePartNumber } from '@/lib/partCodes';

type FieldKey =
  | 'part_number'
  | 'alt_code'
  | 'description'
  | 'supplier'
  | 'brand'
  | 'category'
  | 'oem_reference'
  | 'specifications'
  | 'stock_quantity'
  | 'unit_price'
  | 'cost_price'
  | 'last_purchase_date';

const FIELD_ALIASES: Record<FieldKey, string[]> = {
  part_number: ['cod jcb', 'codigo jcb', 'codigo', 'cod', 'part number', 'partnumber', 'pn', 'cod peca', 'codigo da peca'],
  alt_code: ['cod diversos', 'codigo diversos', 'cod alternativo', 'referencia', 'ref', 'ref fornecedor'],
  description: ['descricao', 'descricao da peca', 'desc'],
  supplier: ['fornecedor'],
  brand: ['marca', 'fabricante'],
  category: ['categoria'],
  oem_reference: ['ref oem', 'referencia oem', 'oem'],
  specifications: ['especificacoes', 'especificacoes tecnicas'],
  stock_quantity: ['estoque', 'estoque total', 'quantidade', 'qtd', 'qtde'],
  unit_price: ['preco venda', 'preco de venda', 'preco', 'valor venda', 'valor'],
  cost_price: ['custo', 'preco custo', 'custo unitario'],
  last_purchase_date: ['data', 'data compra', 'data ultima compra'],
};

export const FIELD_LABELS: Record<FieldKey, string> = {
  part_number: 'Código (Cód. JCB)',
  alt_code: 'Cód. Diversos / Ref.',
  description: 'Descrição',
  supplier: 'Fornecedor',
  brand: 'Marca',
  category: 'Categoria',
  oem_reference: 'Ref. OEM',
  specifications: 'Especificações',
  stock_quantity: 'Estoque',
  unit_price: 'Preço venda',
  cost_price: 'Custo',
  last_purchase_date: 'Data',
};

const LAST_PURCHASE_HEADER = 'ultima compra';

function normalizeHeader(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const aliasToField = new Map<string, FieldKey>(
  (Object.entries(FIELD_ALIASES) as [FieldKey, string[]][]).flatMap(([field, aliases]) =>
    aliases.map((alias) => [alias, field] as const)
  )
);

export type SheetPartData = Partial<PartInput> & { part_number: string; description: string };

export interface ParsedRow {
  rowNumber: number;
  data: SheetPartData;
  errors: string[];
  warnings: string[];
  duplicateOf?: number;
}

export interface ParsedSheet {
  sheetName: string;
  detectedFields: FieldKey[];
  branches: string[];
  rows: ParsedRow[];
}

interface ColumnLayout {
  fields: Partial<Record<FieldKey, number>>;
  branches: { name: string; qtyCol: number; priceCol?: number }[];
}

function detectLayout(header: unknown[]): ColumnLayout {
  const fields: ColumnLayout['fields'] = {};
  const branches: ColumnLayout['branches'] = [];

  header.forEach((cell, col) => {
    const normalized = normalizeHeader(cell);
    if (!normalized || normalized === LAST_PURCHASE_HEADER) return;

    const field = aliasToField.get(normalized);
    if (field) {
      if (fields[field] === undefined) fields[field] = col;
      return;
    }

    // Filiais aparecem como siglas (REC, PNM, FOR...) seguidas de "Última compra".
    const raw = String(cell ?? '').trim();
    if (/^[A-Z]{2,5}$/.test(raw)) {
      const next = normalizeHeader(header[col + 1]);
      branches.push({
        name: raw,
        qtyCol: col,
        priceCol: next === LAST_PURCHASE_HEADER ? col + 1 : undefined,
      });
    }
  });

  return { fields, branches };
}

function findHeaderRow(rows: unknown[][]): number {
  const limit = Math.min(rows.length, 25);
  for (let i = 0; i < limit; i++) {
    const { fields } = detectLayout(rows[i]);
    if (fields.description !== undefined && (fields.part_number !== undefined || fields.alt_code !== undefined)) {
      return i;
    }
  }
  return -1;
}

function cleanText(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function isBlank(value: unknown): boolean {
  return cleanText(value) === '';
}

// Aceita número do Excel ou texto em formato brasileiro ("2.388,00", "\t16,53", "R$ 10,50").
function parseNumber(value: unknown): number | null {
  if (isBlank(value)) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
  const text = String(value).replace(/R\$/gi, '').replace(/\s/g, '');
  const normalized = text.includes(',') ? text.replace(/\./g, '').replace(',', '.') : text;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function parseDate(value: unknown): string | null | undefined {
  if (isBlank(value)) return null;
  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return undefined;
    return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
  }
  const match = cleanText(value).match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!match) return undefined;
  const [, d, m, y] = match;
  const year = y.length === 2 ? `20${y}` : y;
  return `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

export async function parsePartsSpreadsheet(file: File): Promise<ParsedSheet> {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });

  for (const sheetName of workbook.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], {
      header: 1,
      defval: '',
      blankrows: true,
    });
    const headerIndex = findHeaderRow(rows);
    if (headerIndex === -1) continue;

    const layout = detectLayout(rows[headerIndex]);
    return {
      sheetName,
      detectedFields: Object.keys(layout.fields) as FieldKey[],
      branches: layout.branches.map((b) => b.name),
      rows: parseRows(rows, headerIndex, layout),
    };
  }

  throw new Error(
    'Não encontrei o cabeçalho da planilha. Ela precisa ter as colunas "Cód. JCB" (ou "Código") e "Descrição".'
  );
}

function parseRows(rows: unknown[][], headerIndex: number, layout: ColumnLayout): ParsedRow[] {
  const { fields, branches } = layout;
  const header = rows[headerIndex];
  const parsed: ParsedRow[] = [];
  const firstRowByCode = new Map<string, number>();

  for (let i = headerIndex + 1; i < rows.length; i++) {
    const cells = rows[i];
    const get = (field: FieldKey) => (fields[field] === undefined ? undefined : cells[fields[field]!]);

    const description = cleanText(get('description'));
    let partNumber = normalizePartNumber(get('part_number'));
    const altCode = normalizePartNumber(get('alt_code'));
    if (!partNumber && !altCode && !description) continue;

    const rowNumber = i + 1;
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!partNumber && altCode) {
      partNumber = altCode;
      if (fields.part_number !== undefined) warnings.push('Sem Cód. JCB: usando o Cód. Diversos como código.');
    }
    if (!partNumber) errors.push('Linha sem código.');
    if (!description) errors.push('Linha sem descrição.');

    const data: SheetPartData = { part_number: partNumber, description };
    if (fields.alt_code !== undefined) data.alt_code = altCode === partNumber ? '' : altCode;
    for (const field of ['supplier', 'brand', 'category', 'oem_reference', 'specifications'] as const) {
      if (fields[field] !== undefined) data[field] = cleanText(get(field));
    }

    const readMoney = (value: unknown, label: string): number | null => {
      const n = parseNumber(value);
      if (Number.isNaN(n)) {
        warnings.push(`Valor inválido em "${label}": "${cleanText(value)}" (ignorado).`);
        return null;
      }
      return n === null ? null : round2(n);
    };

    if (fields.unit_price !== undefined) data.unit_price = readMoney(get('unit_price'), 'Preço venda') ?? 0;
    if (fields.cost_price !== undefined) data.cost_price = readMoney(get('cost_price'), 'Custo') ?? 0;

    if (fields.last_purchase_date !== undefined) {
      const date = parseDate(get('last_purchase_date'));
      if (date === undefined) warnings.push(`Data inválida: "${cleanText(get('last_purchase_date'))}" (ignorada).`);
      data.last_purchase_date = date ?? null;
    }

    if (branches.length > 0) {
      const branchStock: Record<string, BranchStock> = {};
      for (const branch of branches) {
        const qtyValue = cells[branch.qtyCol];
        const qty = parseNumber(qtyValue);
        if (Number.isNaN(qty)) warnings.push(`Estoque inválido em "${branch.name}": "${cleanText(qtyValue)}".`);
        const lastPrice =
          branch.priceCol === undefined
            ? null
            : readMoney(cells[branch.priceCol], `${String(header[branch.priceCol]).trim()} (${branch.name})`);
        branchStock[branch.name] = { qty: qty && !Number.isNaN(qty) ? Math.round(qty) : 0, last_price: lastPrice };
      }
      data.branch_stock = branchStock;
    }

    if (fields.stock_quantity !== undefined) {
      const qty = parseNumber(get('stock_quantity'));
      if (Number.isNaN(qty)) warnings.push(`Estoque inválido: "${cleanText(get('stock_quantity'))}".`);
      data.stock_quantity = qty && !Number.isNaN(qty) ? Math.round(qty) : 0;
    } else if (data.branch_stock) {
      data.stock_quantity = Object.values(data.branch_stock).reduce((sum, b) => sum + b.qty, 0);
    }

    const row: ParsedRow = { rowNumber, data, errors, warnings };
    if (partNumber && errors.length === 0) {
      const firstRow = firstRowByCode.get(partNumber);
      if (firstRow !== undefined) row.duplicateOf = firstRow;
      else firstRowByCode.set(partNumber, rowNumber);
    }
    parsed.push(row);
  }

  return parsed;
}

const TEMPLATE_HEADER = [
  'Cód. JCB',
  'Cód. Diversos',
  'Descrição',
  'Fornecedor',
  'Data',
  'REC',
  'Última compra',
  'PNM',
  'Última compra',
  'FOR',
  'Última compra',
  'PET',
  'Última compra',
  'CPV',
  'CUSTO',
  'PREÇO VENDA',
];

export function downloadTemplate() {
  const sheet = XLSX.utils.aoa_to_sheet([
    ['Fornecedores Paralelos'],
    [],
    TEMPLATE_HEADER,
    ['02/103611P', '4236249R', 'BOMBA DAGUA', 'JS PEÇAS - CIF', '14/10/2026', 0, 655.87, 0, 793.04, 1, '', 0, 793.04, 0, 2241.95, 1506.78],
  ]);
  sheet['!cols'] = TEMPLATE_HEADER.map((h) => ({ wch: Math.max(12, h.length + 2) }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Fornecedores');
  XLSX.writeFile(workbook, 'modelo-importacao-pecas.xlsx');
}
