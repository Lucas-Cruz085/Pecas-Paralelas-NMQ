import { useState, type FormEvent } from 'react';
import { Loader2, Lock } from 'lucide-react';
import { callFunction, functionErrorMessage } from '@/lib/functions';
import { supabase } from '@/lib/supabase';
import { PASSWORD_RULE_TEXT, validatePassword } from '@/shared/passwordPolicy';
import { useAuth } from './AuthProvider';
import { AuthLayout, authInputClass, authInputStyle } from './AuthLayout';
import { PasswordChecklist } from './PasswordChecklist';

function CampoSenha({ id, label, value, onChange, autoComplete, autoFocus }: { id: string; label: string; value: string; onChange: (v: string) => void; autoComplete: string; autoFocus?: boolean }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-white/80">
        {label}
      </label>
      <div className="relative">
        <Lock size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/40" aria-hidden="true" />
        <input
          id={id}
          type="password"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          className={authInputClass}
          style={authInputStyle}
          autoFocus={autoFocus}
        />
      </div>
    </div>
  );
}

export default function FirstAccessPage() {
  const { perfil, recarregar, sair } = useAuth();
  const [atual, setAtual] = useState('');
  const [nova, setNova] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setErro(null);
    if (!atual) return setErro('Informe a senha temporária.');
    const problema = validatePassword(nova);
    if (problema) return setErro(problema);
    if (nova !== confirmacao) return setErro('A confirmação não confere com a nova senha.');
    if (nova === atual) return setErro('A nova senha precisa ser diferente da atual.');

    setEnviando(true);
    try {
      await callFunction('change-own-password', { senha_atual: atual, nova_senha: nova });
      await supabase.auth.refreshSession();
      await recarregar();
    } catch (err) {
      setErro(functionErrorMessage(err));
      setEnviando(false);
    }
  };

  return (
    <AuthLayout>
      <h2 className="mt-3 text-3xl font-bold">Defina sua senha</h2>
      <p className="mt-1 text-sm text-white/60">
        Olá{perfil ? `, ${perfil.name.split(' ')[0]}` : ''}. Troque a senha temporária para continuar.
      </p>

      <form onSubmit={submit} className="mt-7 space-y-4" noValidate>
        <CampoSenha id="pa-atual" label="Senha temporária" value={atual} onChange={setAtual} autoComplete="current-password" autoFocus />
        <div>
          <CampoSenha id="pa-nova" label="Nova senha" value={nova} onChange={setNova} autoComplete="new-password" />
          <PasswordChecklist value={nova} dark />
        </div>
        <CampoSenha id="pa-confirmacao" label="Confirme a nova senha" value={confirmacao} onChange={setConfirmacao} autoComplete="new-password" />
        <p className="text-xs text-white/50">{PASSWORD_RULE_TEXT}</p>

        {erro && (
          <p role="alert" className="text-sm font-medium text-red-300">
            {erro}
          </p>
        )}

        <button
          type="submit"
          disabled={enviando}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand text-sm font-bold text-brand-foreground shadow-brand transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {enviando && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
          {enviando ? 'Salvando...' : 'Salvar nova senha'}
        </button>
        <button type="button" onClick={() => void sair()} className="w-full text-center text-sm text-white/60 hover:text-brand">
          Sair
        </button>
      </form>
    </AuthLayout>
  );
}
