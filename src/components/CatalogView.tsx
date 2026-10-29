import { useState, useEffect, useRef } from 'react';
import { Search, Package, AlertCircle, Loader2, ChevronRight, WifiOff } from 'lucide-react';
import { supabase, getErrorMessage, type Part } from '@/lib/supabase';
import { formatCurrency } from '@/lib/format';

interface CatalogViewProps {
  onSelectPart: (part: Part) => void;
  refreshKey?: number;
}

// Vírgulas, parênteses e aspas quebram a sintaxe do filtro .or() do PostgREST;
// % e _ são curingas do ILIKE e * é o curinga alternativo aceito na URL.
function sanitizeSearchTerm(query: string): string {
  return query.replace(/[,()"'\\%_*]/g, ' ').replace(/\s+/g, ' ').trim();
}

export default function CatalogView({ onSelectPart, refreshKey = 0 }: CatalogViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<Part[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    const term = sanitizeSearchTerm(searchQuery);
    const requestId = ++requestIdRef.current;

    if (!term) {
      setResults([]);
      setHasSearched(false);
      setLoading(false);
      setError(null);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      setHasSearched(true);
      setError(null);

      const pattern = `%${term}%`;
      const { data, error: queryError } = await supabase
        .from('parts')
        .select('*')
        .or(
          `part_number.ilike.${pattern},description.ilike.${pattern},brand.ilike.${pattern},oem_reference.ilike.${pattern}`
        )
        .order('part_number');

      if (requestId !== requestIdRef.current) return;

      if (queryError) {
        console.error('Search error:', queryError);
        setError(getErrorMessage(queryError, 'Não foi possível consultar o catálogo.'));
        setResults([]);
      } else {
        setResults((data as Part[]) ?? []);
      }
      setLoading(false);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, refreshKey]);

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Page title */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Catálogo de Peças Paralelas</h1>
        <p className="text-slate-500 text-sm mt-1">
          Pesquise por código (part number) ou descrição da peça paralela.
        </p>
      </div>

      {/* Search bar */}
      <div className="relative mb-6">
        <div className="relative">
          <Search
            size={20}
            className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Digite o código (part number) ou descrição da peça..."
            className="w-full pl-12 pr-4 py-3.5 bg-white border border-slate-200 rounded-xl text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all shadow-sm"
            autoFocus
          />
        </div>
      </div>

      {/* Results */}
      {!hasSearched && !loading && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-20 h-20 rounded-full bg-slate-100 flex items-center justify-center mb-4">
            <Search size={36} className="text-slate-300" />
          </div>
          <h3 className="text-lg font-semibold text-slate-600 mb-1">
            Faça sua pesquisa
          </h3>
          <p className="text-slate-400 text-sm max-w-md">
            Digite acima o código ou descrição da peça paralela que você procura.
          </p>
        </div>
      )}

      {loading && (
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2 size={32} className="text-blue-500 animate-spin mb-3" />
          <p className="text-slate-500 text-sm">Pesquisando...</p>
        </div>
      )}

      {!loading && error && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-20 h-20 rounded-full bg-red-50 flex items-center justify-center mb-4">
            <WifiOff size={36} className="text-red-400" />
          </div>
          <h3 className="text-lg font-semibold text-slate-600 mb-1">
            Erro ao consultar o catálogo
          </h3>
          <p className="text-slate-400 text-sm max-w-md">{error}</p>
        </div>
      )}

      {!loading && !error && hasSearched && results.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-20 h-20 rounded-full bg-amber-50 flex items-center justify-center mb-4">
            <AlertCircle size={36} className="text-amber-400" />
          </div>
          <h3 className="text-lg font-semibold text-slate-600 mb-1">
            Item paralelo inexistente ou não cadastrado
          </h3>
          <p className="text-slate-400 text-sm max-w-md">
            Não encontramos nenhuma peça paralela com "{searchQuery}".
            Verifique o código ou descrição informados.
          </p>
        </div>
      )}

      {!loading && !error && results.length > 0 && (
        <>
          <div className="mb-4 text-sm text-slate-500">
            {results.length} {results.length === 1 ? 'peça encontrada' : 'peças encontradas'}
          </div>
          <div className="grid gap-4">
            {results.map((part) => (
              <PartCard key={part.id} part={part} onClick={() => onSelectPart(part)} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function PartCard({ part, onClick }: { part: Part; onClick: () => void }) {
  const inStock = part.stock_quantity > 0;

  return (
    <button
      onClick={onClick}
      className="group flex items-center gap-4 bg-white border border-slate-200 rounded-xl p-5 text-left hover:border-blue-300 hover:shadow-lg transition-all duration-200"
    >
      {/* Thumbnail / Icon */}
      <div className="flex-shrink-0 w-14 h-14 rounded-xl overflow-hidden bg-slate-100 flex items-center justify-center group-hover:bg-blue-50 transition-colors">
        {part.photo_url ? (
          <img src={part.photo_url} alt={part.description} className="w-full h-full object-cover" />
        ) : (
          <Package size={28} className="text-slate-400 group-hover:text-blue-500 transition-colors" />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-3 mb-1">
          <span className="text-xs font-mono font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
            {part.part_number}
          </span>
          {part.brand && (
            <span className="text-xs text-slate-500 font-medium">{part.brand}</span>
          )}
          <span
            className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
              inStock
                ? 'bg-green-50 text-green-700'
                : 'bg-red-50 text-red-700'
            }`}
          >
            {inStock ? `${part.stock_quantity} un` : 'Sem estoque'}
          </span>
        </div>
        <p className="font-semibold text-slate-800 truncate">{part.description}</p>
        <p className="text-sm text-slate-400 mt-0.5 truncate">
          {part.category || 'Sem categoria'}
          {part.oem_reference && ` • Ref. OEM: ${part.oem_reference}`}
        </p>
      </div>

      {/* Price */}
      <div className="flex-shrink-0 text-right">
        <p className="text-xs text-slate-400">Preço</p>
        <p className="text-lg font-bold text-slate-800">{formatCurrency(part.unit_price)}</p>
      </div>

      <ChevronRight
        size={20}
        className="flex-shrink-0 text-slate-300 group-hover:text-blue-500 group-hover:translate-x-1 transition-all"
      />
    </button>
  );
}
