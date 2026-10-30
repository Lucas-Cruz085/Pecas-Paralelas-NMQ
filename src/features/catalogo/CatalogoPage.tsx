import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import CatalogView from '@/components/CatalogView';
import PartDetailModal from '@/components/PartDetailModal';
import type { Part } from '@/lib/supabase';
import { podeEditarCatalogo } from '@/config/portal';
import { useAuth } from '@/features/auth/AuthProvider';

export default function CatalogoPage() {
  const navigate = useNavigate();
  const { papel } = useAuth();
  const podeEditar = podeEditarCatalogo(papel);
  const [selecionada, setSelecionada] = useState<Part | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const atualizar = () => setRefreshKey((key) => key + 1);

  return (
    <>
      <CatalogView
        onSelectPart={setSelecionada}
        onGoToImport={podeEditar ? () => navigate('/importar') : undefined}
        refreshKey={refreshKey}
      />
      {selecionada && (
        <PartDetailModal
          key={selecionada.id}
          part={selecionada}
          readOnly={!podeEditar}
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
