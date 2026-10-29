import { ShieldHalf } from 'lucide-react';
import { Badge, Card } from '@/components/ui';
import { CARDS_LGPD, PEDIDO_TITULAR } from './lgpdContent';

export default function LgpdPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-brand text-brand-foreground shadow-brand">
          <ShieldHalf size={26} aria-hidden="true" />
        </span>
        <div>
          <div className="flex items-center gap-2">
            <span className="section-label">Privacidade</span>
            <Badge tone="warning">Rascunho</Badge>
          </div>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-foreground">Proteção de dados pessoais</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Rascunho operacional sobre como o portal trata dados pessoais. Não substitui a política de privacidade definitiva, que depende de revisão jurídica.
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {CARDS_LGPD.map((card) => (
          <Card key={card.rotulo} className="p-6">
            <p className="section-label">{card.rotulo}</p>
            <h2 className="mt-1 text-lg font-semibold text-foreground">{card.titulo}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{card.texto}</p>
          </Card>
        ))}
      </div>

      <Card className="mt-4 border-brand/50 p-6">
        <p className="section-label">{PEDIDO_TITULAR.rotulo}</p>
        <h2 className="mt-1 text-lg font-semibold text-foreground">{PEDIDO_TITULAR.titulo}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{PEDIDO_TITULAR.texto}</p>
      </Card>
    </div>
  );
}
