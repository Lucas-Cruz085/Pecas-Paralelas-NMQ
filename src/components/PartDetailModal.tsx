import { useState, useRef, useEffect } from 'react';
import {
  X,
  Tag,
  Package,
  DollarSign,
  Clipboard,
  Hash,
  Image as ImageIcon,
  Plus,
  Loader2,
  AlertCircle,
  type LucideIcon,
} from 'lucide-react';
import {
  supabase,
  getErrorMessage,
  uploadPartPhoto,
  validatePhoto,
  type Part,
} from '@/lib/supabase';
import { formatCurrency } from '@/lib/format';

interface PartDetailModalProps {
  part: Part;
  onClose: () => void;
  onPartUpdated?: (updated: Part) => void;
}

export default function PartDetailModal({ part, onClose, onPartUpdated }: PartDetailModalProps) {
  const [currentPhotoUrl, setCurrentPhotoUrl] = useState<string | null>(part.photo_url);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const inStock = part.stock_quantity > 0;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validationError = validatePhoto(file);
    if (validationError) {
      setUploadError(validationError);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setUploading(true);
    setUploadError(null);
    try {
      const photoUrl = await uploadPartPhoto(file, part.part_number);

      const { error: updateError } = await supabase
        .from('parts')
        .update({ photo_url: photoUrl })
        .eq('id', part.id);
      if (updateError) throw updateError;

      setCurrentPhotoUrl(photoUrl);
      onPartUpdated?.({ ...part, photo_url: photoUrl });
    } catch (err) {
      setUploadError(getErrorMessage(err, 'Não foi possível enviar a foto.'));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden animate-slideUp max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="part-detail-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-900 text-white">
          <div className="flex items-center gap-3">
            <Package size={24} />
            <h2 id="part-detail-title" className="text-lg font-semibold">Detalhes da Peça</h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors"
            aria-label="Fechar"
          >
            <X size={22} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {/* Photo */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handlePhotoUpload}
            className="hidden"
          />
          {currentPhotoUrl ? (
            <div className="relative w-full h-48 rounded-xl overflow-hidden bg-slate-100 flex items-center justify-center">
              <img src={currentPhotoUrl} alt={part.description} className="w-full h-full object-contain" />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="absolute bottom-3 right-3 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/60 text-white text-xs hover:bg-black/80 transition-colors disabled:opacity-60"
              >
                {uploading ? <Loader2 size={14} className="animate-spin" /> : <ImageIcon size={14} />}
                {uploading ? 'Enviando...' : 'Trocar foto'}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="w-full h-32 rounded-xl bg-slate-100 border-2 border-dashed border-slate-200 flex flex-col items-center justify-center gap-2 text-slate-400 hover:border-blue-300 hover:text-blue-500 transition-colors disabled:opacity-60"
            >
              {uploading ? <Loader2 size={28} className="animate-spin" /> : <Plus size={28} />}
              <span className="text-xs">
                {uploading ? 'Enviando foto...' : 'Sem foto cadastrada — clique para adicionar'}
              </span>
            </button>
          )}

          {uploadError && (
            <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <AlertCircle size={16} className="flex-shrink-0" />
              {uploadError}
            </div>
          )}

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-sm font-semibold">
              <Hash size={14} />
              {part.part_number}
            </span>
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold ${
                inStock
                  ? 'bg-green-50 text-green-700'
                  : 'bg-red-50 text-red-700'
              }`}
            >
              {inStock ? 'Em estoque' : 'Sem estoque'}
            </span>
          </div>

          <div>
            <h3 className="text-xl font-bold text-slate-800">{part.description}</h3>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <InfoField icon={Tag} label="Marca" value={part.brand || '—'} />
            <InfoField icon={Clipboard} label="Categoria" value={part.category || '—'} />
            <InfoField icon={Hash} label="Referência OEM" value={part.oem_reference || '—'} />
            <InfoField icon={Package} label="Estoque" value={`${part.stock_quantity} un`} />
          </div>

          <div>
            <p className="text-sm text-slate-500 font-medium mb-1">Especificações Técnicas</p>
            <p className="text-slate-700 bg-slate-50 rounded-lg p-3 text-sm">
              {part.specifications || 'Sem especificações cadastradas.'}
            </p>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-slate-100">
            <div className="flex items-center gap-2">
              <DollarSign size={20} className="text-slate-400" />
              <div>
                <p className="text-xs text-slate-500">Preço Unitário</p>
                <p className="text-2xl font-bold text-slate-800">{formatCurrency(part.unit_price)}</p>
              </div>
            </div>
            <button className="px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors shadow-md shadow-blue-600/20">
              Solicitar Peça
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoField({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <Icon size={18} className="text-slate-400 mt-0.5 flex-shrink-0" />
      <div>
        <p className="text-xs text-slate-500">{label}</p>
        <p className="text-sm font-medium text-slate-800">{value}</p>
      </div>
    </div>
  );
}
