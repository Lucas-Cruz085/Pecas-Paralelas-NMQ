import { DatabaseZap } from 'lucide-react';

const code = 'px-1.5 py-0.5 rounded bg-muted font-mono text-xs';

export default function SetupNotice() {
  return (
    <div className="min-h-screen bg-background p-6 lg:p-8">
      <div className="card-surface mx-auto max-w-3xl border-warning/30 p-6">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-warning/15">
            <DatabaseZap size={22} className="text-warning" aria-hidden="true" />
          </div>
          <h1 className="text-xl font-bold text-foreground">Banco de dados não configurado</h1>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          O portal precisa de um projeto Supabase. Siga os passos abaixo e reinicie o servidor de desenvolvimento.
        </p>
        <ol className="list-inside list-decimal space-y-2 text-sm text-muted-foreground">
          <li>
            Execute os scripts da pasta <code className={code}>supabase/migrations</code> (em ordem).
          </li>
          <li>
            Copie <code className={code}>.env.example</code> para <code className={code}>.env</code> e preencha{' '}
            <code className={code}>VITE_SUPABASE_URL</code> e <code className={code}>VITE_SUPABASE_ANON_KEY</code>.
          </li>
          <li>
            Rode novamente <code className={code}>npm run dev</code>.
          </li>
        </ol>
      </div>
    </div>
  );
}
