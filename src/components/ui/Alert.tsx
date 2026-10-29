import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';

type AlertTone = 'info' | 'success' | 'warning' | 'error';

const styles: Record<AlertTone, { box: string; icon: typeof Info }> = {
  info: { box: 'border-info/30 bg-info/10 text-foreground', icon: Info },
  success: { box: 'border-success/30 bg-success/10 text-foreground', icon: CheckCircle2 },
  warning: { box: 'border-warning/30 bg-warning/10 text-foreground', icon: AlertTriangle },
  error: { box: 'border-destructive/30 bg-destructive/10 text-foreground', icon: XCircle },
};

const iconColor: Record<AlertTone, string> = {
  info: 'text-info',
  success: 'text-success',
  warning: 'text-warning',
  error: 'text-destructive',
};

export function Alert({ tone = 'info', title, children, className = '' }: { tone?: AlertTone; title?: string; children?: ReactNode; className?: string }) {
  const { box, icon: Icon } = styles[tone];
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`flex gap-3 rounded-xl border px-4 py-3 text-sm ${box} ${className}`}>
      <Icon size={18} className={`mt-0.5 shrink-0 ${iconColor[tone]}`} aria-hidden="true" />
      <div className="min-w-0">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={title ? 'mt-0.5 text-muted-foreground' : ''}>{children}</div>}
      </div>
    </div>
  );
}
