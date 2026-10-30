import {
  ClipboardList,
  FileUp,
  LayoutDashboard,
  PackagePlus,
  Search,
  ShieldCheck,
  ShieldHalf,
  UserRound,
  Users,
  Zap,
  type LucideIcon,
} from 'lucide-react';

// Único arquivo para trocar marca, cor, menu e política do portal.

export const NOME_PORTAL = 'Portal de Peças Paralelas';
export const NOME_EMPRESA = 'NORMAQ';
export const PREFIXO = 'normaq-pecas-paralelas';
export const DOMINIO_TECNICO = 'normaq.local';

// Vazio mostra o nome da empresa em texto. Para usar imagem: '/brand/logo-horizontal.png' em public/.
export const LOGO_HORIZONTAL: string = '';
export const LOGO_ICONE = '/favicon.svg';
export const FUNDO_LOGIN = '/brand/login-bg.jpg';
export const FUNDO_LOGIN_FALLBACK = '/brand/login-city.svg';

// A cor também está em src/index.css (--brand), que é o que os componentes usam.
export const COR_MARCA = 'oklch(0.83 0.17 84)';
export const COR_SOBRE_MARCA = 'oklch(0.16 0.01 260)';

export const AUTOR = 'Lucas Cruz';
export const CREDITO = `Desenvolvido por ${AUTOR}`;

export const FRASE_LOGIN = 'Catálogo de Peças Paralelas';
export const TEXTO_LOGIN =
  'Consulte, cadastre e mantenha as peças paralelas com foto, código e estoque por filial em um só lugar.';
export const BENEFICIOS_LOGIN: { icone: LucideIcon; texto: string }[] = [
  { icone: Search, texto: 'Busca por código, referência ou descrição' },
  { icone: Zap, texto: 'Importação de planilha e fotos em lote' },
  { icone: ShieldCheck, texto: 'Acesso protegido com autenticação em dois fatores' },
];

export type Papel = 'admin' | 'user' | 'consultor';

export const PAPEIS: Record<Papel, string> = {
  admin: 'Administrador',
  user: 'Usuário',
  consultor: 'Consultor',
};

/** Quem altera o catálogo (cadastro, edição, importação). A RLS (pp_can_edit_parts) aplica a mesma regra. */
export const PAPEIS_EDITAM_CATALOGO: Papel[] = ['admin', 'user'];

export const podeEditarCatalogo = (papel: Papel | null) => papel !== null && PAPEIS_EDITAM_CATALOGO.includes(papel);

export interface MenuItem {
  rota: string;
  rotulo: string;
  icone: LucideIcon;
  /** Papéis que veem e acessam a rota. Sem a lista, todos os papéis. */
  papeis?: Papel[];
}

export interface MenuSecao {
  titulo?: string;
  itens: MenuItem[];
}

export const MENU: MenuSecao[] = [
  {
    itens: [{ rota: '/dashboard', rotulo: 'Dashboard', icone: LayoutDashboard, papeis: PAPEIS_EDITAM_CATALOGO }],
  },
  {
    titulo: 'Catálogo',
    itens: [
      { rota: '/catalogo', rotulo: 'Catálogo de Peças', icone: Search },
      { rota: '/cadastro', rotulo: 'Cadastro de Peças', icone: PackagePlus, papeis: PAPEIS_EDITAM_CATALOGO },
      { rota: '/importar', rotulo: 'Importar (Excel e Fotos)', icone: FileUp, papeis: PAPEIS_EDITAM_CATALOGO },
    ],
  },
  {
    titulo: 'Administração',
    itens: [
      { rota: '/usuarios', rotulo: 'Usuários', icone: Users, papeis: ['admin'] },
      { rota: '/logs', rotulo: 'Auditoria / Logs', icone: ClipboardList, papeis: ['admin'] },
    ],
  },
  {
    titulo: 'Conta',
    itens: [
      { rota: '/perfil', rotulo: 'Meu perfil', icone: UserRound },
      { rota: '/lgpd', rotulo: 'LGPD', icone: ShieldHalf },
    ],
  },
];

export const SEGURANCA = {
  MFA_OBRIGATORIO: 'admin' as 'admin' | 'todos',
  MFA_STEPUP_MIN: 10,
  INATIVIDADE_MIN: 30,
  SENHA_TEMP_VALIDADE_H: 72,
  MAX_FATORES_MFA: 2,
};

// Prazos de retenção: validar com o jurídico.
export const RETENCAO = {
  LOGS_ANOS: 5,
  ACESSO_MESES: 12,
};

export const USERNAME_RE = /^[a-z0-9]+(\.[a-z0-9]+)+$/;

export const storageKey = (nome: string) => `${PREFIXO}-${nome}`;

const papelVeItem = (item: MenuItem, papel: Papel | null) => !item.papeis || (papel !== null && item.papeis.includes(papel));

export function menuParaPapel(papel: Papel | null): MenuSecao[] {
  return MENU.map((secao) => ({
    ...secao,
    itens: secao.itens.filter((item) => papelVeItem(item, papel)),
  })).filter((secao) => secao.itens.length > 0);
}

/** Rota liberada para o papel, pela mesma lista do menu (o menu não é a permissão: a RLS e as funções barram no servidor). */
export function rotaLiberadaParaPapel(pathname: string, papel: Papel | null): boolean {
  for (const secao of MENU) {
    for (const item of secao.itens) {
      if (pathname === item.rota || pathname.startsWith(`${item.rota}/`)) return papelVeItem(item, papel);
    }
  }
  return true;
}

export function rotuloDaRota(pathname: string): string {
  for (const secao of MENU) {
    for (const item of secao.itens) {
      if (pathname === item.rota || pathname.startsWith(`${item.rota}/`)) return item.rotulo;
    }
  }
  return NOME_PORTAL;
}
