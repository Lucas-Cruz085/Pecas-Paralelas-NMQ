import { useState, type FormEvent } from 'react';
import { KeyRound, Loader2 } from 'lucide-react';
import { callFunction } from '@/lib/functions';
import { supabase } from '@/lib/supabase';
import { useAuth } from './AuthProvider';
import { AuthLayout, authInputClass, authInputStyle } from './AuthLayout';

export default function MfaChallengePage() {
  const { fatoresVerificados, recarregar, sair } = useAuth();
  const [codigo, setCodigo] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const fator = fatoresVerificados[0];
    if (!fator || codigo.length !== 6) {
      setErro('Código inválido.');
      return;
    }
    setEnviando(true);
    setErro(null);
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: fator.id, code: codigo });
    if (error) {
      setEnviando(false);
      setCodigo('');
      setErro('Código inválido.');
      void callFunction('mfa-events', { evento: 'MFA_FALHA' }).catch(() => undefined);
      return;
    }
    await recarregar();
  };

  return (
    <AuthLayout>
      <h2 className="mt-3 text-3xl font-bold">Verificação em duas etapas</h2>
      <p className="mt-1 text-sm text-white/60">Digite o código de 6 dígitos do seu aplicativo autenticador.</p>

      <form onSubmit={submit} className="mt-7 space-y-4">
        <div>
          <label htmlFor="mfa-codigo" className="mb-1.5 block text-sm font-medium text-white/80">
            Código
          </label>
          <div className="relative">
            <KeyRound size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/40" aria-hidden="true" />
            <input
              id="mfa-codigo"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              className={`${authInputClass} font-mono text-lg tracking-[0.5em]`}
              style={authInputStyle}
              autoFocus
            />
          </div>
        </div>

        {erro && (
          <p role="alert" className="text-sm font-medium text-red-300">
            {erro}
          </p>
        )}

        <button
          type="submit"
          disabled={enviando || codigo.length !== 6}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand text-sm font-bold text-brand-foreground shadow-brand transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {enviando && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
          {enviando ? 'Verificando...' : 'Verificar'}
        </button>
        <button type="button" onClick={() => void sair()} className="w-full text-center text-sm text-white/60 hover:text-brand">
          Sair
        </button>
      </form>
    </AuthLayout>
  );
}
