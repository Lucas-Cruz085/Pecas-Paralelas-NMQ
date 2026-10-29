import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() ?? '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? '';

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

// O App só renderiza as telas que usam o cliente quando isSupabaseConfigured é true.
export const supabase: SupabaseClient = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : (null as unknown as SupabaseClient);

export const PART_PHOTOS_BUCKET = 'part-photos';

export interface Part {
  id: string;
  part_number: string;
  description: string;
  brand: string;
  category: string;
  oem_reference: string;
  specifications: string;
  stock_quantity: number;
  unit_price: number;
  photo_url: string | null;
  created_at: string;
  updated_at: string;
}

export function getErrorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object') {
    const { code, message } = err as { code?: string; message?: string };
    if (code === '23505' || message?.includes('duplicate key')) {
      return 'Já existe uma peça com este part number. Use um código diferente.';
    }
    if (message) return message;
  }
  return fallback;
}

export async function uploadPartPhoto(file: File, partNumber: string): Promise<string> {
  const fileExt = file.name.includes('.') ? file.name.split('.').pop() : 'jpg';
  const safeId = partNumber.replace(/[^a-zA-Z0-9]/g, '-');
  const fileName = `${Date.now()}-${safeId}.${fileExt}`;

  const { error } = await supabase.storage.from(PART_PHOTOS_BUCKET).upload(fileName, file);
  if (error) throw error;

  const { data } = supabase.storage.from(PART_PHOTOS_BUCKET).getPublicUrl(fileName);
  return data.publicUrl;
}

export const MAX_PHOTO_SIZE = 5 * 1024 * 1024;

export function validatePhoto(file: File): string | null {
  if (!file.type.startsWith('image/')) return 'Selecione um arquivo de imagem válido.';
  if (file.size > MAX_PHOTO_SIZE) return 'A foto deve ter no máximo 5 MB.';
  return null;
}
