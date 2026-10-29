import { Check, Circle } from 'lucide-react';
import { PASSWORD_CHECKLIST } from '@/shared/passwordPolicy';

export function PasswordChecklist({ value, dark = false }: { value: string; dark?: boolean }) {
  return (
    <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs" aria-label="Requisitos da senha">
      {PASSWORD_CHECKLIST.map((item) => {
        const ok = item.test(value);
        return (
          <li
            key={item.id}
            aria-label={`${item.label}: ${ok ? 'atende' : 'falta'}`}
            className={`flex items-center gap-1 ${ok ? 'text-success' : dark ? 'text-white/45' : 'text-muted-foreground/70'}`}
          >
            {ok ? <Check size={12} aria-hidden="true" /> : <Circle size={10} aria-hidden="true" />}
            {item.label}
          </li>
        );
      })}
    </ul>
  );
}
