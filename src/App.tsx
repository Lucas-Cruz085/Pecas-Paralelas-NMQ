import { useState } from 'react';
import { Bell } from 'lucide-react';
import Sidebar from '@/components/Sidebar';
import CatalogView from '@/components/CatalogView';
import RegisterView from '@/components/RegisterView';
import PartDetailModal from '@/components/PartDetailModal';
import SetupNotice from '@/components/SetupNotice';
import { isSupabaseConfigured, type Part } from '@/lib/supabase';

const viewTitles: Record<string, string> = {
  catalog: 'Catálogo de Peças',
  register: 'Cadastro de Peças',
  settings: 'Configurações',
  help: 'Ajuda',
};

const placeholderViews: Record<string, { title: string; description: string }> = {
  settings: { title: 'Configurações', description: 'Configurações do portal.' },
  help: { title: 'Ajuda', description: 'Suporte e documentação.' },
};

function App() {
  const [activeView, setActiveView] = useState('catalog');
  const [selectedPart, setSelectedPart] = useState<Part | null>(null);
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [sidebarPinned, setSidebarPinned] = useState(false);
  const [catalogRefreshKey, setCatalogRefreshKey] = useState(0);

  const contentPadding = sidebarPinned && sidebarExpanded ? 'pl-64' : 'pl-16';

  const handlePartUpdated = (updated: Part) => {
    setSelectedPart(updated);
    setCatalogRefreshKey((key) => key + 1);
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar
        activeView={activeView}
        onNavigate={setActiveView}
        expanded={sidebarExpanded}
        pinned={sidebarPinned}
        onExpandChange={setSidebarExpanded}
        onPinnedChange={setSidebarPinned}
      />

      {/* Main content — padding adjusts when sidebar is pinned */}
      <div className={`transition-all duration-300 ease-in-out ${contentPadding}`}>
        {/* Top bar */}
        <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-slate-200 h-16 flex items-center justify-between px-6">
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <span className="text-slate-300">Portal</span>
            <span className="text-slate-300">/</span>
            <span className="text-slate-600 font-medium">
              {viewTitles[activeView] || ''}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <button className="relative text-slate-400 hover:text-slate-600 transition-colors">
              <Bell size={20} />
              <span className="absolute top-0 right-0 w-2 h-2 bg-blue-500 rounded-full"></span>
            </button>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center text-white text-xs font-bold">
                CL
              </div>
              <span className="text-sm font-medium text-slate-600 hidden sm:block">
                Colaborador
              </span>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main>
          {!isSupabaseConfigured && !placeholderViews[activeView] && <SetupNotice />}
          {isSupabaseConfigured && activeView === 'catalog' && (
            <CatalogView onSelectPart={setSelectedPart} refreshKey={catalogRefreshKey} />
          )}
          {isSupabaseConfigured && activeView === 'register' && (
            <RegisterView onRegistered={() => setCatalogRefreshKey((key) => key + 1)} />
          )}
          {placeholderViews[activeView] && (
            <div className="p-6 lg:p-8 max-w-3xl mx-auto">
              <h1 className="text-2xl font-bold text-slate-800 mb-1">
                {placeholderViews[activeView].title}
              </h1>
              <p className="text-slate-500 text-sm">
                {placeholderViews[activeView].description}
              </p>
            </div>
          )}
        </main>
      </div>

      {/* Part detail modal */}
      {selectedPart && (
        <PartDetailModal
          key={selectedPart.id}
          part={selectedPart}
          onClose={() => setSelectedPart(null)}
          onPartUpdated={handlePartUpdated}
        />
      )}
    </div>
  );
}

export default App;
