import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Copy, Loader2, QrCode } from 'lucide-react';
import { NOME_PORTAL } from '@/config/portal';
import { callFunction } from '@/lib/functions';
import { supabase } from '@/lib/supabase';
import { useAuth } from './AuthProvider';

interface Inscricao {
  factorId: string;
  qrCode: string;
  secret: string;
}

/** Cadastro de um fator TOTP: QR, segredo para digitar à mão e confirmação com código. */
export function MfaEnroll({ dark = false, onDone, onCancel }: { dark?: boolean; onDone?: () => void; onCancel?: () => void }) {
  const { fatores, recarregar } = useAuth();
  const [inscricao, setInscricao] = useState<Inscricao | null>(null);
  const [codigo, setCodigo] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const iniciado = useRef(false);

  useEffect(() => {
    if (iniciado.current) return;
    iniciado.current = true;
    (async () => {
      // Remove fatores não verificados abandonados antes de criar um novo.
      for (const fator of fatores.filter((f) => f.status !== 'verified')) {
        await supabase.auth.mfa.unenroll({ factorId: fator.id });
      }
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: `${NOME_PORTAL} ${new Date().toLocaleString('pt-BR')}`,
        issuer: NOME_PORTAL,
      });
      setCarregando(false);
      if (error || !data) {
        setErro('Não foi possível iniciar o cadastro. Tente novamente.');
        return;
      }
      setInscricao({ factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret });
    })();
  }, [fatores]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!inscricao || codigo.length !== 6) return;
    setEnviando(true);
    setErro(null);
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: inscricao.factorId, code: codigo });
    if (error) {
      setEnviando(false);
      setCodigo('');
      setErro('Código inválido.');
      return;
    }
    void callFunction('mfa-events', { evento: 'MFA_ATIVADO' }).catch(() => undefined);
    await recarregar();
    setEnviando(false);
    onDone?.();
  };

  const copiar = async () => {
    if (!inscricao) return;
    try {
      await navigator.clipboard.writeText(inscricao.secret);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setCopiado(false);
    }
  };

  const texto = dark ? 'text-white/70' : 'text-muted-foreground';
  const campo = dark
    ? 'h-12 w-full rounded-xl border border-white/[0.12] bg-white/5 px-4 text-center font-mono text-lg tracking-[0.5em] text-white focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30'
    : 'field text-center font-mono text-lg tracking-[0.5em]';

  if (carregando) {
    return (
      <div className={`flex items-center gap-2 py-8 text-sm ${texto}`}>
        <Loader2 size={16} className="animate-spin" aria-hidden="true" /> Preparando o cadastro...
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {inscricao ? (
        <>
          <ol className={`list-decimal space-y-1 pl-5 text-sm ${texto}`}>
            <li>Abra o aplicativo autenticador (Google Authenticator, Microsoft Authenticator ou similar).</li>
            <li>Leia o QR code ou digite o código abaixo.</li>
            <li>Confirme com o código de 6 dígitos gerado.</li>
          </ol>
          <div className="flex justify-center">
            <div className="rounded-2xl bg-white p-3">
              <img src={inscricao.qrCode} alt="QR code para o aplicativo autenticador" className="h-44 w-44" />
            </div>
          </div>
          <div className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 ${dark ? 'border-white/10 bg-white/5' : 'border-border bg-muted'}`}>
            <code className={`break-all font-mono text-xs ${dark ? 'text-white/85' : 'text-foreground'}`}>{inscricao.secret}</code>
            <button type="button" onClick={copiar} className={`flex shrink-0 items-center gap-1 text-xs font-semibold ${dark ? 'text-brand' : 'text-brand-strong'}`}>
              <Copy size={14} aria-hidden="true" /> {copiado ? 'Copiado' : 'Copiar'}
            </button>
          </div>
          <div>
            <label htmlFor="mfa-enroll-codigo" className={`mb-1.5 block text-sm font-medium ${dark ? 'text-white/80' : 'text-foreground'}`}>
              Código de 6 dígitos
            </label>
            <input
              id="mfa-enroll-codigo"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              className={campo}
            />
          </div>
        </>
      ) : (
        <div className={`flex items-center gap-2 text-sm ${texto}`}>
          <QrCode size={16} aria-hidden="true" /> Cadastro indisponível no momento.
        </div>
      )}

      {erro && (
        <p role="alert" className={`text-sm font-medium ${dark ? 'text-red-300' : 'text-destructive'}`}>
          {erro}
        </p>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        {onCancel && (
          <button type="button" onClick={onCancel} className={`h-11 rounded-xl px-4 text-sm font-semibold ${dark ? 'text-white/70 hover:text-white' : 'border border-border text-foreground hover:bg-muted'}`}>
            Cancelar
          </button>
        )}
        <button
          type="submit"
          disabled={!inscricao || enviando || codigo.length !== 6}
          className="flex h-11 items-center justify-center gap-2 rounded-xl bg-brand px-5 text-sm font-bold text-brand-foreground shadow-brand transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {enviando && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
          Ativar autenticador
        </button>
      </div>
    </form>
  );
}
