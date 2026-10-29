import type { HTMLAttributes, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

export function Card({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`card-surface ${className}`} {...props} />;
}

interface CardTitleProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  action?: ReactNode;
}

export function CardTitle({ title, description, icon: Icon, action }: CardTitleProps) {
  return (
    <div className="mb-5 flex items-start justify-between gap-4">
      <div className="flex items-start gap-3">
        {Icon && (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand/15 text-brand-strong">
            <Icon size={18} aria-hidden="true" />
          </span>
        )}
        <div>
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {action && <div className="flex flex-wrap items-center gap-2">{action}</div>}
    </div>
  );
}

type Tone = 'neutral' | 'brand' | 'info' | 'success' | 'warning' | 'destructive';

const toneClasses: Record<Tone, string> = {
  neutral: 'bg-muted text-muted-foreground',
  brand: 'bg-brand/15 text-brand-strong',
  info: 'bg-info/15 text-info',
  success: 'bg-success/15 text-success',
  warning: 'bg-warning/15 text-warning',
  destructive: 'bg-destructive/15 text-destructive',
};

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${toneClasses[tone]}`}>
      {children}
    </span>
  );
}

interface CardIndicadorProps {
  label: string;
  value: ReactNode;
  icon: LucideIcon;
  tone?: Exclude<Tone, 'neutral'>;
  hint?: string;
  onClick?: () => void;
  expanded?: boolean;
}

export function CardIndicador({ label, value, icon: Icon, tone = 'brand', hint, onClick, expanded }: CardIndicadorProps) {
  const content = (
    <>
      <div className="flex items-center justify-between gap-3">
        <span className="section-label">{label}</span>
        <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${toneClasses[tone]}`}>
          <Icon size={20} aria-hidden="true" />
        </span>
      </div>
      <div className="mt-3 text-3xl font-bold text-foreground">{value}</div>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </>
  );
  if (!onClick) return <div className="card-surface p-5">{content}</div>;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={expanded}
      className={`card-surface p-5 text-left transition-colors hover:border-brand/60 ${expanded ? 'border-brand' : ''}`}
    >
      {content}
    </button>
  );
}
