import { createContext, useCallback, useContext, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { isStepUpError } from '@/lib/functions';
import { supabase } from '@/lib/supabase';
import { useAuth } from './AuthProvider';

type ComStepUp = <T>(acao: () => Promise<T>) => Promise<T>;

const StepUpContext = createContext<ComStepUp | null>(null);

export class AcaoCancelada extends Error {
  constructor() {
    super('Ação cancelada.');
  }
}

interface StepUpDialogProps {
  open: boolean;
  onVerified: () => void;
  onCancel: () => void;
}

/** Pede um código TOTP recente e eleva a sessão (challenge + verify). */
export function StepUpDialog({ open, onVerified, onCancel }: StepUpDialogProps) {
  const { fatoresVerificados, recarregar } = useAuth();
  const [codigo, setCodigo] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const fator = fatoresVerificados[0];
    if (!fator) {
      setErro('Cadastre o aplicativo autenticador no seu perfil para continuar.');
      return;
    }
    setEnviando(true);
    setErro(null);
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: fator.id, code: codigo.trim() });
    setEnviando(false);
    if (error) {
      setErro('Código inválido.');
      return;
    }
    setCodigo('');
    await recarregar();
    onVerified();
  };

  const cancelar = () => {
    setCodigo('');
    setErro(null);
    onCancel();
  };

  return (
    <Modal open={open} title="Confirme com o código do seu aplicativo" description="Esta ação exige uma confirmação recente do autenticador." onClose={cancelar} locked={enviando} size="sm">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Código de 6 dígitos" error={erro}>
          {(props) => (
            <Input
              {...props}
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              className="text-center font-mono text-lg tracking-[0.5em]"
              data-autofocus
            />
          )}
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={cancelar} disabled={enviando}>
            Cancelar
          </Button>
          <Button type="submit" loading={enviando} disabled={codigo.length !== 6}>
            <ShieldCheck size={16} aria-hidden="true" />
            Confirmar
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function StepUpProvider({ children }: { children: ReactNode }) {
  const [aberto, setAberto] = useState(false);
  const pendente = useRef<{ resolve: () => void; reject: (err: Error) => void } | null>(null);

  const pedirCodigo = useCallback(
    () =>
      new Promise<void>((resolve, reject) => {
        pendente.current = { resolve, reject };
        setAberto(true);
      }),
    [],
  );

  const comStepUp = useCallback<ComStepUp>(
    async (acao) => {
      try {
        return await acao();
      } catch (err) {
        if (!isStepUpError(err)) throw err;
        await pedirCodigo();
        return acao();
      }
    },
    [pedirCodigo],
  );

  return (
    <StepUpContext.Provider value={comStepUp}>
      {children}
      <StepUpDialog
        open={aberto}
        onVerified={() => {
          setAberto(false);
          pendente.current?.resolve();
          pendente.current = null;
        }}
        onCancel={() => {
          setAberto(false);
          pendente.current?.reject(new AcaoCancelada());
          pendente.current = null;
        }}
      />
    </StepUpContext.Provider>
  );
}

export function useStepUp(): ComStepUp {
  const context = useContext(StepUpContext);
  if (!context) throw new Error('useStepUp precisa estar dentro de StepUpProvider');
  return context;
}
