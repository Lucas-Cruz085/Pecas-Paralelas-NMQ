import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import SetupNotice from '@/components/SetupNotice';
import { AppShell } from '@/components/layout/AppShell';
import { ToastProvider } from '@/components/ui/Toast';
import { AuthProvider } from '@/features/auth/AuthProvider';
import { RotaDeFluxo, RotaProtegida, SomenteAdmin } from '@/features/auth/guards';
import { ROTAS } from '@/features/auth/resolverRota';
import { StepUpProvider } from '@/features/auth/StepUp';
import { isSupabaseConfigured } from '@/lib/supabase';

const LoginPage = lazy(() => import('@/features/auth/LoginPage'));
const MfaChallengePage = lazy(() => import('@/features/auth/MfaChallengePage'));
const FirstAccessPage = lazy(() => import('@/features/auth/FirstAccessPage'));
const MfaEnrollPage = lazy(() => import('@/features/auth/MfaEnrollPage'));
const DashboardPage = lazy(() => import('@/features/dashboard/DashboardPage'));
const CatalogoPage = lazy(() => import('@/features/catalogo/CatalogoPage'));
const CadastroPage = lazy(() => import('@/features/catalogo/CadastroPage'));
const ImportarPage = lazy(() => import('@/features/catalogo/ImportarPage'));
const UsuariosPage = lazy(() => import('@/features/usuarios/UsuariosPage'));
const PerfilPage = lazy(() => import('@/features/perfil/PerfilPage'));
const LogsPage = lazy(() => import('@/features/logs/LogsPage'));
const LgpdPage = lazy(() => import('@/features/lgpd/LgpdPage'));
const NotFoundPage = lazy(() => import('@/features/NotFoundPage'));

function Carregando({ fullScreen = false }: { fullScreen?: boolean }) {
  return (
    <div className={`flex items-center justify-center ${fullScreen ? 'min-h-screen bg-background' : 'py-20'}`}>
      <Loader2 size={32} className="animate-spin text-brand-strong" aria-label="Carregando" />
    </div>
  );
}

const pagina = (node: ReactNode) => <Suspense fallback={<Carregando />}>{node}</Suspense>;
const fluxo = (rota: string, node: ReactNode) => (
  <RotaDeFluxo rota={rota}>
    <Suspense fallback={<Carregando fullScreen />}>{node}</Suspense>
  </RotaDeFluxo>
);

export default function App() {
  if (!isSupabaseConfigured) return <SetupNotice />;

  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <StepUpProvider>
            <Routes>
              <Route path={ROTAS.login} element={fluxo(ROTAS.login, <LoginPage />)} />
              <Route path={ROTAS.desafioMfa} element={fluxo(ROTAS.desafioMfa, <MfaChallengePage />)} />
              <Route path={ROTAS.primeiroAcesso} element={fluxo(ROTAS.primeiroAcesso, <FirstAccessPage />)} />
              <Route path={ROTAS.cadastroMfa} element={fluxo(ROTAS.cadastroMfa, <MfaEnrollPage />)} />

              <Route
                element={
                  <RotaProtegida>
                    <AppShell />
                  </RotaProtegida>
                }
              >
                <Route index element={<Navigate to={ROTAS.inicio} replace />} />
                <Route path="/dashboard" element={pagina(<DashboardPage />)} />
                <Route path="/catalogo" element={pagina(<CatalogoPage />)} />
                <Route path="/cadastro" element={pagina(<CadastroPage />)} />
                <Route path="/importar" element={pagina(<ImportarPage />)} />
                <Route path="/perfil" element={pagina(<PerfilPage />)} />
                <Route path="/lgpd" element={pagina(<LgpdPage />)} />
                <Route path="/usuarios" element={<SomenteAdmin>{pagina(<UsuariosPage />)}</SomenteAdmin>} />
                <Route path="/logs" element={<SomenteAdmin>{pagina(<LogsPage />)}</SomenteAdmin>} />
                <Route path="*" element={pagina(<NotFoundPage />)} />
              </Route>
            </Routes>
          </StepUpProvider>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
