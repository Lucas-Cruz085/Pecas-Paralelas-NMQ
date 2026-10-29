import { useEffect, useState, type MouseEvent } from 'react';
import { Moon, Sun } from 'lucide-react';
import { storageKey } from '@/config/portal';
import { currentTheme, switchTheme, type Theme } from '@/lib/theme';

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => currentTheme());

  useEffect(() => {
    const sync = () => setTheme(currentTheme());
    window.addEventListener(storageKey('theme-change'), sync);
    return () => window.removeEventListener(storageKey('theme-change'), sync);
  }, []);

  const dark = theme === 'dark';

  const toggle = (event: MouseEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    void switchTheme(dark ? 'light' : 'dark', { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={dark}
      aria-label={dark ? 'Ativar tema claro' : 'Ativar tema noturno'}
      className="inline-flex h-9 items-center gap-2 rounded-xl border border-border bg-card px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted"
    >
      {dark ? <Sun size={16} aria-hidden="true" /> : <Moon size={16} aria-hidden="true" />}
      <span className="hidden sm:inline">{dark ? 'Claro' : 'Noturno'}</span>
    </button>
  );
}
