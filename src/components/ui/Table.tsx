import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Inbox } from 'lucide-react';
import { Button } from './Button';

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  className?: string;
}

interface TableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  emptyTitle?: string;
  emptyText?: string;
  page?: number;
  pageCount?: number;
  onPageChange?: (page: number) => void;
  stickyHeader?: boolean;
  className?: string;
}

export function EmptyState({ title, text }: { title: string; text?: string }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
        <Inbox size={22} aria-hidden="true" />
      </span>
      <p className="font-semibold text-foreground">{title}</p>
      {text && <p className="mt-1 text-sm text-muted-foreground">{text}</p>}
    </div>
  );
}

export function Table<T>({
  columns,
  rows,
  rowKey,
  loading = false,
  emptyTitle = 'Nenhum registro encontrado',
  emptyText,
  page,
  pageCount,
  onPageChange,
  stickyHeader = false,
  className = '',
}: TableProps<T>) {
  if (loading) {
    return (
      <div className="space-y-2 p-4" aria-busy="true">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-10 animate-pulse rounded-xl bg-muted" />
        ))}
      </div>
    );
  }
  if (rows.length === 0) return <EmptyState title={emptyTitle} text={emptyText} />;

  return (
    <div>
      <div className={`overflow-x-auto ${className}`}>
        <table className="w-full text-left text-sm">
          <thead className={stickyHeader ? 'sticky top-0 z-10' : ''}>
            <tr className="border-b border-border bg-table-head">
              {columns.map((column) => (
                <th key={column.key} scope="col" className={`section-label whitespace-nowrap px-4 py-3 ${column.className ?? ''}`}>
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr key={rowKey(row)} className="transition-colors hover:bg-muted/50">
                {columns.map((column) => (
                  <td key={column.key} className={`px-4 py-3 align-middle text-foreground ${column.className ?? ''}`}>
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pageCount && pageCount > 1 && onPageChange && page ? (
        <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3 text-sm text-muted-foreground">
          <span>
            Página {page} de {pageCount}
          </span>
          <Button variant="secondary" size="sm" onClick={() => onPageChange(page - 1)} disabled={page <= 1}>
            <ChevronLeft size={14} aria-hidden="true" /> Anterior
          </Button>
          <Button variant="secondary" size="sm" onClick={() => onPageChange(page + 1)} disabled={page >= pageCount}>
            Próxima <ChevronRight size={14} aria-hidden="true" />
          </Button>
        </div>
      ) : null}
    </div>
  );
}
