import { useState, useRef, useEffect } from 'react';
import {
  X,
  Package,
  DollarSign,
  Clipboard,
  Hash,
  Truck,
  Calendar,
  Image as ImageIcon,
  Plus,
  Loader2,
  AlertCircle,
  Pencil,
  Trash2,
  Save,
  type LucideIcon,
} from 'lucide-react';
import {
  supabase,
  deletePartPhoto,
  getErrorMessage,
  preparePhoto,
  uploadPartPhoto,
  validatePhoto,
  type Part,
} from '@/lib/supabase';
import { formatCurrency } from '@/lib/format';
import { normalizePartNumber } from '@/lib/partCodes';
import { usePartFilterOptions } from '@/lib/partFilters';

interface PartDetailModalProps {
  part: Part;
  onClose: () => void;
  onPartUpdated?: (updated: Part) => void;
  onPartDeleted?: () => void;
  /** Consultor: só visualiza (sem editar, excluir ou mexer na foto). A RLS também barra a escrita. */
  readOnly?: boolean;
}

function stripQuery(url: string | null) {
  return url?.split('?')[0] ?? null;
}

function formatDate(value: string | null) {
  if (!value) return '—';
  const [y, m, d] = value.split('-');
  return `${d}/${m}/${y}`;
}

export default function PartDetailModal({ part, onClose, onPartUpdated, onPartDeleted, readOnly = false }: PartDetailModalProps) {
  const [currentPhotoUrl, setCurrentPhotoUrl] = useState<string | null>(part.photo_url);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const inStock = part.stock_quantity > 0;
  const branches = Object.entries(part.branch_stock ?? {});

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const savePhotoUrl = async (photoUrl: string | null) => {
    const { error: updateError } = await supabase.from('parts').update({ photo_url: photoUrl }).eq('id', part.id);
    if (updateError) throw updateError;
    if (currentPhotoUrl && stripQuery(currentPhotoUrl) !== stripQuery(photoUrl)) {
      await deletePartPhoto(currentPhotoUrl).catch(() => undefined);
    }
    setCurrentPhotoUrl(photoUrl);
    onPartUpdated?.({ ...part, photo_url: photoUrl });
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validationError = validatePhoto(file);
    if (validationError) {
      setError(validationError);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setUploading(true);
    setError(null);
    try {
      const photoUrl = await uploadPartPhoto(await preparePhoto(file), part.part_number);
      await savePhotoUrl(photoUrl);
    } catch (err) {
      setError(getErrorMessage(err, 'Não foi possível enviar a foto.'));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemovePhoto = async () => {
    setUploading(true);
    setError(null);
    try {
      await savePhotoUrl(null);
    } catch (err) {
      setError(getErrorMessage(err, 'Não foi possível remover a foto.'));
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    setError(null);
    try {
      const { error: deleteError } = await supabase.from('parts').delete().eq('id', part.id);
      if (deleteError) throw deleteError;
      await deletePartPhoto(currentPhotoUrl).catch(() => undefined);
      onPartDeleted?.();
    } catch (err) {
      setError(getErrorMessage(err, 'Não foi possível excluir a peça.'));
      setDeleting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="bg-card rounded-2xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden animate-slideUp max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="part-detail-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-ink text-ink-foreground">
          <div className="flex items-center gap-3">
            <Package size={24} />
            <h2 id="part-detail-title" className="text-lg font-semibold">
              {editing ? 'Editar Peça' : 'Detalhes da Peça'}
            </h2>
          </div>
          <div className="flex items-center gap-1">
            {!editing && !readOnly && (
              <>
                <button
                  onClick={() => setEditing(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-ink-muted hover:bg-ink-2 hover:text-ink-foreground transition-colors"
                >
                  <Pencil size={15} /> Editar
                </button>
                <button
                  onClick={() => setConfirmingDelete(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-ink-muted hover:bg-destructive hover:text-white transition-colors"
                >
                  <Trash2 size={15} /> Excluir
                </button>
              </>
            )}
            <button
              onClick={onClose}
              className="ml-2 text-ink-muted hover:text-ink-foreground transition-colors"
              aria-label="Fechar"
            >
              <X size={22} />
            </button>
          </div>
        </div>

        {confirmingDelete && (
          <div className="flex flex-wrap items-center gap-3 px-6 py-3 bg-destructive/10 border-b border-destructive/30">
            <AlertCircle size={18} className="text-destructive flex-shrink-0" />
            <p className="flex-1 text-sm text-destructive">
              Excluir <b className="font-mono">{part.part_number}</b> do catálogo? A foto também será apagada.
            </p>
            <button
              onClick={() => setConfirmingDelete(false)}
              disabled={deleting}
              className="px-3 py-1.5 text-sm text-foreground/80 rounded-lg hover:bg-card transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-destructive text-white rounded-lg hover:brightness-110 transition-colors disabled:opacity-60"
            >
              {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              Confirmar exclusão
            </button>
          </div>
        )}

        {/* Body */}
        <div className="p-6 space-y-4">
          {error && (
            <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-lg px-3 py-2">
              <AlertCircle size={16} className="flex-shrink-0" />
              {error}
            </div>
          )}

          {editing ? (
            <PartEditForm
              part={{ ...part, photo_url: currentPhotoUrl }}
              onCancel={() => setEditing(false)}
              onSaved={(updated) => {
                setEditing(false);
                onPartUpdated?.(updated);
              }}
            />
          ) : (
            <>
              {/* Photo */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handlePhotoUpload}
                className="hidden"
              />
              {readOnly && !currentPhotoUrl ? (
                <div className="w-full h-32 rounded-xl bg-muted border border-border flex flex-col items-center justify-center gap-2 text-muted-foreground">
                  <Package size={28} strokeWidth={1.5} />
                  <span className="text-xs">Sem foto cadastrada</span>
                </div>
              ) : currentPhotoUrl ? (
                <div className="relative w-full h-64 rounded-xl overflow-hidden bg-card border border-border flex items-center justify-center">
                  <img src={currentPhotoUrl} alt={part.description} className="w-full h-full object-contain" />
                  <div className={`absolute bottom-3 right-3 flex gap-2 ${readOnly ? 'hidden' : ''}`}>
                    <button
                      type="button"
                      onClick={handleRemovePhoto}
                      disabled={uploading}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/60 text-white text-xs hover:bg-destructive transition-colors disabled:opacity-60"
                    >
                      <Trash2 size={14} />
                      Remover foto
                    </button>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/60 text-white text-xs hover:bg-black/80 transition-colors disabled:opacity-60"
                    >
                      {uploading ? <Loader2 size={14} className="animate-spin" /> : <ImageIcon size={14} />}
                      {uploading ? 'Enviando...' : 'Trocar foto'}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="w-full h-32 rounded-xl bg-muted border-2 border-dashed border-border flex flex-col items-center justify-center gap-2 text-muted-foreground hover:border-brand/60 hover:text-brand-strong transition-colors disabled:opacity-60"
                >
                  {uploading ? <Loader2 size={28} className="animate-spin" /> : <Plus size={28} />}
                  <span className="text-xs">
                    {uploading ? 'Enviando foto...' : 'Sem foto cadastrada — clique para adicionar'}
                  </span>
                </button>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand/10 text-brand-strong text-sm font-semibold font-mono">
                  <Hash size={14} />
                  {part.part_number}
                </span>
                {part.alt_code && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-muted text-foreground/80 text-sm font-mono">
                    Ref. {part.alt_code}
                  </span>
                )}
                <span
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold ${
                    inStock ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'
                  }`}
                >
                  {inStock ? `${part.stock_quantity} em estoque` : 'Sem estoque'}
                </span>
              </div>

              <div>
                <h3 className="text-xl font-bold text-foreground">{part.description}</h3>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <InfoField icon={Truck} label="Marca / Fornecedor" value={part.supplier || '—'} />
                <InfoField icon={Clipboard} label="Grupo" value={part.category || 'Não atribuído'} />
                <InfoField icon={Hash} label="Referência OEM" value={part.oem_reference || '—'} />
                <InfoField icon={Calendar} label="Última compra" value={formatDate(part.last_purchase_date)} />
                <InfoField icon={DollarSign} label="Custo" value={formatCurrency(part.cost_price)} />
              </div>

              {branches.length > 0 && (
                <div>
                  <p className="text-sm text-muted-foreground font-medium mb-2">Estoque por filial</p>
                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                    {branches.map(([name, info]) => (
                      <div key={name} className="rounded-lg border border-border px-3 py-2 text-center">
                        <p className="text-xs font-semibold text-muted-foreground">{name}</p>
                        <p className={`text-lg font-bold ${info.qty > 0 ? 'text-foreground' : 'text-muted-foreground/60'}`}>
                          {info.qty}
                        </p>
                        <p className="text-[11px] text-muted-foreground" title="Última compra">
                          {info.last_price !== null ? formatCurrency(info.last_price) : '—'}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <p className="text-sm text-muted-foreground font-medium mb-1">Especificações Técnicas</p>
                <p className="text-foreground bg-background rounded-lg p-3 text-sm">
                  {part.specifications || 'Sem especificações cadastradas.'}
                </p>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-border">
                <div className="flex items-center gap-2">
                  <DollarSign size={20} className="text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Preço de Venda</p>
                    <p className="text-2xl font-bold text-foreground">{formatCurrency(part.unit_price)}</p>
                  </div>
                </div>
                <button className="px-6 py-2.5 bg-brand text-brand-foreground rounded-lg font-medium hover:brightness-105 transition-colors shadow-md shadow-brand/30">
                  Solicitar Peça
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function PartEditForm({
  part,
  onCancel,
  onSaved,
}: {
  part: Part;
  onCancel: () => void;
  onSaved: (updated: Part) => void;
}) {
  const [form, setForm] = useState({
    part_number: part.part_number,
    alt_code: part.alt_code ?? '',
    description: part.description,
    supplier: part.supplier ?? '',
    brand: part.brand ?? '',
    category: part.category ?? '',
    oem_reference: part.oem_reference ?? '',
    specifications: part.specifications ?? '',
    stock_quantity: String(part.stock_quantity ?? 0),
    unit_price: String(part.unit_price ?? 0),
    cost_price: String(part.cost_price ?? 0),
  });
  const [branchQty, setBranchQty] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(part.branch_stock ?? {}).map(([name, b]) => [name, String(b.qty)]))
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const filterOptions = usePartFilterOptions();

  const hasBranches = Object.keys(branchQty).length > 0;
  const branchTotal = Object.values(branchQty).reduce((sum, v) => sum + (parseInt(v, 10) || 0), 0);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const partNumber = normalizePartNumber(form.part_number);
    if (!partNumber || !form.description.trim()) {
      setError('Código e descrição são obrigatórios.');
      return;
    }

    setSaving(true);
    setError(null);
    const branchStock = Object.fromEntries(
      Object.entries(part.branch_stock ?? {}).map(([name, b]) => [
        name,
        { ...b, qty: parseInt(branchQty[name], 10) || 0 },
      ])
    );

    const { data, error: updateError } = await supabase
      .from('parts')
      .update({
        part_number: partNumber,
        alt_code: normalizePartNumber(form.alt_code),
        description: form.description.trim(),
        supplier: form.supplier.trim(),
        brand: form.brand.trim(),
        category: form.category.trim(),
        oem_reference: form.oem_reference.trim(),
        specifications: form.specifications.trim(),
        stock_quantity: hasBranches ? branchTotal : parseInt(form.stock_quantity, 10) || 0,
        branch_stock: branchStock,
        unit_price: Number(form.unit_price) || 0,
        cost_price: Number(form.cost_price) || 0,
      })
      .eq('id', part.id)
      .select()
      .single();

    setSaving(false);
    if (updateError) {
      setError(getErrorMessage(updateError, 'Não foi possível salvar as alterações.'));
      return;
    }
    onSaved(data as Part);
  };

  const inputClass =
    'w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-transparent';

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-lg px-3 py-2">
          <AlertCircle size={16} className="flex-shrink-0" />
          {error}
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-4">
        <FormField label="Código (Cód. JCB) *">
          <input value={form.part_number} onChange={set('part_number')} className={`${inputClass} font-mono`} />
        </FormField>
        <FormField label="Cód. Diversos / Referência">
          <input value={form.alt_code} onChange={set('alt_code')} className={`${inputClass} font-mono`} />
        </FormField>
      </div>

      <FormField label="Descrição *">
        <input value={form.description} onChange={set('description')} className={inputClass} />
      </FormField>

      <div className="grid sm:grid-cols-2 gap-4">
        <FormField label="Marca / Fornecedor">
          <input value={form.supplier} onChange={set('supplier')} list="part-edit-supplier-options" className={inputClass} />
          <datalist id="part-edit-supplier-options">
            {filterOptions.supplier.map((o) => (
              <option key={o.value} value={o.value} />
            ))}
          </datalist>
        </FormField>
        <FormField label="Grupo">
          <input
            value={form.category}
            onChange={set('category')}
            list="part-edit-group-options"
            placeholder="Atribuir grupo (ex.: Motor, Hidráulico)"
            className={inputClass}
          />
          <datalist id="part-edit-group-options">
            {filterOptions.category.map((o) => (
              <option key={o.value} value={o.value} />
            ))}
          </datalist>
        </FormField>
        <FormField label="Referência OEM">
          <input value={form.oem_reference} onChange={set('oem_reference')} className={inputClass} />
        </FormField>
        <FormField label="Preço de venda (R$)">
          <input type="number" step="0.01" min="0" value={form.unit_price} onChange={set('unit_price')} className={inputClass} />
        </FormField>
        <FormField label="Custo (R$)">
          <input type="number" step="0.01" min="0" value={form.cost_price} onChange={set('cost_price')} className={inputClass} />
        </FormField>
      </div>

      {hasBranches ? (
        <FormField label={`Estoque por filial (total: ${branchTotal})`}>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
            {Object.keys(branchQty).map((name) => (
              <label key={name} className="text-xs font-semibold text-muted-foreground">
                {name}
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={branchQty[name]}
                  onChange={(e) => setBranchQty((prev) => ({ ...prev, [name]: e.target.value }))}
                  className={`${inputClass} mt-1`}
                />
              </label>
            ))}
          </div>
        </FormField>
      ) : (
        <FormField label="Estoque">
          <input type="number" min="0" step="1" value={form.stock_quantity} onChange={set('stock_quantity')} className={inputClass} />
        </FormField>
      )}

      <FormField label="Especificações técnicas">
        <textarea value={form.specifications} onChange={set('specifications')} rows={3} className={`${inputClass} resize-none`} />
      </FormField>

      <div className="flex justify-end gap-3 pt-4 border-t border-border">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="px-5 py-2.5 text-foreground/80 font-medium rounded-xl hover:bg-muted transition-colors"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-2 px-6 py-2.5 bg-brand text-brand-foreground font-medium rounded-xl hover:brightness-105 transition-colors shadow-md shadow-brand/30 disabled:opacity-60"
        >
          {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
          Salvar alterações
        </button>
      </div>
    </form>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="block text-xs font-semibold text-foreground/80 mb-1.5">{label}</p>
      {children}
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
      <Icon size={18} className="text-muted-foreground mt-0.5 flex-shrink-0" />
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium text-foreground">{value}</p>
      </div>
    </div>
  );
}
