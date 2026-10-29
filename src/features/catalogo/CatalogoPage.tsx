import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import CatalogView from '@/components/CatalogView';
import PartDetailModal from '@/components/PartDetailModal';
import type { Part } from '@/lib/supabase';

export default function CatalogoPage() {
  const navigate = useNavigate();
  const [selecionada, setSelecionada] = useState<Part | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const atualizar = () => setRefreshKey((key) => key + 1);

  return (
    <>
      <CatalogView onSelectPart={setSelecionada} onGoToImport={() => navigate('/importar')} refreshKey={refreshKey} />
      {selecionada && (
        <PartDetailModal
          key={selecionada.id}
          part={selecionada}
          onClose={() => setSelecionada(null)}
          onPartUpdated={(peca) => {
            setSelecionada(peca);
            atualizar();
          }}
          onPartDeleted={() => {
            setSelecionada(null);
            atualizar();
          }}
        />
      )}
    </>
  );
}
