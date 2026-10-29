import { useEffect, useRef, useState, type FocusEvent } from 'react';
import { NavLink } from 'react-router-dom';
import { Pin, PinOff, X } from 'lucide-react';
import { CREDITO, NOME_PORTAL, PAPEIS, menuParaPapel } from '@/config/portal';
import { useAuth } from '@/features/auth/AuthProvider';
import { LogoHorizontal, LogoIcone } from './BrandLogo';

interface AppSidebarProps {
  /** Fixado: fica aberto e empurra o conteúdo. Solto: compacto, abre sobre o conteúdo ao passar o mouse. */
  fixado: boolean;
  onAlternarFixado: () => void;
  mobileAberto: boolean;
  onFecharMobile: () => void;
}

const ATRASO_ABRIR_MS = 80;
const ATRASO_FECHAR_MS = 250;

export function AppSidebar({ fixado, onAlternarFixado, mobileAberto, onFecharMobile }: AppSidebarProps) {
  const { perfil, papel } = useAuth();
  const secoes = menuParaPapel(papel);
  const [sobre, setSobre] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!mobileAberto) return;
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onFecharMobile();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [mobileAberto, onFecharMobile]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const agendar = (valor: boolean, atraso: number) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setSobre(valor), atraso);
  };

  const abrir = () => {
    if (!fixado) agendar(true, ATRASO_ABRIR_MS);
  };
  const fechar = () => {
    if (!fixado) agendar(false, ATRASO_FECHAR_MS);
  };
  const aoSairFoco = (event: FocusEvent<HTMLElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) fechar();
  };

  const alternarFixado = () => {
    if (timer.current) clearTimeout(timer.current);
    setSobre(false);
    onAlternarFixado();
  };

  const expandido = fixado || sobre || mobileAberto;
  const compacto = !expandido;
  const flutuando = sobre && !fixado && !mobileAberto;

  return (
    <>
      {mobileAberto && <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={onFecharMobile} aria-hidden="true" />}

      {/* Reserva o espaço no desktop: compacto quando solto, largo quando fixado. */}
      <div aria-hidden="true" className={`no-print hidden shrink-0 transition-[width] duration-300 ease-in-out lg:block ${fixado ? 'w-72' : 'w-20'}`} />

      <aside
        onMouseEnter={abrir}
        onMouseLeave={fechar}
        onFocus={abrir}
        onBlur={aoSairFoco}
        className={`no-print fixed inset-y-0 left-0 z-50 flex flex-col border-r border-ink-border bg-ink text-ink-foreground transition-[width,transform,box-shadow] duration-300 ease-in-out lg:translate-x-0 ${
          mobileAberto ? 'translate-x-0' : '-translate-x-full'
        } ${compacto ? 'w-20' : 'w-72'} ${flutuando ? 'shadow-2xl shadow-black/40' : ''}`}
        aria-label="Menu principal"
      >
        <div className={`flex h-20 items-center gap-2 border-b border-ink-border px-4 ${compacto ? 'justify-center' : 'justify-between'}`}>
          {compacto ? <LogoIcone /> : <LogoHorizontal className="flex-1" />}
          <button
            type="button"
            onClick={onFecharMobile}
            aria-label="Fechar menu"
            className="rounded-lg p-1.5 text-ink-muted hover:bg-ink-2 hover:text-ink-foreground lg:hidden"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        {!compacto && <p className="truncate px-5 pt-3 text-[11px] font-medium text-ink-muted">{NOME_PORTAL}</p>}

        <nav className="flex-1 space-y-5 overflow-y-auto overflow-x-hidden px-3 py-4">
          {secoes.map((secao, index) => (
            <div key={secao.titulo ?? index}>
              {secao.titulo && !compacto && <p className="section-label mb-2 truncate px-3 !text-ink-muted">{secao.titulo}</p>}
              <ul className="space-y-1">
                {secao.itens.map(({ rota, rotulo, icone: Icone }) => (
                  <li key={rota}>
                    <NavLink
                      to={rota}
                      onClick={onFecharMobile}
                      title={compacto ? rotulo : undefined}
                      aria-label={compacto ? rotulo : undefined}
                      className={({ isActive }) =>
                        `group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                          compacto ? 'justify-center' : ''
                        } ${isActive ? 'bg-brand text-brand-foreground shadow-brand' : 'text-ink-muted hover:bg-ink-2 hover:text-ink-foreground'}`
                      }
                    >
                      <Icone size={19} className="shrink-0 transition-transform duration-200 group-hover:scale-110" aria-hidden="true" />
                      {!compacto && <span className="truncate">{rotulo}</span>}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="hidden border-t border-ink-border px-3 py-2 lg:block">
          <button
            type="button"
            onClick={alternarFixado}
            aria-pressed={fixado}
            aria-label={fixado ? 'Soltar menu (abre ao passar o mouse)' : 'Fixar menu aberto'}
            title={fixado ? 'Soltar menu (abre ao passar o mouse)' : 'Fixar menu aberto'}
            className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs text-ink-muted transition-colors hover:bg-ink-2 hover:text-ink-foreground ${
              compacto ? 'justify-center' : 'justify-between'
            }`}
          >
            {!compacto && <span className="truncate">{fixado ? 'Menu fixo' : 'Abre ao passar o mouse'}</span>}
            {fixado ? <PinOff size={16} aria-hidden="true" /> : <Pin size={16} aria-hidden="true" />}
          </button>
        </div>

        <div className={`flex items-center gap-3 border-t border-ink-border p-4 ${compacto ? 'justify-center' : ''}`}>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-bold text-brand-foreground" aria-hidden="true">
            {(perfil?.name ?? '?').charAt(0).toUpperCase()}
          </span>
          {!compacto && (
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{perfil?.name}</p>
              <p className="truncate text-xs text-ink-muted">{papel ? PAPEIS[papel] : ''}</p>
              <p className="mt-0.5 truncate text-[10px] text-ink-muted/80">{CREDITO}</p>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
