import { useState, type ReactNode } from 'react';
import { ChevronDown, Filter } from 'lucide-react';
import { storageKey } from '@/config/portal';
import { Button } from './Button';

interface FilterPanelProps {
  /** Nome da página; a preferência fica em localStorage[{PREFIXO}-{storageName}-filtros]. */
  storageName: string;
  activeCount: number;
  onClear: () => void;
  children: ReactNode;
}

function readOpen(key: string): boolean {
  try {
    return localStorage.getItem(key) === 'aberto';
  } catch {
    return false;
  }
}

export function FilterPanel({ storageName, activeCount, onClear, children }: FilterPanelProps) {
  const key = storageKey(`${storageName}-filtros`);
  const [open, setOpen] = useState(() => readOpen(key));

  const toggle = () => {
    setOpen((value) => {
      try {
        localStorage.setItem(key, value ? 'fechado' : 'aberto');
      } catch {
        // sem armazenamento: vale só nesta sessão
      }
      return !value;
    });
  };

  return (
    <div className="card-surface mb-4">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
        <div className="flex items-center gap-2">
          <Filter size={16} className="text-muted-foreground" aria-hidden="true" />
          <span className="text-sm font-semibold text-foreground">Filtros</span>
          {activeCount > 0 && (
            <span className="rounded-full bg-brand/15 px-2 py-0.5 text-xs font-semibold text-brand-strong">
              {activeCount === 1 ? '1 ativo' : `${activeCount} ativos`}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {activeCount > 0 && (
            <Button variant="ghost" size="sm" onClick={onClear}>
              Limpar
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={toggle} aria-expanded={open}>
            {open ? 'Encolher' : 'Expandir'}
            <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
          </Button>
        </div>
      </div>
      {open && <div className="border-t border-border px-5 py-4">{children}</div>}
    </div>
  );
}
