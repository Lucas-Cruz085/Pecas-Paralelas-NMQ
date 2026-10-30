import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, Package, AlertCircle, Loader2, WifiOff, ImageIcon, X, FileUp } from 'lucide-react';
import { supabase, getErrorMessage, type Part } from '@/lib/supabase';
import { formatCurrency } from '@/lib/format';
import { Select } from '@/components/ui/Field';
import { ilikeExact, usePartFilterOptions, type FilterOption } from '@/lib/partFilters';

interface CatalogViewProps {
  onSelectPart: (part: Part) => void;
  onGoToImport?: () => void;
  refreshKey?: number;
}

const PAGE_SIZE = 24;

// Vírgulas, parênteses e aspas quebram a sintaxe do filtro .or() do PostgREST;
// % e _ são curingas do ILIKE e * é o curinga alternativo aceito na URL.
function sanitizeSearchTerm(query: string): string {
  return query.replace(/[,()"'\\%_*]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Marca = fornecedor (supplier). Grupo = category. */
interface CatalogFilters {
  onlyWithPhoto: boolean;
  brand: string;
  group: string;
}

function buildQuery(term: string, { onlyWithPhoto, brand, group }: CatalogFilters) {
  let query = supabase.from('parts').select('*', { count: 'exact' });

  if (term) {
    const pattern = `%${term}%`;
    const compactCode = term.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const filters = [
      `part_number.ilike.${pattern}`,
      `alt_code.ilike.${pattern}`,
      `description.ilike.${pattern}`,
      `supplier.ilike.${pattern}`,
      `brand.ilike.${pattern}`,
      `oem_reference.ilike.${pattern}`,
    ];
    // "30-925633" ou "30925633" também encontram "30/925633P".
    if (compactCode) filters.push(`code_search.ilike.%${compactCode}%`);
    query = query.or(filters.join(','));
  }

  if (onlyWithPhoto) query = query.not('photo_url', 'is', null);
  if (brand) query = query.ilike('supplier', ilikeExact(brand));
  if (group) query = query.eq('category', group);
  return query.order('part_number');
}

function FilterSelect({
  label,
  emptyLabel,
  value,
  options,
  onChange,
}: {
  label: string;
  emptyLabel: string;
  value: string;
  options: FilterOption[];
  onChange: (value: string) => void;
}) {
  const disabled = options.length === 0 && !value;
  return (
    <label className="flex items-center gap-2 text-sm text-foreground/80">
      <span className="font-medium">{label}</span>
      <Select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        title={disabled ? `${emptyLabel}: atribua o ${label.toLowerCase()} nas peças (edição da peça, Cadastro ou planilha).` : undefined}
        className="!h-9 min-w-[10rem] max-w-[14rem] !py-1 text-sm disabled:cursor-not-allowed disabled:opacity-60"
      >
        <option value="">{disabled ? emptyLabel : 'Todos'}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.value} ({o.total})
          </option>
        ))}
      </Select>
    </label>
  );
}

export default function CatalogView({ onSelectPart, onGoToImport, refreshKey = 0 }: CatalogViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [onlyWithPhoto, setOnlyWithPhoto] = useState(false);
  const [brandFilter, setBrandFilter] = useState('');
  const [groupFilter, setGroupFilter] = useState('');
  const filterOptions = usePartFilterOptions(refreshKey);
  const [parts, setParts] = useState<Part[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const term = sanitizeSearchTerm(searchQuery);

  const fetchPage = useCallback(
    async (from: number) => {
      const requestId = requestIdRef.current;
      const filters = { onlyWithPhoto, brand: brandFilter, group: groupFilter };
      const { data, count, error: queryError } = await buildQuery(term, filters).range(
        from,
        from + PAGE_SIZE - 1
      );
      if (requestId !== requestIdRef.current) return;

      if (queryError) {
        console.error('Catalog error:', queryError);
        setError(getErrorMessage(queryError, 'Não foi possível consultar o catálogo.'));
        if (from === 0) setParts([]);
        return;
      }
      setError(null);
      setTotal(count ?? 0);
      setParts((prev) => (from === 0 ? ((data as Part[]) ?? []) : [...prev, ...((data as Part[]) ?? [])]));
    },
    [term, onlyWithPhoto, brandFilter, groupFilter]
  );

  useEffect(() => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    const timer = setTimeout(async () => {
      await fetchPage(0);
      if (requestId === requestIdRef.current) setLoading(false);
    }, term ? 300 : 0);
    return () => clearTimeout(timer);
  }, [fetchPage, refreshKey, term]);

  const handleLoadMore = async () => {
    setLoadingMore(true);
    await fetchPage(parts.length);
    setLoadingMore(false);
  };

  const hasExtraFilter = onlyWithPhoto || Boolean(brandFilter) || Boolean(groupFilter);
  const hasFilter = Boolean(term) || hasExtraFilter;

  const clearFilters = () => {
    setOnlyWithPhoto(false);
    setBrandFilter('');
    setGroupFilter('');
  };

  return (
    <div className="max-w-7xl mx-auto">
      {/* Page title */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Catálogo de Peças Paralelas</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Pesquise por código (Cód. JCB), Cód. Diversos / referência, descrição ou fornecedor.
        </p>
      </div>

      {/* Search bar */}
      <div className="relative mb-4">
        <Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Digite o código, referência ou descrição da peça..."
          className="w-full pl-12 pr-12 py-3.5 bg-card border border-border rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-transparent transition-all shadow-sm"
          autoFocus
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label="Limpar pesquisa"
          >
            <X size={18} />
          </button>
        )}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <p className="text-sm text-muted-foreground">
          {loading ? (
            'Carregando...'
          ) : (
            <>
              <b className="text-foreground">{total}</b> {total === 1 ? 'peça' : 'peças'}
              {term && <> para "{searchQuery.trim()}"</>}
            </>
          )}
        </p>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
          <FilterSelect
            label="Marca"
            emptyLabel="Sem marcas"
            value={brandFilter}
            options={filterOptions.supplier}
            onChange={setBrandFilter}
          />
          <FilterSelect
            label="Grupo"
            emptyLabel="Sem grupos"
            value={groupFilter}
            options={filterOptions.category}
            onChange={setGroupFilter}
          />
          <label className="flex items-center gap-2 text-sm text-foreground/80 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={onlyWithPhoto}
              onChange={(e) => setOnlyWithPhoto(e.target.checked)}
              className="w-4 h-4 rounded border-input text-brand-strong focus:ring-brand/40"
            />
            <ImageIcon size={16} className="text-muted-foreground" />
            Somente com foto
          </label>
          {hasExtraFilter && (
            <button
              type="button"
              onClick={clearFilters}
              className="flex items-center gap-1 text-sm font-medium text-brand-strong hover:underline"
            >
              <X size={14} aria-hidden="true" />
              Limpar filtros
            </button>
          )}
        </div>
      </div>

      {/* Results */}
      {loading && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {Array.from({ length: 10 }, (_, i) => (
            <div key={i} className="bg-card border border-border rounded-2xl overflow-hidden animate-pulse">
              <div className="aspect-square bg-muted" />
              <div className="p-4 space-y-2">
                <div className="h-4 w-24 bg-muted rounded" />
                <div className="h-4 w-full bg-muted rounded" />
                <div className="h-5 w-20 bg-muted rounded" />
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && error && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-20 h-20 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
            <WifiOff size={36} className="text-destructive" />
          </div>
          <h3 className="text-lg font-semibold text-foreground/80 mb-1">Erro ao consultar o catálogo</h3>
          <p className="text-muted-foreground text-sm max-w-md">{error}</p>
        </div>
      )}

      {!loading && !error && parts.length === 0 && hasFilter && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-20 h-20 rounded-full bg-warning/10 flex items-center justify-center mb-4">
            <AlertCircle size={36} className="text-warning" />
          </div>
          <h3 className="text-lg font-semibold text-foreground/80 mb-1">
            Item paralelo inexistente ou não cadastrado
          </h3>
          <p className="text-muted-foreground text-sm max-w-md">
            {term
              ? `Não encontramos nenhuma peça paralela com "${searchQuery.trim()}"${hasExtraFilter ? ' nos filtros selecionados' : ''}. Verifique o código ou descrição informados.`
              : 'Nenhuma peça encontrada com os filtros selecionados.'}
          </p>
        </div>
      )}

      {!loading && !error && parts.length === 0 && !hasFilter && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mb-4">
            <Package size={36} className="text-muted-foreground/60" />
          </div>
          <h3 className="text-lg font-semibold text-foreground/80 mb-1">Catálogo vazio</h3>
          <p className="text-muted-foreground text-sm max-w-md mb-4">
            Importe a planilha de peças e as fotos para montar o catálogo.
          </p>
          {onGoToImport && (
            <button
              onClick={onGoToImport}
              className="flex items-center gap-2 px-5 py-2.5 bg-brand text-brand-foreground text-sm font-medium rounded-xl hover:brightness-105 transition-colors"
            >
              <FileUp size={18} />
              Importar peças
            </button>
          )}
        </div>
      )}

      {!loading && !error && parts.length > 0 && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {parts.map((part) => (
              <ProductCard key={part.id} part={part} onClick={() => onSelectPart(part)} />
            ))}
          </div>

          {parts.length < total && (
            <div className="flex flex-col items-center gap-2 mt-8">
              <p className="text-xs text-muted-foreground">
                Exibindo {parts.length} de {total}
              </p>
              <button
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="flex items-center gap-2 px-6 py-2.5 bg-card border border-border text-foreground text-sm font-medium rounded-xl hover:border-brand/60 hover:text-brand-strong transition-colors disabled:opacity-60"
              >
                {loadingMore && <Loader2 size={16} className="animate-spin" />}
                Carregar mais peças
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ProductCard({ part, onClick }: { part: Part; onClick: () => void }) {
  const inStock = part.stock_quantity > 0;

  return (
    <button
      onClick={onClick}
      className="group flex flex-col bg-card border border-border rounded-2xl overflow-hidden text-left hover:border-brand/60 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200"
    >
      {/* Image */}
      <div className="relative aspect-square bg-card border-b border-border flex items-center justify-center overflow-hidden">
        {part.photo_url ? (
          <img
            src={part.photo_url}
            alt={part.description}
            loading="lazy"
            className="w-full h-full object-contain p-3 group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="flex flex-col items-center gap-2 text-muted-foreground/60">
            <Package size={48} strokeWidth={1.5} />
            <span className="text-xs">Sem foto</span>
          </div>
        )}
        <span
          className={`absolute top-2 left-2 text-[11px] font-semibold px-2 py-0.5 rounded-full ${
            inStock ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'
          }`}
        >
          {inStock ? `${part.stock_quantity} em estoque` : 'Sem estoque'}
        </span>
      </div>

      {/* Info */}
      <div className="flex flex-col flex-1 p-4">
        <span className="self-start text-xs font-mono font-bold text-brand-strong bg-brand/10 px-2 py-0.5 rounded">
          {part.part_number}
        </span>
        {part.alt_code && (
          <span className="mt-1 text-[11px] font-mono text-muted-foreground truncate">Ref. {part.alt_code}</span>
        )}
        <p className="mt-2 text-sm font-semibold text-foreground leading-snug line-clamp-2 min-h-[2.5rem]">
          {part.description}
        </p>
        {part.supplier && <p className="mt-1 text-xs text-muted-foreground truncate">{part.supplier}</p>}
        {part.category && <p className="mt-0.5 text-[11px] text-muted-foreground/80 truncate">Grupo: {part.category}</p>}
        <div className="mt-auto pt-3 flex items-end justify-between gap-2">
          <p className="text-lg font-bold text-foreground">{formatCurrency(part.unit_price)}</p>
          <span className="text-xs font-medium text-brand-strong opacity-0 group-hover:opacity-100 transition-opacity">
            Ver detalhes
          </span>
        </div>
      </div>
    </button>
  );
}
