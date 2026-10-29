import { useEffect, type ReactNode } from 'react';
import {
  AUTOR,
  BENEFICIOS_LOGIN,
  CREDITO,
  FRASE_LOGIN,
  FUNDO_LOGIN,
  FUNDO_LOGIN_FALLBACK,
  NOME_EMPRESA,
  NOME_PORTAL,
  TEXTO_LOGIN,
} from '@/config/portal';
import { LogoHorizontal } from '@/components/layout/BrandLogo';

/** Layout escuro das telas de acesso (login, desafio MFA, primeiro acesso, cadastro de MFA). */
export function AuthLayout({ children }: { children: ReactNode }) {
  useEffect(() => {
    const root = document.documentElement;
    const sync = () => root.classList.toggle('neon-paused', document.hidden);
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => {
      document.removeEventListener('visibilitychange', sync);
      root.classList.remove('neon-paused');
    };
  }, []);

  return (
    <div
      className="relative flex min-h-screen flex-col bg-cover bg-center text-white"
      style={{ backgroundImage: `url(${FUNDO_LOGIN}), url(${FUNDO_LOGIN_FALLBACK})`, backgroundColor: '#070b14' }}
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'linear-gradient(115deg, oklch(0.07 0.02 262) 0%, oklch(0.08 0.02 262 / 94%) 40%, oklch(0.2 0.03 262 / 42%) 100%)',
        }}
        aria-hidden="true"
      />

      <main className="relative z-10 mx-auto grid w-full max-w-6xl flex-1 items-center gap-12 px-6 py-10 lg:grid-cols-2">
        <section className="hidden lg:block">
          <LogoHorizontal className="w-fit" />
          <span className="mt-8 inline-flex rounded-full border border-brand/40 bg-brand/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-brand">
            {NOME_EMPRESA}
          </span>
          <h1 className="mt-5 text-5xl font-extrabold leading-tight tracking-tight">{FRASE_LOGIN}</h1>
          <p className="mt-4 max-w-md text-base text-white/70">{TEXTO_LOGIN}</p>
          <ul className="mt-8 space-y-4">
            {BENEFICIOS_LOGIN.map(({ icone: Icone, texto }) => (
              <li key={texto} className="flex items-center gap-3 text-sm text-white/85">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand/15 text-brand">
                  <Icone size={18} aria-hidden="true" />
                </span>
                {texto}
              </li>
            ))}
          </ul>
        </section>

        <section className="mx-auto w-full max-w-md">
          <LogoHorizontal className="mx-auto mb-8 w-fit lg:hidden" />
          <div className="neon-frame shadow-2xl">
            <div
              className="relative overflow-hidden rounded-[21px] border border-white/10 p-8 backdrop-blur-xl"
              style={{ background: 'oklch(0.18 0.025 262 / 78%)' }}
            >
              <div className="pointer-events-none absolute -left-16 -top-16 h-48 w-48 rounded-full bg-brand/25 blur-3xl" aria-hidden="true" />
              <div className="relative">
                <span className="text-xs font-bold uppercase tracking-[0.22em] text-brand">{NOME_PORTAL}</span>
                {children}
                <p className="mt-8 border-t border-white/10 pt-4 text-center text-[11px] text-white/45">
                  {NOME_PORTAL} · Acesso monitorado · Desenvolvido por {AUTOR}
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="relative z-10 px-6 py-5 text-center text-xs text-white/50">
        {CREDITO} | © {new Date().getFullYear()} {NOME_EMPRESA} - Todos os direitos reservados
      </footer>
    </div>
  );
}

/** Campo escuro usado nas telas de acesso. */
export const authInputClass =
  'h-12 w-full rounded-xl border border-white/[0.12] pl-11 pr-11 text-sm text-white placeholder:text-white/35 transition-colors focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30';

export const authInputStyle = { background: 'oklch(0.24 0.03 262 / 85%)' };
