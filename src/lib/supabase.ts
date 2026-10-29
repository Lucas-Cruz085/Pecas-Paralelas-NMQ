import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { storageKey } from '@/config/portal';

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() ?? '';
export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? '';

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

// O App só renderiza as telas que usam o cliente quando isSupabaseConfigured é true.
export const supabase: SupabaseClient = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: { storageKey: storageKey('auth'), persistSession: true, autoRefreshToken: true },
    })
  : (null as unknown as SupabaseClient);

export const PART_PHOTOS_BUCKET = 'part-photos';

export interface BranchStock {
  qty: number;
  last_price: number | null;
}

export interface Part {
  id: string;
  part_number: string;
  alt_code: string;
  description: string;
  supplier: string;
  brand: string;
  category: string;
  oem_reference: string;
  specifications: string;
  stock_quantity: number;
  unit_price: number;
  cost_price: number;
  last_purchase_date: string | null;
  branch_stock: Record<string, BranchStock>;
  photo_url: string | null;
  created_at: string;
  updated_at: string;
}

export type PartInput = Omit<Part, 'id' | 'created_at' | 'updated_at'>;

export function getErrorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object') {
    const { code, message } = err as { code?: string; message?: string };
    if (code === '23505' || message?.includes('duplicate key')) {
      return 'Já existe uma peça com este part number. Use um código diferente.';
    }
    if (code === '42703' || code === 'PGRST204') {
      return 'O banco ainda não tem as colunas novas. Execute a migração 20261029143000_add_import_fields.sql no SQL Editor do Supabase.';
    }
    if (message) return message;
  }
  return fallback;
}

export function photoStorageName(partNumber: string): string {
  return partNumber.trim().toUpperCase().replace(/[^A-Z0-9]/g, '-');
}

// Um arquivo por peça (sobrescrito a cada troca); o ?v= evita servir a foto antiga do cache.
export async function uploadPartPhoto(file: Blob, partNumber: string): Promise<string> {
  const fileExt = file.type === 'image/webp' ? 'webp' : file.type.split('/')[1] || 'jpg';
  const fileName = `${photoStorageName(partNumber)}.${fileExt}`;

  const { error } = await supabase.storage
    .from(PART_PHOTOS_BUCKET)
    .upload(fileName, file, { upsert: true, contentType: file.type || undefined });
  if (error) throw error;

  const { data } = supabase.storage.from(PART_PHOTOS_BUCKET).getPublicUrl(fileName);
  return `${data.publicUrl}?v=${Date.now()}`;
}

export async function deletePartPhoto(photoUrl: string | null): Promise<void> {
  if (!photoUrl) return;
  const marker = `/object/public/${PART_PHOTOS_BUCKET}/`;
  const index = photoUrl.indexOf(marker);
  if (index === -1) return;
  const path = decodeURIComponent(photoUrl.slice(index + marker.length).split('?')[0]);
  await supabase.storage.from(PART_PHOTOS_BUCKET).remove([path]);
}

export async function fetchAllParts<T = Part>(columns = '*'): Promise<T[]> {
  const pageSize = 1000;
  const all: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('parts')
      .select(columns)
      .order('part_number')
      .range(from, from + pageSize - 1);
    if (error) throw error;
    all.push(...((data ?? []) as T[]));
    if (!data || data.length < pageSize) return all;
  }
}

export const MAX_PHOTO_SIZE = 20 * 1024 * 1024;

export function validatePhoto(file: File): string | null {
  if (!file.type.startsWith('image/')) return 'Selecione um arquivo de imagem válido.';
  if (file.size > MAX_PHOTO_SIZE) return 'A foto deve ter no máximo 20 MB.';
  return null;
}

const MAX_PHOTO_DIMENSION = 1600;

// Fotos de câmera chegam com vários MB; reduz para no máx. 1600px em WebP antes do upload.
export async function preparePhoto(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;

  const scale = Math.min(1, MAX_PHOTO_DIMENSION / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size <= 1024 * 1024) {
    bitmap.close();
    return file;
  }

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.85));
  return blob && blob.size < file.size ? blob : file;
}
