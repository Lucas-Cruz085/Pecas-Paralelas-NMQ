import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, FolderOpen, Images, Link2, Link2Off, Loader2, Trash2, X } from 'lucide-react';
import FileDropZone from '@/components/FileDropZone';
import { Banner } from '@/components/SpreadsheetImport';
import {
  supabase,
  deletePartPhoto,
  fetchAllParts,
  getErrorMessage,
  preparePhoto,
  uploadPartPhoto,
  validatePhoto,
} from '@/lib/supabase';
import { buildCodeIndex, codeFromFileName } from '@/lib/partCodes';

interface IndexedPart {
  id: string;
  part_number: string;
  alt_code: string;
  description: string;
  photo_url: string | null;
}

type ItemStatus = 'pending' | 'uploading' | 'done' | 'error';

interface ImageItem {
  id: string;
  file: File;
  previewUrl: string;
  code: string;
  part?: IndexedPart;
  status: ItemStatus;
  message?: string;
}

const UPLOAD_CONCURRENCY = 4;

async function runPool<T>(items: T[], limit: number, worker: (item: T) => Promise<void>) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) await worker(items[next++]);
    })
  );
}

function stripQuery(url: string | null) {
  return url?.split('?')[0] ?? null;
}

export default function ImageImport({ onImported }: { onImported: () => void }) {
  const [parts, setParts] = useState<IndexedPart[] | null>(null);
  const [items, setItems] = useState<ImageItem[]>([]);
  const [replaceExisting, setReplaceExisting] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ignoredFiles, setIgnoredFiles] = useState(0);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  useEffect(() => {
    fetchAllParts<IndexedPart>('id, part_number, alt_code, description, photo_url')
      .then(setParts)
      .catch((err) => setError(getErrorMessage(err, 'Não foi possível carregar o catálogo.')));
    return () => itemsRef.current.forEach((item) => URL.revokeObjectURL(item.previewUrl));
  }, []);

  const findPart = useMemo(() => buildCodeIndex(parts ?? []), [parts]);

  const addFiles = (files: File[]) => {
    const images = files.filter((f) => !validatePhoto(f));
    setIgnoredFiles(files.length - images.length);
    setItems((prev) => {
      const known = new Set(prev.map((i) => i.file.name));
      const added = images
        .filter((f) => !known.has(f.name))
        .map((file): ImageItem => {
          const code = codeFromFileName(file.name);
          return {
            id: `${file.name}-${file.size}-${file.lastModified}`,
            file,
            previewUrl: URL.createObjectURL(file),
            code,
            part: findPart(code),
            status: 'pending',
          };
        });
      return [...prev, ...added].sort((a, b) => Number(!!a.part) - Number(!!b.part) || a.code.localeCompare(b.code));
    });
  };

  const updateItem = (id: string, patch: Partial<ImageItem>) =>
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));

  const removeItem = (id: string) =>
    setItems((prev) => {
      const item = prev.find((i) => i.id === id);
      if (item) URL.revokeObjectURL(item.previewUrl);
      return prev.filter((i) => i.id !== id);
    });

  const clearAll = () => {
    items.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    setItems([]);
    setIgnoredFiles(0);
  };

  // Se duas imagens apontam para a mesma peça, só a primeira é enviada.
  const firstItemByPart = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of items) if (item.part && !map.has(item.part.id)) map.set(item.part.id, item.id);
    return map;
  }, [items]);

  const isUploadable = (item: ImageItem) =>
    !!item.part &&
    item.status !== 'done' &&
    firstItemByPart.get(item.part.id) === item.id &&
    (replaceExisting || !item.part.photo_url);

  const pending = items.filter(isUploadable);
  const matched = items.filter((i) => i.part).length;
  const done = items.filter((i) => i.status === 'done').length;

  const handleUpload = async () => {
    setUploading(true);
    setError(null);
    await runPool(pending, UPLOAD_CONCURRENCY, async (item) => {
      const part = item.part!;
      updateItem(item.id, { status: 'uploading', message: undefined });
      try {
        const photo = await preparePhoto(item.file);
        const photoUrl = await uploadPartPhoto(photo, part.part_number);
        const { error: updateError } = await supabase.from('parts').update({ photo_url: photoUrl }).eq('id', part.id);
        if (updateError) throw updateError;
        if (part.photo_url && stripQuery(part.photo_url) !== stripQuery(photoUrl)) {
          await deletePartPhoto(part.photo_url).catch(() => undefined);
        }
        const updatedPart = { ...part, photo_url: photoUrl };
        setParts((prev) => prev?.map((p) => (p.id === part.id ? updatedPart : p)) ?? prev);
        updateItem(item.id, { status: 'done', part: updatedPart });
      } catch (err) {
        updateItem(item.id, { status: 'error', message: getErrorMessage(err, 'Falha no envio.') });
      }
    });
    setUploading(false);
    onImported();
  };

  if (!parts && !error) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 size={32} className="text-brand-strong animate-spin mb-3" />
        <p className="text-muted-foreground text-sm">Carregando catálogo...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <Banner tone="error" onClose={() => setError(null)}>
          {error}
        </Banner>
      )}

      <FileDropZone
        accept="image/*"
        multiple
        disabled={uploading || !parts}
        title="Arraste as fotos aqui ou selecione os arquivos / a pasta"
        hint={'O nome do arquivo deve ser o código da peça. Ex.: 02-103611P.png → 02/103611P'}
        onFiles={addFiles}
      >
        <input
          ref={folderInputRef}
          type="file"
          multiple
          className="hidden"
          {...({ webkitdirectory: '' } as Record<string, string>)}
          onChange={(e) => {
            addFiles(Array.from(e.target.files ?? []));
            e.target.value = '';
          }}
        />
        <button
          type="button"
          disabled={uploading || !parts}
          onClick={() => folderInputRef.current?.click()}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-foreground/80 bg-muted rounded-lg hover:bg-muted/80 transition-colors disabled:cursor-not-allowed"
        >
          <FolderOpen size={16} />
          Selecionar pasta
        </button>
      </FileDropZone>

      {ignoredFiles > 0 && (
        <p className="text-xs text-muted-foreground -mt-3">
          {ignoredFiles} arquivo(s) ignorado(s) por não serem imagens válidas (até 20 MB).
        </p>
      )}

      {items.length > 0 && (
        <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
          <div className="flex flex-wrap items-center gap-3 px-5 py-4 border-b border-border">
            <Images size={22} className="text-brand-strong" />
            <p className="flex-1 text-sm text-foreground/80">
              <b className="text-foreground">{items.length}</b> imagem(ns) •{' '}
              <span className="text-success">{matched} vinculada(s)</span> •{' '}
              <span className="text-warning">{items.length - matched} sem correspondência</span>
              {done > 0 && <span className="text-brand-strong"> • {done} enviada(s)</span>}
            </p>
            <button
              onClick={clearAll}
              disabled={uploading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-foreground/80 rounded-lg hover:bg-muted transition-colors disabled:opacity-50"
            >
              <Trash2 size={14} />
              Limpar lista
            </button>
          </div>

          <datalist id="part-codes">
            {parts?.map((p) => (
              <option key={p.id} value={p.part_number}>
                {p.description}
              </option>
            ))}
          </datalist>

          <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-3 max-h-[560px] overflow-auto">
            {items.map((item) => (
              <ImageCard
                key={item.id}
                item={item}
                disabled={uploading}
                isDuplicate={!!item.part && firstItemByPart.get(item.part.id) !== item.id}
                willSkipExisting={!!item.part?.photo_url && !replaceExisting && item.status !== 'done'}
                onCodeChange={(code) => updateItem(item.id, { code, part: findPart(code), status: 'pending', message: undefined })}
                onRemove={() => removeItem(item.id)}
              />
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-4 px-5 py-4 border-t border-border bg-muted/60">
            <label className="flex items-center gap-2 text-sm text-foreground/80 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={replaceExisting}
                onChange={(e) => setReplaceExisting(e.target.checked)}
                disabled={uploading}
                className="w-4 h-4 rounded border-input text-brand-strong focus:ring-brand/40"
              />
              Substituir fotos já cadastradas
            </label>
            <button
              onClick={handleUpload}
              disabled={uploading || pending.length === 0}
              className="ml-auto flex items-center gap-2 px-6 py-2.5 bg-brand text-brand-foreground font-medium rounded-xl hover:brightness-105 transition-colors shadow-md shadow-brand/30 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {uploading ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Enviando...
                </>
              ) : (
                <>
                  <Link2 size={18} />
                  Enviar e vincular {pending.length} imagem(ns)
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ImageCard({
  item,
  disabled,
  isDuplicate,
  willSkipExisting,
  onCodeChange,
  onRemove,
}: {
  item: ImageItem;
  disabled: boolean;
  isDuplicate: boolean;
  willSkipExisting: boolean;
  onCodeChange: (code: string) => void;
  onRemove: () => void;
}) {
  const border =
    item.status === 'done'
      ? 'border-success/50 bg-success/5'
      : item.status === 'error'
        ? 'border-destructive/50 bg-destructive/5'
        : item.part
          ? 'border-border'
          : 'border-warning/50 bg-warning/5';

  return (
    <div className={`relative flex gap-3 border rounded-xl p-3 ${border}`}>
      <div className="flex-shrink-0 w-20 h-20 rounded-lg bg-card border border-border overflow-hidden">
        <img src={item.previewUrl} alt={item.file.name} className="w-full h-full object-contain" />
      </div>
      <div className="flex-1 min-w-0 space-y-1.5">
        <p className="text-xs text-muted-foreground truncate pr-6" title={item.file.name}>
          {item.file.name}
        </p>
        <input
          list="part-codes"
          value={item.code}
          disabled={disabled || item.status === 'done'}
          onChange={(e) => onCodeChange(e.target.value)}
          className="w-full px-2 py-1 text-sm font-mono bg-card border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-brand/40"
          aria-label="Código da peça"
        />
        {item.part ? (
          <p className="flex items-start gap-1 text-xs text-success">
            <Link2 size={12} className="flex-shrink-0 mt-0.5" />
            <span className="truncate" title={item.part.description}>
              <b className="font-mono">{item.part.part_number}</b> — {item.part.description}
            </span>
          </p>
        ) : (
          <p className="flex items-center gap-1 text-xs text-warning">
            <Link2Off size={12} />
            Sem correspondência — digite o código
          </p>
        )}
        {item.status === 'uploading' && (
          <p className="flex items-center gap-1 text-xs text-brand-strong">
            <Loader2 size={12} className="animate-spin" /> Enviando...
          </p>
        )}
        {item.status === 'done' && (
          <p className="flex items-center gap-1 text-xs text-success font-semibold">
            <CheckCircle2 size={12} /> Foto vinculada
          </p>
        )}
        {item.status === 'error' && <p className="text-xs text-destructive">{item.message}</p>}
        {item.status === 'pending' && isDuplicate && (
          <p className="text-xs text-warning">Outra imagem já está vinculada a esta peça — será ignorada.</p>
        )}
        {item.status === 'pending' && !isDuplicate && willSkipExisting && (
          <p className="text-xs text-muted-foreground">Peça já tem foto — não será substituída.</p>
        )}
        {item.status === 'pending' && !isDuplicate && !willSkipExisting && item.part?.photo_url && (
          <p className="text-xs text-muted-foreground">Peça já tem foto — será substituída.</p>
        )}
      </div>
      {item.status !== 'uploading' && !disabled && (
        <button
          onClick={onRemove}
          className="absolute top-2 right-2 w-6 h-6 rounded-full text-muted-foreground hover:bg-muted/80 hover:text-foreground flex items-center justify-center"
          aria-label="Remover imagem"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}
