export function normalizePartNumber(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().toUpperCase();
}

// Nomes de arquivo não aceitam "/", então "30/925633P" vira "30-925633P.png".
// A chave ignora separadores para casar os dois lados.
export function codeKey(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// Peças paralelas usam o código JCB com sufixo "P"; algumas fotos vêm sem ele (ex.: 30-925633.png).
function keyVariants(key: string): string[] {
  return key.endsWith('P') ? [key, key.slice(0, -1)] : [key, `${key}P`];
}

export function codeFromFileName(fileName: string): string {
  return fileName
    .replace(/\.[^.]+$/, '')
    .replace(/\s*\(\d+\)$/, '')
    .replace(/\s*-\s*c[oó]pia$/i, '')
    .trim();
}

export interface CodeIndexEntry {
  id: string;
  part_number: string;
  alt_code?: string | null;
}

export function buildCodeIndex<T extends CodeIndexEntry>(parts: T[]) {
  const byPartNumber = new Map<string, T>();
  const byAltCode = new Map<string, T>();
  for (const part of parts) {
    const key = codeKey(part.part_number);
    if (key && !byPartNumber.has(key)) byPartNumber.set(key, part);
    const altKey = part.alt_code ? codeKey(part.alt_code) : '';
    if (altKey && !byAltCode.has(altKey)) byAltCode.set(altKey, part);
  }

  return function findPart(code: string): T | undefined {
    const key = codeKey(code);
    if (!key) return undefined;
    for (const map of [byPartNumber, byAltCode]) {
      for (const variant of keyVariants(key)) {
        const found = map.get(variant);
        if (found) return found;
      }
    }
    return undefined;
  };
}
