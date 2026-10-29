import { useState, type FormEvent } from 'react';
import { Eye, EyeOff, Loader2, Lock, User } from 'lucide-react';
import { useAuth } from './AuthProvider';
import { AuthLayout, authInputClass, authInputStyle } from './AuthLayout';
import { entrar, mensagemDeLogin, pedirTrocaDeSenha } from './adapter';
import { TURNSTILE_SITE_KEY, Turnstile } from './Turnstile';

export default function LoginPage() {
  const { aviso, limparAviso } = useAuth();
  const [usuario, setUsuario] = useState('');
  const [senha, setSenha] = useState('');
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [entrando, setEntrando] = useState(false);
  const [pedindo, setPedindo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);
  const [captchaVisivel, setCaptchaVisivel] = useState(false);
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [captchaKey, setCaptchaKey] = useState(0);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (entrando) return;
    limparAviso();
    setErro(null);
    setSucesso(null);
    if (!usuario.trim() || !senha) {
      setErro('Usuário ou senha inválidos.');
      return;
    }
    setEntrando(true);
    try {
      await entrar(usuario, senha, captcha ?? undefined);
    } catch (err) {
      const { mensagem, captcha: precisaCaptcha } = mensagemDeLogin(err);
      setErro(mensagem);
      setSenha('');
      if (precisaCaptcha && TURNSTILE_SITE_KEY) {
        setCaptchaVisivel(true);
        setCaptcha(null);
        setCaptchaKey((k) => k + 1);
      }
      setEntrando(false);
    }
  };

  const esqueciSenha = async () => {
    limparAviso();
    setErro(null);
    setSucesso(null);
    if (!usuario.trim()) {
      setErro('Informe o usuário para solicitar a troca de senha.');
      return;
    }
    setPedindo(true);
    try {
      setSucesso(await pedirTrocaDeSenha(usuario));
    } catch (err) {
      setErro(mensagemDeLogin(err).mensagem);
    } finally {
      setPedindo(false);
    }
  };

  const mensagemErro = erro ?? aviso;

  return (
    <AuthLayout>
      <h2 className="mt-3 text-3xl font-bold">Entrar</h2>
      <p className="mt-1 text-sm text-white/60">Use o usuário corporativo e a senha da sua conta.</p>

      <form onSubmit={submit} className="mt-7 space-y-4" noValidate>
        <div>
          <label htmlFor="login-usuario" className="mb-1.5 block text-sm font-medium text-white/80">
            Usuário
          </label>
          <div className="relative">
            <User size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/40" aria-hidden="true" />
            <input
              id="login-usuario"
              value={usuario}
              onChange={(e) => setUsuario(e.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="nome.sobrenome"
              className={authInputClass}
              style={authInputStyle}
              autoFocus
            />
          </div>
        </div>

        <div>
          <label htmlFor="login-senha" className="mb-1.5 block text-sm font-medium text-white/80">
            Senha
          </label>
          <div className="relative">
            <Lock size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/40" aria-hidden="true" />
            <input
              id="login-senha"
              type={mostrarSenha ? 'text' : 'password'}
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              autoComplete="current-password"
              className={authInputClass}
              style={authInputStyle}
            />
            <button
              type="button"
              onClick={() => setMostrarSenha((v) => !v)}
              aria-label={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-white/50 hover:text-white"
            >
              {mostrarSenha ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
            </button>
          </div>
        </div>

        {captchaVisivel && <Turnstile key={captchaKey} onToken={setCaptcha} />}

        {mensagemErro && (
          <p role="alert" className="text-sm font-medium text-red-300">
            {mensagemErro}
          </p>
        )}
        {sucesso && (
          <p role="status" className="text-sm text-white/80">
            {sucesso}
          </p>
        )}

        <button
          type="submit"
          disabled={entrando || (captchaVisivel && !captcha)}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand text-sm font-bold text-brand-foreground shadow-brand transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {entrando && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
          {entrando ? 'Entrando...' : 'Entrar'}
        </button>

        <div className="text-center">
          <button
            type="button"
            onClick={esqueciSenha}
            disabled={pedindo}
            className="inline-flex items-center gap-2 text-sm text-white/60 underline-offset-4 hover:text-brand hover:underline disabled:opacity-60"
          >
            {pedindo && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
            Esqueci minha senha
          </button>
        </div>
      </form>
    </AuthLayout>
  );
}
