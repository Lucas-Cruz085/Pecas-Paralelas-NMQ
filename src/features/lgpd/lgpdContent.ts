import { NOME_EMPRESA, NOME_PORTAL, RETENCAO, SEGURANCA } from '@/config/portal';
import { PASSWORD_RULE_TEXT } from '@/shared/passwordPolicy';

export interface CardLgpd {
  rotulo: string;
  titulo: string;
  texto: string;
}

// Rascunho operacional: revisar todo o texto e as citações normativas com o jurídico.
export const CARDS_LGPD: CardLgpd[] = [
  {
    rotulo: 'Controlador',
    titulo: 'Quem trata os dados',
    texto: `${NOME_EMPRESA}, responsável pelo ${NOME_PORTAL}, decide como e por que os dados são tratados.`,
  },
  {
    rotulo: 'Acesso',
    titulo: 'Dados de acesso',
    texto:
      'Tratamos nome, usuário, papel, setor, cargo e registros de login. A senha temporária é gerada no servidor, mostrada uma única vez e não é gravada; o provedor de autenticação guarda só o hash da senha. O segredo do autenticador (MFA) fica só no provedor.',
  },
  {
    rotulo: 'Operação',
    titulo: 'Dados do catálogo',
    texto:
      'O catálogo guarda dados de peças (código, descrição, fornecedor, preços, estoque por filial e fotos). Esses dados não identificam pessoas.',
  },
  {
    rotulo: 'Finalidade',
    titulo: 'Para que usamos',
    texto:
      'Autenticar quem acessa, mostrar os indicadores e o catálogo e manter a trilha de auditoria. Não há uso para publicidade nem decisão automatizada.',
  },
  {
    rotulo: 'Base legal',
    titulo: 'Fundamento',
    texto:
      'Execução das atividades da empresa e legítimo interesse na segurança do acesso (a confirmar com o jurídico).',
  },
  {
    rotulo: 'Compartilhamento',
    titulo: 'Com quem',
    texto:
      'Só com usuários autorizados, com o provedor de autenticação e com a hospedagem do portal. Não há venda de dados nem uso para marketing.',
  },
  {
    rotulo: 'Retenção',
    titulo: 'Por quanto tempo',
    texto: `Logs de auditoria por ${RETENCAO.LOGS_ANOS} anos; registros de acesso por ${RETENCAO.ACESSO_MESES} meses. Depois disso, os registros são eliminados pela rotina de retenção.`,
  },
  {
    rotulo: 'Direitos',
    titulo: 'O que você pode pedir',
    texto:
      'Confirmação de tratamento, acesso, correção, anonimização ou eliminação, informação sobre compartilhamento e revogação do consentimento, quando aplicável. O pedido começa pelo administrador do portal.',
  },
  {
    rotulo: 'Segurança',
    titulo: 'Como protegemos',
    texto: `Política de senha: ${PASSWORD_RULE_TEXT} A senha temporária é criada com gerador criptográfico e a troca é obrigatória no primeiro acesso. Autenticação em dois fatores (obrigatória para ${
      SEGURANCA.MFA_OBRIGATORIO === 'todos' ? 'todos' : 'administradores'
    }), trilha de auditoria imutável e controles alinhados a boas práticas e ao art. 46 da LGPD. A trilha não registra a senha.`,
  },
  {
    rotulo: 'Contato',
    titulo: 'Fale com a gente',
    texto: 'Até a nomeação do encarregado, os pedidos e dúvidas passam pelo administrador do portal.',
  },
];

export const PEDIDO_TITULAR = {
  rotulo: 'Como pedir',
  titulo: 'Pedido do titular',
  texto:
    'Fale com o administrador do portal informando seu usuário e o que deseja (acesso, correção, eliminação ou outra solicitação). O pedido fica registrado e é respondido no prazo legal.',
};
