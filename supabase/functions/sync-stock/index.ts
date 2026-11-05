import { audit } from '../_shared/audit.ts';
import { serviceClient } from '../_shared/clients.ts';
import { dbError, HttpError, parse, serve, z } from '../_shared/http.ts';

const FILIAIS = ['REC', 'PNM', 'FOR', 'PET', 'CPV'] as const;

const schema = z.object({
  itens: z
    .array(
      z.object({
        partnumber: z.string().trim().min(1).max(60),
        filial: z.enum(FILIAIS, { message: `Filial inválida. Use: ${FILIAIS.join(', ')}.` }),
        quantidade: z.number().finite().min(-1e7).max(1e7),
      }),
    )
    .min(1, 'Nenhum item recebido.')
    .max(5000, 'Envie no máximo 5000 itens por chamada.'),
});

interface SyncResult {
  recebidos: number;
  pecas_encontradas: number;
  pecas_atualizadas: number;
  nao_encontrados: string[];
}

async function tokenValido(recebido: string | null): Promise<boolean> {
  const esperado = Deno.env.get('STOCK_SYNC_TOKEN') ?? '';
  if (esperado.length < 32) throw new HttpError(500, 'CONFIG', 'Configuração do servidor incompleta.');
  if (!recebido) return false;
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(recebido)),
    crypto.subtle.digest('SHA-256', enc.encode(esperado)),
  ]);
  const x = new Uint8Array(a);
  const y = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

/** Chamada pelo n8n (sem usuário): só atualiza a quantidade por filial das peças já cadastradas. */
serve(
  async (ctx) => {
    if (!(await tokenValido(ctx.req.headers.get('x-sync-token')))) {
      throw new HttpError(401, 'UNAUTHORIZED', 'Acesso não autorizado.');
    }
    const input = parse(schema, ctx.body);
    const svc = serviceClient();
    const { data, error } = await svc.rpc('pp_sync_branch_stock', { p_rows: input.itens });
    if (error) throw dbError(error);
    const result = data as SyncResult;
    await audit(svc, ctx, {
      actorId: null,
      username: 'integracao-n8n',
      action: 'ESTOQUE_SINCRONIZADO',
      tableName: 'parts',
      metadata: { ...result, nao_encontrados: result.nao_encontrados.slice(0, 100) },
    });
    return { ok: true, ...result };
  },
  { maxBodyBytes: 512 * 1024 },
);
