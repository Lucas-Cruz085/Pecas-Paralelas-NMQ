import { storageKey } from '@/config/portal';

export type Theme = 'light' | 'dark';

const THEME_KEY = storageKey('theme');
let animating = false;

export function currentTheme(): Theme {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

function setTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // armazenamento indisponível: o tema vale só nesta aba
  }
  window.dispatchEvent(new CustomEvent(storageKey('theme-change'), { detail: theme }));
}

type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => void) => { ready: Promise<void>; finished: Promise<void> };
};

/** Troca o tema com um círculo a partir do ponto (x, y); sem suporte, faz fade; com movimento reduzido, troca direto. */
export async function switchTheme(next: Theme, origin?: { x: number; y: number }): Promise<void> {
  if (animating) return;
  const root = document.documentElement;
  const doc = document as ViewTransitionDocument;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (reduced) {
    setTheme(next);
    return;
  }

  animating = true;
  try {
    if (!doc.startViewTransition) {
      root.classList.add('theme-fade');
      setTheme(next);
      await new Promise((resolve) => setTimeout(resolve, 720));
      root.classList.remove('theme-fade');
      return;
    }

    const x = origin?.x ?? window.innerWidth / 2;
    const y = origin?.y ?? 0;
    const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
    const darkening = next === 'dark';
    root.dataset.themeTransition = darkening ? 'in' : 'out';

    const transition = doc.startViewTransition(() => setTheme(next));
    await transition.ready;
    const frames = [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`];
    root.animate(
      { clipPath: darkening ? frames : [...frames].reverse() },
      {
        duration: 860,
        easing: 'cubic-bezier(0.77, 0, 0.18, 1)',
        pseudoElement: darkening ? '::view-transition-new(root)' : '::view-transition-old(root)',
        fill: 'forwards',
      },
    );
    await transition.finished;
  } finally {
    delete root.dataset.themeTransition;
    animating = false;
  }
}
