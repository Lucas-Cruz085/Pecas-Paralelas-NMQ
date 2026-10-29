import { useAuth } from './AuthProvider';
import { AuthLayout } from './AuthLayout';
import { MfaEnroll } from './MfaEnroll';

export default function MfaEnrollPage() {
  const { sair } = useAuth();
  return (
    <AuthLayout>
      <h2 className="mt-3 text-3xl font-bold">Ative a verificação em duas etapas</h2>
      <p className="mb-6 mt-1 text-sm text-white/60">Para o seu perfil, o código do aplicativo autenticador é obrigatório.</p>
      <MfaEnroll dark />
      <button type="button" onClick={() => void sair()} className="mt-4 w-full text-center text-sm text-white/60 hover:text-brand">
        Sair
      </button>
    </AuthLayout>
  );
}
