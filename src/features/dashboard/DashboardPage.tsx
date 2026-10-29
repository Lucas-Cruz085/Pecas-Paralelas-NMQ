import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Camera, CameraOff, FileUp, Package, PackagePlus, Search } from 'lucide-react';
import { Card, CardIndicador, PageHeader } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { supabase } from '@/lib/supabase';

interface Indicadores {
  total: number;
  comFoto: number;
}

export default function DashboardPage() {
  const { perfil } = useAuth();
  const [dados, setDados] = useState<Indicadores | null>(null);

  useEffect(() => {
    let ativo = true;
    (async () => {
      const [total, comFoto] = await Promise.all([
        supabase.from('parts').select('id', { count: 'exact', head: true }),
        supabase.from('parts').select('id', { count: 'exact', head: true }).not('photo_url', 'is', null),
      ]);
      if (ativo) setDados({ total: total.count ?? 0, comFoto: comFoto.count ?? 0 });
    })();
    return () => {
      ativo = false;
    };
  }, []);

  const primeiroNome = perfil?.name.split(' ')[0] ?? '';
  const formatar = (n: number | undefined) => (n === undefined ? '…' : n.toLocaleString('pt-BR'));

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title={`Olá, ${primeiroNome}`} subtitle="Resumo do catálogo de peças paralelas." />
      <div className="grid gap-4 sm:grid-cols-3">
        <CardIndicador label="Peças cadastradas" value={formatar(dados?.total)} icon={Package} tone="brand" />
        <CardIndicador label="Com foto" value={formatar(dados?.comFoto)} icon={Camera} tone="success" />
        <CardIndicador
          label="Sem foto"
          value={formatar(dados ? dados.total - dados.comFoto : undefined)}
          icon={CameraOff}
          tone="warning"
          hint="Use a importação de fotos para completar."
        />
      </div>

      <h2 className="section-label mb-3 mt-8">Atalhos</h2>
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { to: '/catalogo', icon: Search, title: 'Consultar catálogo', text: 'Busque por código, referência ou descrição.' },
          { to: '/cadastro', icon: PackagePlus, title: 'Cadastrar peça', text: 'Inclua uma peça com foto.' },
          { to: '/importar', icon: FileUp, title: 'Importar planilha e fotos', text: 'Atualize o catálogo em lote.' },
        ].map(({ to, icon: Icon, title, text }) => (
          <Link key={to} to={to} className="group">
            <Card className="h-full p-5 transition-colors group-hover:border-brand/60">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand/15 text-brand-strong">
                <Icon size={20} aria-hidden="true" />
              </span>
              <p className="mt-3 font-semibold text-foreground">{title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{text}</p>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
