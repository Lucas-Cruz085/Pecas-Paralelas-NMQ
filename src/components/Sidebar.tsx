import { useRef } from 'react';
import {
  Search,
  PackagePlus,
  Settings,
  HelpCircle,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';

interface SidebarProps {
  activeView: string;
  onNavigate: (view: string) => void;
  expanded: boolean;
  pinned: boolean;
  onExpandChange: (expanded: boolean) => void;
  onPinnedChange: (pinned: boolean) => void;
}

const menuItems = [
  { id: 'catalog', label: 'Catálogo de Peças', icon: Search },
  { id: 'register', label: 'Cadastro de Peças', icon: PackagePlus },
];

const bottomItems = [
  { id: 'settings', label: 'Configurações', icon: Settings },
  { id: 'help', label: 'Ajuda', icon: HelpCircle },
];

export default function Sidebar({
  activeView,
  onNavigate,
  expanded,
  pinned,
  onExpandChange,
  onPinnedChange,
}: SidebarProps) {
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMouseEnter = () => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
    onExpandChange(true);
  };

  const handleMouseLeave = () => {
    if (pinned) return;
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => onExpandChange(false), 250);
  };

  const togglePin = () => {
    const newPinned = !pinned;
    onPinnedChange(newPinned);
    if (newPinned) onExpandChange(true);
  };

  const width = expanded ? 'w-64' : 'w-16';

  return (
    <aside
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={`${width} fixed left-0 top-0 z-50 h-screen bg-slate-900 border-r border-slate-700/60 transition-all duration-300 ease-in-out flex flex-col`}
    >
      {/* Header / Logo */}
      <div className="flex items-center gap-3 h-16 px-4 border-b border-slate-700/50 overflow-hidden">
        <div className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-lg bg-blue-600 text-white font-bold text-sm">
          PP
        </div>
        <span
          className={`text-white font-semibold text-sm whitespace-nowrap transition-opacity duration-200 ${
            expanded ? 'opacity-100' : 'opacity-0'
          }`}
        >
          Peças Paralelas
        </span>
      </div>

      {/* Pin toggle */}
      <div className="flex justify-center py-2 border-b border-slate-700/40">
        <button
          onClick={togglePin}
          className={`flex items-center gap-2 text-xs text-slate-400 hover:text-white transition-colors px-2 py-1 rounded w-full ${
            expanded ? 'justify-between' : 'justify-center'
          }`}
          title={pinned ? 'Desafixar menu' : 'Fixar menu'}
        >
          {expanded && (
            <span className="whitespace-nowrap">
              {pinned ? 'Menu fixo' : 'Auto-retrair'}
            </span>
          )}
          {pinned ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
        </button>
      </div>

      {/* Main menu */}
      <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-1">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              title={item.label}
              className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg transition-all duration-200 group ${
                isActive
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              } ${!expanded ? 'justify-center' : ''}`}
            >
              <Icon
                size={20}
                className={`flex-shrink-0 transition-transform duration-200 group-hover:scale-110 ${
                  isActive ? 'text-white' : 'text-slate-400 group-hover:text-white'
                }`}
              />
              <span
                className={`text-sm font-medium whitespace-nowrap transition-opacity duration-200 ${
                  expanded ? 'opacity-100' : 'opacity-0 w-0 overflow-hidden'
                }`}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </nav>

      {/* Bottom menu */}
      <div className="py-4 px-2 space-y-1 border-t border-slate-700/50">
        {bottomItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              title={item.label}
              className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg transition-all duration-200 group ${
                isActive
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              } ${!expanded ? 'justify-center' : ''}`}
            >
              <Icon
                size={20}
                className={`flex-shrink-0 transition-transform duration-200 group-hover:scale-110 ${
                  isActive ? 'text-white' : 'text-slate-400 group-hover:text-white'
                }`}
              />
              <span
                className={`text-sm font-medium whitespace-nowrap transition-opacity duration-200 ${
                  expanded ? 'opacity-100' : 'opacity-0 w-0 overflow-hidden'
                }`}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
