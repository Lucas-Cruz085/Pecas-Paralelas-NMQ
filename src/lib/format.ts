const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

export function formatCurrency(value: number | string | null | undefined): string {
  const numeric = Number(value ?? 0);
  return currencyFormatter.format(Number.isFinite(numeric) ? numeric : 0);
}
