import { z } from 'npm:zod@4.6.7';
import { corsHeaders } from './cors.ts';

const MAX_BODY_BYTES = 16 * 1024;
const GENERIC_ERROR = 'Não foi possível concluir a operação. Tente novamente.';

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public extra: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

export interface RequestContext {
  req: Request;
  body: unknown;
  requestId: string;
  ip: string | null;
  userAgent: string | null;
}

function clientIp(req: Request): string | null {
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const ip = req.headers.get('cf-connecting-ip') ?? forwarded ?? req.headers.get('x-real-ip');
  return ip && /^[0-9a-fA-F:.]{3,45}$/.test(ip) ? ip : null;
}

export function json(req: Request, status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export function parse<T extends z.ZodTypeAny>(schema: T, body: unknown): z.infer<T> {
  const result = schema.safeParse(body ?? {});
  if (!result.success) {
    const message = result.error.issues[0]?.message ?? '';
    const isDefault = /^(Invalid|Too |Expected|Required|Unrecognized)/.test(message);
    throw new HttpError(400, 'INVALID_INPUT', message && !isDefault ? message : 'Dados inválidos.');
  }
  return result.data;
}

/** Envolve a função: CORS, método, limite de corpo, request_id e erros sem vazar detalhes internos. */
export function serve(handler: (ctx: RequestContext) => Promise<unknown>) {
  Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(req) });
    const requestId = crypto.randomUUID();
    try {
      if (req.method !== 'POST') throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Método não permitido.');
      const declared = Number(req.headers.get('content-length') ?? '0');
      if (declared > MAX_BODY_BYTES) throw new HttpError(413, 'PAYLOAD_TOO_LARGE', 'Requisição muito grande.');
      const raw = await req.text();
      if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) {
        throw new HttpError(413, 'PAYLOAD_TOO_LARGE', 'Requisição muito grande.');
      }
      let body: unknown = {};
      if (raw.trim()) {
        try {
          body = JSON.parse(raw);
        } catch {
          throw new HttpError(400, 'INVALID_JSON', 'Dados inválidos.');
        }
      }
      const result = await handler({
        req,
        body,
        requestId,
        ip: clientIp(req),
        userAgent: req.headers.get('user-agent')?.slice(0, 300) ?? null,
      });
      return json(req, 200, { ...(result as Record<string, unknown> ?? {}), request_id: requestId });
    } catch (err) {
      if (err instanceof HttpError) {
        return json(req, err.status, { error: err.message, code: err.code, request_id: requestId, ...err.extra });
      }
      console.error(`[${requestId}] erro interno:`, err instanceof Error ? err.message : 'desconhecido');
      return json(req, 500, { error: GENERIC_ERROR, code: 'INTERNAL', request_id: requestId });
    }
  });
}

/** Repassa mensagens de regra de negócio do banco (RAISE EXCEPTION) e esconde o resto. */
export function dbError(error: { code?: string; message?: string } | null, fallback = GENERIC_ERROR): HttpError {
  const message = error?.message ?? '';
  if (error?.code === 'P0001' && message) return new HttpError(409, 'BUSINESS_RULE', message);
  if (error?.code === '42501') return new HttpError(403, 'FORBIDDEN', 'Acesso não autorizado.');
  if (error?.code === '23505') return new HttpError(409, 'DUPLICATE', 'Registro já existe.');
  console.error('erro de banco:', error?.code ?? 'sem código');
  return new HttpError(500, 'INTERNAL', fallback);
}

export { z };
