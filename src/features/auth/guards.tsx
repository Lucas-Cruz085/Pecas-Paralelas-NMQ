import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from './AuthProvider';
import { ROTAS, ehRotaDeFluxo, resolverRota, rotaPermitida } from './resolverRota';

export function TelaCarregando() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background" aria-busy="true">
      <Loader2 size={32} className="animate-spin text-brand-strong" aria-label="Carregando" />
    </div>
  );
}

/** Telas do fluxo de acesso: só renderizam quando são o passo atual do usuário. */
export function RotaDeFluxo({ rota, children }: { rota: string; children: ReactNode }) {
  const { carregando, estado } = useAuth();
  const location = useLocation();
  if (carregando) return <TelaCarregando />;
  const desejado = (location.state as { from?: string } | null)?.from;
  const destino = desejado && !ehRotaDeFluxo(desejado) ? desejado : ROTAS.inicio;
  const alvo = resolverRota(estado, destino);
  if (alvo !== rota) return <Navigate to={alvo} replace state={location.state} />;
  return <>{children}</>;
}

/** Área autenticada: aplica a ordem de redirecionamento antes de renderizar qualquer página. */
export function RotaProtegida({ children }: { children: ReactNode }) {
  const { carregando, estado } = useAuth();
  const location = useLocation();
  if (carregando) return <TelaCarregando />;
  const atual = `${location.pathname}${location.search}${location.hash}`;
  const alvo = resolverRota(estado, atual);
  if (alvo !== atual) return <Navigate to={alvo} replace state={{ from: atual }} />;
  return <>{children}</>;
}

/** Só admin. O servidor e a RLS barram de qualquer forma; aqui o conteúdo nem renderiza. */
export function SomenteAdmin({ children }: { children: ReactNode }) {
  const { papel } = useAuth();
  const location = useLocation();
  if (!rotaPermitida(location.pathname, papel)) return <Navigate to={ROTAS.dashboard} replace />;
  return <>{children}</>;
}
