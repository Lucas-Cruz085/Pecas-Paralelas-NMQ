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

export type Papel = 'admin' | 'user';

export const PAPEIS: Record<Papel, string> = {
  admin: 'Administrador',
  user: 'Usuário',
};

export interface MenuItem {
  rota: string;
  rotulo: string;
  icone: LucideIcon;
  somenteAdmin?: boolean;
}

export interface MenuSecao {
  titulo?: string;
  itens: MenuItem[];
}

export const MENU: MenuSecao[] = [
  {
    itens: [{ rota: '/dashboard', rotulo: 'Dashboard', icone: LayoutDashboard }],
  },
  {
    titulo: 'Catálogo',
    itens: [
      { rota: '/catalogo', rotulo: 'Catálogo de Peças', icone: Search },
      { rota: '/cadastro', rotulo: 'Cadastro de Peças', icone: PackagePlus },
      { rota: '/importar', rotulo: 'Importar (Excel e Fotos)', icone: FileUp },
    ],
  },
  {
    titulo: 'Administração',
    itens: [
      { rota: '/usuarios', rotulo: 'Usuários', icone: Users, somenteAdmin: true },
      { rota: '/logs', rotulo: 'Auditoria / Logs', icone: ClipboardList, somenteAdmin: true },
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

export function menuParaPapel(papel: Papel | null): MenuSecao[] {
  return MENU.map((secao) => ({
    ...secao,
    itens: secao.itens.filter((item) => !item.somenteAdmin || papel === 'admin'),
  })).filter((secao) => secao.itens.length > 0);
}

export function rotuloDaRota(pathname: string): string {
  for (const secao of MENU) {
    for (const item of secao.itens) {
      if (pathname === item.rota || pathname.startsWith(`${item.rota}/`)) return item.rotulo;
    }
  }
  return NOME_PORTAL;
}
