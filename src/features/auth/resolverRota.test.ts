import { describe, expect, it } from 'vitest';
import * as servidor from '../../../supabase/functions/_shared/portalConfig.ts';
import { DOMINIO_TECNICO, SEGURANCA, USERNAME_RE, menuParaPapel } from '@/config/portal';
import { ROTAS, mfaObrigatorioPara, resolverRota, rotaPermitida, type EstadoSessao } from './resolverRota';

const completo: EstadoSessao = {
  temSessao: true,
  aalAtual: 'aal2',
  aalProximo: 'aal2',
  trocaSenhaPendente: false,
  mfaObrigatorio: true,
  temFatorVerificado: true,
};

describe('resolverRota', () => {
  it('sem sessão vai para o login', () => {
    expect(resolverRota({ ...completo, temSessao: false }, '/logs')).toBe(ROTAS.login);
  });

  it('desafio MFA vem antes da troca de senha', () => {
    expect(resolverRota({ ...completo, aalAtual: 'aal1', trocaSenhaPendente: true }, '/catalogo')).toBe(ROTAS.desafioMfa);
  });

  it('senha pendente leva ao primeiro acesso', () => {
    expect(resolverRota({ ...completo, trocaSenhaPendente: true }, '/catalogo')).toBe(ROTAS.primeiroAcesso);
  });

  it('MFA obrigatório sem fator leva ao cadastro', () => {
    expect(resolverRota({ ...completo, aalAtual: 'aal1', aalProximo: 'aal1', temFatorVerificado: false }, '/catalogo')).toBe(ROTAS.cadastroMfa);
  });

  it('usuário comum sem fator e política admin segue para o destino', () => {
    const estado = { ...completo, aalAtual: 'aal1', aalProximo: 'aal1', temFatorVerificado: false, mfaObrigatorio: mfaObrigatorioPara('user', 'admin') };
    expect(resolverRota(estado, '/catalogo')).toBe('/catalogo');
  });

  it('política "todos" exige MFA de qualquer papel', () => {
    expect(mfaObrigatorioPara('user', 'todos')).toBe(true);
    expect(mfaObrigatorioPara('admin', 'admin')).toBe(true);
  });
});

describe('menu e rotas por papel', () => {
  const rotas = (papel: 'admin' | 'user') => menuParaPapel(papel).flatMap((s) => s.itens.map((i) => i.rota));

  it('Logs e Usuários só aparecem para admin', () => {
    expect(rotas('user')).not.toContain('/logs');
    expect(rotas('user')).not.toContain('/usuarios');
    expect(rotas('admin')).toEqual(expect.arrayContaining(['/logs', '/usuarios']));
  });

  it('Dashboard, Perfil e LGPD aparecem para todos', () => {
    for (const papel of ['admin', 'user'] as const) {
      expect(rotas(papel)).toEqual(expect.arrayContaining(['/dashboard', '/perfil', '/lgpd']));
    }
  });

  it('rotas restritas barram usuário comum', () => {
    expect(rotaPermitida('/logs', 'user')).toBe(false);
    expect(rotaPermitida('/usuarios', 'user')).toBe(false);
    expect(rotaPermitida('/usuarios', 'admin')).toBe(true);
    expect(rotaPermitida('/catalogo', 'user')).toBe(true);
  });
});

describe('configuração espelhada no servidor', () => {
  it('Edge Functions usam os mesmos valores de src/config/portal.ts', () => {
    expect(servidor.DOMINIO_TECNICO).toBe(DOMINIO_TECNICO);
    expect(servidor.MFA_STEPUP_MIN).toBe(SEGURANCA.MFA_STEPUP_MIN);
    expect(servidor.SENHA_TEMP_VALIDADE_H).toBe(SEGURANCA.SENHA_TEMP_VALIDADE_H);
    expect(servidor.USERNAME_RE.source).toBe(USERNAME_RE.source);
  });
});
