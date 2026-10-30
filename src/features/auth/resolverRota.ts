import { rotaLiberadaParaPapel, type Papel } from '@/config/portal';

export const ROTAS = {
  login: '/auth',
  desafioMfa: '/auth/mfa',
  primeiroAcesso: '/primeiro-acesso',
  cadastroMfa: '/seguranca/mfa',
  inicio: '/catalogo',
  dashboard: '/dashboard',
} as const;

export const ROTAS_ADMIN = ['/usuarios', '/logs'];

export interface EstadoSessao {
  temSessao: boolean;
  aalAtual: string | null;
  aalProximo: string | null;
  trocaSenhaPendente: boolean;
  mfaObrigatorio: boolean;
  temFatorVerificado: boolean;
}

export function mfaObrigatorioPara(papel: Papel | null, politica: 'admin' | 'todos'): boolean {
  return papel === 'admin' || politica === 'todos';
}

/** Ordem única de redirecionamento usada por todas as rotas protegidas. */
export function resolverRota(estado: EstadoSessao, destino: string = ROTAS.inicio): string {
  if (!estado.temSessao) return ROTAS.login;
  if (estado.aalAtual === 'aal1' && estado.aalProximo === 'aal2') return ROTAS.desafioMfa;
  if (estado.trocaSenhaPendente) return ROTAS.primeiroAcesso;
  if (estado.mfaObrigatorio && !estado.temFatorVerificado) return ROTAS.cadastroMfa;
  return destino;
}

export function rotaPermitida(pathname: string, papel: Papel | null): boolean {
  const restrita = ROTAS_ADMIN.some((rota) => pathname === rota || pathname.startsWith(`${rota}/`));
  if (restrita && papel !== 'admin') return false;
  return rotaLiberadaParaPapel(pathname, papel);
}

export function ehRotaDeFluxo(pathname: string): boolean {
  return [ROTAS.login, ROTAS.desafioMfa, ROTAS.primeiroAcesso, ROTAS.cadastroMfa].includes(pathname as never);
}
