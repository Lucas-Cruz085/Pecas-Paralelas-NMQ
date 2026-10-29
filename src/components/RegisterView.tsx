import { useState, useRef, useCallback, useEffect } from 'react';
import {
  PackagePlus,
  Upload,
  X,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Image as ImageIcon,
} from 'lucide-react';
import { supabase, getErrorMessage, uploadPartPhoto, validatePhoto } from '@/lib/supabase';

interface RegisterViewProps {
  onRegistered: () => void;
}

export default function RegisterView({ onRegistered }: RegisterViewProps) {
  const [partNumber, setPartNumber] = useState('');
  const [description, setDescription] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (photoPreview) URL.revokeObjectURL(photoPreview);
    };
  }, [photoPreview]);

  const handlePhotoSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validationError = validatePhoto(file);
    if (validationError) {
      setError(validationError);
      e.target.value = '';
      return;
    }

    setError(null);
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  }, []);

  const handleRemovePhoto = () => {
    setPhotoFile(null);
    setPhotoPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const normalizedPartNumber = partNumber.trim().toUpperCase();
    if (!normalizedPartNumber || !description.trim()) {
      setError('Part number e descrição são obrigatórios.');
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      const photoUrl = photoFile ? await uploadPartPhoto(photoFile, normalizedPartNumber) : null;

      const { error: insertError } = await supabase.from('parts').insert({
        part_number: normalizedPartNumber,
        description: description.trim(),
        photo_url: photoUrl,
      });

      if (insertError) throw insertError;

      setSuccess(true);
      setPartNumber('');
      setDescription('');
      handleRemovePhoto();
      onRegistered();
    } catch (err) {
      setError(getErrorMessage(err, 'Erro ao cadastrar peça.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 lg:p-8 max-w-3xl mx-auto">
      {/* Page title */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
            <PackagePlus size={24} className="text-blue-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800">Cadastro de Peças</h1>
        </div>
        <p className="text-slate-500 text-sm">
          Cadastre uma nova peça paralela no catálogo informando o part number, descrição e foto do item.
        </p>
      </div>

      {/* Success banner */}
      {success && (
        <div className="mb-6 flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-3 animate-fadeIn">
          <CheckCircle2 size={20} className="text-green-600 flex-shrink-0" />
          <p className="text-sm text-green-700 font-medium">
            Peça cadastrada com sucesso! Você pode cadastrar outra peça ou pesquisar no catálogo.
          </p>
          <button
            onClick={() => setSuccess(false)}
            className="ml-auto text-green-600 hover:text-green-700"
          >
            <X size={18} />
          </button>
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="mb-6 flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3 animate-fadeIn">
          <AlertCircle size={20} className="text-red-600 flex-shrink-0" />
          <p className="text-sm text-red-700 font-medium">{error}</p>
          <button
            onClick={() => setError(null)}
            className="ml-auto text-red-600 hover:text-red-700"
          >
            <X size={18} />
          </button>
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-2xl p-6 space-y-6 shadow-sm">
        {/* Part Number */}
        <div>
          <label htmlFor="partNumber" className="block text-sm font-semibold text-slate-700 mb-2">
            Part Number <span className="text-red-500">*</span>
          </label>
          <input
            id="partNumber"
            type="text"
            value={partNumber}
            onChange={(e) => setPartNumber(e.target.value)}
            placeholder="Ex: PAR-OF001"
            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all font-mono"
          />
          <p className="text-xs text-slate-400 mt-1.5">
            Código único de identificação da peça paralela.
          </p>
        </div>

        {/* Description */}
        <div>
          <label htmlFor="description" className="block text-sm font-semibold text-slate-700 mb-2">
            Descrição <span className="text-red-500">*</span>
          </label>
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Ex: Filtro de óleo motor 2.0 16V"
            rows={3}
            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all resize-none"
          />
          <p className="text-xs text-slate-400 mt-1.5">
            Descrição que aparecerá na pesquisa do catálogo.
          </p>
        </div>

        {/* Photo Upload */}
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-2">
            Foto do Item
          </label>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handlePhotoSelect}
            className="hidden"
          />

          {!photoPreview ? (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full border-2 border-dashed border-slate-300 rounded-xl p-8 flex flex-col items-center justify-center gap-3 hover:border-blue-400 hover:bg-blue-50/50 transition-all group"
            >
              <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center group-hover:bg-blue-100 transition-colors">
                <Upload size={24} className="text-slate-400 group-hover:text-blue-500 transition-colors" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-slate-600">
                  Clique para selecionar uma foto
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  PNG, JPG até 5 MB
                </p>
              </div>
            </button>
          ) : (
            <div className="relative rounded-xl overflow-hidden border border-slate-200 bg-slate-50">
              <img
                src={photoPreview}
                alt="Pré-visualização da peça"
                className="w-full h-56 object-contain"
              />
              <button
                type="button"
                onClick={handleRemovePhoto}
                className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80 transition-colors"
              >
                <X size={18} />
              </button>
              <div className="absolute bottom-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/60 text-white text-xs">
                <ImageIcon size={12} />
                {photoFile?.name}
              </div>
            </div>
          )}
        </div>

        {/* Submit */}
        <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={() => {
              setPartNumber('');
              setDescription('');
              handleRemovePhoto();
              setError(null);
              setSuccess(false);
            }}
            className="px-5 py-2.5 text-slate-600 font-medium rounded-xl hover:bg-slate-100 transition-colors"
          >
            Limpar
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 transition-colors shadow-md shadow-blue-600/20 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {saving ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                Salvando...
              </>
            ) : (
              <>
                <PackagePlus size={18} />
                Cadastrar Peça
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
