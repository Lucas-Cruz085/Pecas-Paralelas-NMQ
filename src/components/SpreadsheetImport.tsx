import { useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  RefreshCw,
  X,
} from 'lucide-react';
import FileDropZone from '@/components/FileDropZone';
import { supabase, fetchAllParts, getErrorMessage } from '@/lib/supabase';
import {
  FIELD_LABELS,
  downloadTemplate,
  parsePartsSpreadsheet,
  type ParsedRow,
  type ParsedSheet,
} from '@/lib/spreadsheet';
import { formatCurrency } from '@/lib/format';

type RowStatus = 'new' | 'update' | 'duplicate' | 'error';
type Filter = 'all' | RowStatus | 'warning';

interface PreviewRow extends ParsedRow {
  status: RowStatus;
}

const UPSERT_BATCH_SIZE = 200;

const statusStyles: Record<RowStatus, { label: string; className: string }> = {
  new: { label: 'Novo', className: 'bg-success/10 text-success' },
  update: { label: 'Atualizar', className: 'bg-brand/10 text-brand-strong' },
  duplicate: { label: 'Repetido', className: 'bg-warning/10 text-warning' },
  error: { label: 'Erro', className: 'bg-destructive/10 text-destructive' },
};

interface SpreadsheetImportProps {
  onImported: () => void;
  onGoToImages: () => void;
}

export default function SpreadsheetImport({ onImported, onGoToImages }: SpreadsheetImportProps) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [sheet, setSheet] = useState<ParsedSheet | null>(null);
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [updateExisting, setUpdateExisting] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ inserted: number; updated: number } | null>(null);

  const handleFile = async (file: File) => {
    setParsing(true);
    setError(null);
    setResult(null);
    setFilter('all');
    try {
      const [parsed, existing] = await Promise.all([
        parsePartsSpreadsheet(file),
        fetchAllParts<{ part_number: string }>('part_number'),
      ]);
      const existingCodes = new Set(existing.map((p) => p.part_number));
      setSheet(parsed);
      setFileName(file.name);
      setRows(
        parsed.rows.map((row) => ({
          ...row,
          status:
            row.errors.length > 0
              ? 'error'
              : row.duplicateOf !== undefined
                ? 'duplicate'
                : existingCodes.has(row.data.part_number)
                  ? 'update'
                  : 'new',
        }))
      );
    } catch (err) {
      setSheet(null);
      setRows([]);
      setError(getErrorMessage(err, 'Não foi possível ler a planilha.'));
    } finally {
      setParsing(false);
    }
  };

  const counts = useMemo(() => {
    const c = { all: rows.length, new: 0, update: 0, duplicate: 0, error: 0, warning: 0 };
    for (const row of rows) {
      c[row.status]++;
      if (row.warnings.length > 0) c.warning++;
    }
    return c;
  }, [rows]);

  const toImport = rows.filter((r) => r.status === 'new' || (updateExisting && r.status === 'update'));

  const visibleRows = rows.filter((row) =>
    filter === 'all' ? true : filter === 'warning' ? row.warnings.length > 0 : row.status === filter
  );

  const handleImport = async () => {
    if (toImport.length === 0) return;
    setImporting(true);
    setProgress(0);
    setError(null);
    try {
      for (let i = 0; i < toImport.length; i += UPSERT_BATCH_SIZE) {
        const batch = toImport.slice(i, i + UPSERT_BATCH_SIZE).map((r) => r.data);
        const { error: upsertError } = await supabase
          .from('parts')
          .upsert(batch, { onConflict: 'part_number', ignoreDuplicates: !updateExisting });
        if (upsertError) throw upsertError;
        setProgress(Math.min(i + UPSERT_BATCH_SIZE, toImport.length));
      }
      setResult({
        inserted: toImport.filter((r) => r.status === 'new').length,
        updated: toImport.filter((r) => r.status === 'update').length,
      });
      setRows((prev) => prev.map((r) => (r.status === 'new' ? { ...r, status: 'update' } : r)));
      onImported();
    } catch (err) {
      setError(getErrorMessage(err, 'Erro ao importar as peças.'));
    } finally {
      setImporting(false);
    }
  };

  const reset = () => {
    setSheet(null);
    setRows([]);
    setFileName(null);
    setResult(null);
    setError(null);
  };

  return (
    <div className="space-y-6">
      {error && (
        <Banner tone="error" onClose={() => setError(null)}>
          {error}
        </Banner>
      )}

      {result && (
        <div className="flex flex-wrap items-center gap-3 bg-success/10 border border-success/30 rounded-xl px-4 py-3 animate-fadeIn">
          <CheckCircle2 size={20} className="text-success flex-shrink-0" />
          <p className="text-sm text-success font-medium flex-1">
            Importação concluída: {result.inserted} peça(s) nova(s) e {result.updated} atualizada(s).
          </p>
          <button
            onClick={onGoToImages}
            className="px-4 py-2 text-sm font-medium bg-success text-white rounded-lg hover:brightness-110 transition-colors"
          >
            Próximo passo: enviar imagens
          </button>
        </div>
      )}

      {!sheet && (
        <>
          <FileDropZone
            accept=".xlsx,.xls,.csv"
            disabled={parsing}
            title={parsing ? 'Lendo planilha...' : 'Arraste a planilha aqui ou clique para selecionar'}
            hint="Excel (.xlsx, .xls) ou CSV — mesmo formato da planilha Fornecedores Paralelos"
            onFiles={([file]) => handleFile(file)}
          >
            <button
              type="button"
              onClick={downloadTemplate}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-foreground/80 bg-muted rounded-lg hover:bg-muted/80 transition-colors"
            >
              <Download size={16} />
              Baixar modelo
            </button>
          </FileDropZone>

          <div className="bg-card border border-border rounded-2xl p-5 text-sm text-foreground/80 space-y-2">
            <p className="font-semibold text-foreground">Como a planilha é lida</p>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
              <li>
                O cabeçalho é localizado automaticamente (colunas <b>Cód. JCB</b> e <b>Descrição</b> são obrigatórias).
              </li>
              <li>
                <b>Cód. JCB</b> vira o código da peça; quando estiver vazio, usa-se o <b>Cód. Diversos</b>.
              </li>
              <li>
                Colunas de filial (REC, PNM, FOR, PET, CPV) viram estoque por filial; o estoque total é a soma delas.
              </li>
              <li>Códigos que já existem no catálogo são atualizados — a foto da peça é mantida.</li>
              <li>Códigos repetidos na planilha: só a primeira linha é importada.</li>
            </ul>
          </div>
        </>
      )}

      {sheet && (
        <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
          <div className="flex flex-wrap items-center gap-3 px-5 py-4 border-b border-border">
            <FileSpreadsheet size={22} className="text-success" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-foreground truncate">{fileName}</p>
              <p className="text-xs text-muted-foreground">
                Aba "{sheet.sheetName}" • Colunas reconhecidas:{' '}
                {sheet.detectedFields.map((f) => FIELD_LABELS[f]).join(', ')}
                {sheet.branches.length > 0 && ` • Filiais: ${sheet.branches.join(', ')}`}
              </p>
            </div>
            <button
              onClick={reset}
              disabled={importing}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-foreground/80 rounded-lg hover:bg-muted transition-colors disabled:opacity-50"
            >
              <RefreshCw size={14} />
              Trocar arquivo
            </button>
          </div>

          <div className="flex flex-wrap gap-2 px-5 py-3 border-b border-border bg-muted/60">
            {(
              [
                ['all', 'Todas'],
                ['new', 'Novas'],
                ['update', 'Já cadastradas'],
                ['warning', 'Com avisos'],
                ['duplicate', 'Repetidas'],
                ['error', 'Com erro'],
              ] as [Filter, string][]
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                  filter === key ? 'bg-foreground text-background' : 'bg-card border border-border text-foreground/80 hover:bg-muted'
                }`}
              >
                {label} ({counts[key]})
              </button>
            ))}
          </div>

          <div className="max-h-[480px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card shadow-[0_1px_0_rgb(241,245,249)] text-left text-xs text-muted-foreground uppercase">
                <tr>
                  <th className="px-4 py-2 font-semibold">Linha</th>
                  <th className="px-4 py-2 font-semibold">Status</th>
                  <th className="px-4 py-2 font-semibold">Código</th>
                  <th className="px-4 py-2 font-semibold">Cód. Diversos</th>
                  <th className="px-4 py-2 font-semibold">Descrição</th>
                  <th className="px-4 py-2 font-semibold">Fornecedor</th>
                  <th className="px-4 py-2 font-semibold text-right">Estoque</th>
                  <th className="px-4 py-2 font-semibold text-right">Preço venda</th>
                  <th className="px-4 py-2 font-semibold">Observações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {visibleRows.map((row) => (
                  <tr key={row.rowNumber} className="align-top hover:bg-muted/70">
                    <td className="px-4 py-2 text-muted-foreground font-mono">{row.rowNumber}</td>
                    <td className="px-4 py-2">
                      <span
                        className={`text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${statusStyles[row.status].className}`}
                      >
                        {statusStyles[row.status].label}
                      </span>
                    </td>
                    <td className="px-4 py-2 font-mono font-semibold text-brand-strong whitespace-nowrap">
                      {row.data.part_number || '—'}
                    </td>
                    <td className="px-4 py-2 font-mono text-muted-foreground whitespace-nowrap">{row.data.alt_code || '—'}</td>
                    <td className="px-4 py-2 text-foreground min-w-[220px]">{row.data.description || '—'}</td>
                    <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">{row.data.supplier || '—'}</td>
                    <td className="px-4 py-2 text-right text-foreground">{row.data.stock_quantity ?? '—'}</td>
                    <td className="px-4 py-2 text-right text-foreground whitespace-nowrap">
                      {row.data.unit_price !== undefined ? formatCurrency(row.data.unit_price) : '—'}
                    </td>
                    <td className="px-4 py-2 text-xs min-w-[220px] space-y-0.5">
                      {row.errors.map((msg) => (
                        <p key={msg} className="text-destructive">{msg}</p>
                      ))}
                      {row.duplicateOf !== undefined && (
                        <p className="text-warning">Código já aparece na linha {row.duplicateOf} — esta linha será ignorada.</p>
                      )}
                      {row.warnings.map((msg) => (
                        <p key={msg} className="text-warning">{msg}</p>
                      ))}
                    </td>
                  </tr>
                ))}
                {visibleRows.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-10 text-center text-muted-foreground">
                      Nenhuma linha neste filtro.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center gap-4 px-5 py-4 border-t border-border bg-muted/60">
            <label className="flex items-center gap-2 text-sm text-foreground/80 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={updateExisting}
                onChange={(e) => setUpdateExisting(e.target.checked)}
                disabled={importing}
                className="w-4 h-4 rounded border-input text-brand-strong focus:ring-brand/40"
              />
              Atualizar peças já cadastradas ({counts.update})
            </label>
            {(counts.error > 0 || counts.duplicate > 0) && (
              <span className="flex items-center gap-1.5 text-xs text-warning">
                <AlertTriangle size={14} />
                {counts.error + counts.duplicate} linha(s) serão ignoradas
              </span>
            )}
            <button
              onClick={handleImport}
              disabled={importing || toImport.length === 0}
              className="ml-auto flex items-center gap-2 px-6 py-2.5 bg-brand text-brand-foreground font-medium rounded-xl hover:brightness-105 transition-colors shadow-md shadow-brand/30 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {importing ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Importando {progress}/{toImport.length}...
                </>
              ) : (
                <>
                  <FileSpreadsheet size={18} />
                  Importar {toImport.length} peça(s)
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function Banner({
  tone,
  children,
  onClose,
}: {
  tone: 'error' | 'success';
  children: React.ReactNode;
  onClose?: () => void;
}) {
  const styles =
    tone === 'error'
      ? { box: 'bg-destructive/10 border-destructive/30', text: 'text-destructive', icon: 'text-destructive' }
      : { box: 'bg-success/10 border-success/30', text: 'text-success', icon: 'text-success' };
  const Icon = tone === 'error' ? AlertCircle : CheckCircle2;
  return (
    <div className={`flex items-center gap-3 border rounded-xl px-4 py-3 animate-fadeIn ${styles.box}`}>
      <Icon size={20} className={`flex-shrink-0 ${styles.icon}`} />
      <p className={`text-sm font-medium flex-1 ${styles.text}`}>{children}</p>
      {onClose && (
        <button onClick={onClose} className={styles.icon}>
          <X size={18} />
        </button>
      )}
    </div>
  );
}
