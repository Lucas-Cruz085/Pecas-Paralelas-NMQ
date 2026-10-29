import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';

export default function NotFoundPage() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-20 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand/15 text-brand-strong">
        <Compass size={26} aria-hidden="true" />
      </span>
      <p className="section-label mt-6">Erro 404</p>
      <h1 className="mt-2 text-3xl font-bold text-foreground">Página não encontrada</h1>
      <p className="mt-2 text-sm text-muted-foreground">O endereço não existe ou foi movido.</p>
      <Link
        to="/"
        className="mt-6 inline-flex h-11 items-center rounded-xl bg-brand px-5 text-sm font-semibold text-brand-foreground shadow-brand hover:brightness-105"
      >
        Voltar ao início
      </Link>
    </div>
  );
}
