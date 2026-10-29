import { DatabaseZap } from 'lucide-react';

export default function SetupNotice() {
  return (
    <div className="p-6 lg:p-8 max-w-3xl mx-auto">
      <div className="bg-white border border-amber-200 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
            <DatabaseZap size={22} className="text-amber-600" />
          </div>
          <h1 className="text-xl font-bold text-slate-800">Banco de dados não configurado</h1>
        </div>
        <p className="text-sm text-slate-600 mb-4">
          O portal precisa de um projeto Supabase para consultar e cadastrar peças. Siga os passos
          abaixo e reinicie o servidor de desenvolvimento.
        </p>
        <ol className="list-decimal list-inside space-y-2 text-sm text-slate-600">
          <li>
            Crie um projeto em{' '}
            <a
              href="https://supabase.com/dashboard"
              target="_blank"
              rel="noreferrer"
              className="text-blue-600 hover:underline"
            >
              supabase.com
            </a>
            .
          </li>
          <li>
            Execute no SQL Editor os scripts da pasta{' '}
            <code className="px-1.5 py-0.5 rounded bg-slate-100 font-mono text-xs">supabase/migrations</code>{' '}
            (em ordem).
          </li>
          <li>
            Copie <code className="px-1.5 py-0.5 rounded bg-slate-100 font-mono text-xs">.env.example</code>{' '}
            para <code className="px-1.5 py-0.5 rounded bg-slate-100 font-mono text-xs">.env</code> e preencha{' '}
            <code className="px-1.5 py-0.5 rounded bg-slate-100 font-mono text-xs">VITE_SUPABASE_URL</code> e{' '}
            <code className="px-1.5 py-0.5 rounded bg-slate-100 font-mono text-xs">VITE_SUPABASE_ANON_KEY</code>.
          </li>
          <li>
            Rode novamente <code className="px-1.5 py-0.5 rounded bg-slate-100 font-mono text-xs">npm run dev</code>.
          </li>
        </ol>
      </div>
    </div>
  );
}
