import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export interface FilterOption {
  value: string;
  total: number;
}

/** Marca = fornecedor (supplier, em maiúsculas); Grupo = category. */
export interface PartFilterOptions {
  supplier: FilterOption[];
  category: FilterOption[];
}

const VAZIO: PartFilterOptions = { supplier: [], category: [] };

/** Valores já usados nas peças, com a quantidade de cada um. */
export function usePartFilterOptions(refreshKey = 0): PartFilterOptions {
  const [options, setOptions] = useState<PartFilterOptions>(VAZIO);

  useEffect(() => {
    let active = true;
    void supabase.rpc('pp_part_filter_options').then(({ data, error }) => {
      if (!active) return;
      if (error) {
        console.error('Filter options error:', error);
        return;
      }
      const rows = (data ?? []) as { field: string; value: string; total: number }[];
      const pick = (field: string) => rows.filter((r) => r.field === field).map((r) => ({ value: r.value, total: Number(r.total) }));
      setOptions({ supplier: pick('supplier'), category: pick('category') });
    });
    return () => {
      active = false;
    };
  }, [refreshKey]);

  return options;
}

/** Texto exato no ILIKE (sem diferenciar maiúsculas): escapa os curingas % e _. */
export function ilikeExact(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}
