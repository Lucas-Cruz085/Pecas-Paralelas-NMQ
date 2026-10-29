import { useCallback, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { LogOut, Menu } from 'lucide-react';
import { rotuloDaRota, SEGURANCA, storageKey } from '@/config/portal';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { useAuth } from '@/features/auth/AuthProvider';
import { useHeartbeat, useInatividade } from '@/features/auth/sessionHooks';
import { AppSidebar } from './AppSidebar';
import { NotificationBell } from './NotificationBell';
import { ThemeToggle } from './ThemeToggle';

const SIDEBAR_KEY = storageKey('sidebar');

function lerFixado(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_KEY) === 'fixo';
  } catch {
    return false;
  }
}

export function AppShell() {
  const { papel, sair } = useAuth();
  const location = useLocation();
  const [fixado, setFixado] = useState(lerFixado);
  const [mobileAberto, setMobileAberto] = useState(false);
  const [saindo, setSaindo] = useState(false);

  const alternarFixado = () =>
    setFixado((valor) => {
      try {
        localStorage.setItem(SIDEBAR_KEY, valor ? 'auto' : 'fixo');
      } catch {
        // sem armazenamento: vale só nesta aba
      }
      return !valor;
    });

  const fecharMobile = useCallback(() => setMobileAberto(false), []);

  const expirar = useCallback(() => {
    void sair('Sessão encerrada por inatividade.');
  }, [sair]);
  const { avisando, continuar } = useInatividade(true, expirar);
  useHeartbeat(true);

  const handleSair = async () => {
    setSaindo(true);
    await sair();
  };

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar fixado={fixado} onAlternarFixado={alternarFixado} mobileAberto={mobileAberto} onFecharMobile={fecharMobile} />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-border bg-card/80 px-4 backdrop-blur-md lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileAberto(true)}
              aria-label="Abrir menu"
              className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground lg:hidden"
            >
              <Menu size={20} aria-hidden="true" />
            </button>
            <h1 className="truncate text-base font-semibold text-foreground">{rotuloDaRota(location.pathname)}</h1>
          </div>
          <div className="flex items-center gap-2">
            {papel === 'admin' && <NotificationBell />}
            <ThemeToggle />
            <Button variant="ghost" size="sm" onClick={handleSair} loading={saindo} aria-label="Sair">
              {!saindo && <LogOut size={16} aria-hidden="true" />}
              <span className="hidden sm:inline">Sair</span>
            </Button>
          </div>
        </header>

        <main className="flex-1 p-6 lg:p-8">
          <Outlet />
        </main>
      </div>

      <Modal
        open={avisando}
        title="Sua sessão vai expirar"
        description={`Sem atividade há quase ${SEGURANCA.INATIVIDADE_MIN} minutos. Você será desconectado em instantes.`}
        onClose={continuar}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => void sair()}>
              Sair agora
            </Button>
            <Button onClick={continuar}>Continuar conectado</Button>
          </>
        }
      >
        <p className="text-sm text-muted-foreground">Clique em continuar para manter a sessão aberta.</p>
      </Modal>
    </div>
  );
}
