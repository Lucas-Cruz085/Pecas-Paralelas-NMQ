import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { KeyRound, Link2, Pencil, Power, Search, ShieldOff, Trash2, UserPlus, X } from 'lucide-react';
import { DOMINIO_TECNICO, PAPEIS, USERNAME_RE, type Papel } from '@/config/portal';
import { Alert, Badge, Button, Card, CardTitle, ConfirmDialog, Field, Input, Modal, PageHeader, Select, Table, useToast, type Column } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { AcaoCancelada, useStepUp } from '@/features/auth/StepUp';
import { ProfileAuditPanel } from '@/features/logs/ProfileAuditPanel';
import { formatarData } from '@/features/logs/auditFields';
import { callFunction, FunctionError, functionErrorMessage } from '@/lib/functions';
import { supabase } from '@/lib/supabase';
import { EVENTO_AVISOS } from '@/components/layout/NotificationBell';

export interface UsuarioLinha {
  id: string;
  username: string;
  email: string;
  name: string;
  department: string | null;
  job_title: string | null;
  active: boolean;
  must_change_password: boolean;
  temp_password_expires_at: string | null;
  role: Papel;
  mfa_enabled: boolean;
  shared_account: boolean;
  created_at: string;
}

/** Conta que já existe no Auth do projeto (outro sistema) e ainda não acessa o portal. */
interface ContaExistente {
  id: string;
  username: string;
  email: string;
  name: string;
  department: string | null;
  username_valid: boolean;
  created_at: string;
  last_sign_in_at: string | null;
}

interface SenhaGerada {
  usuario: string;
  senha: string;
  expiraEm: string;
}

type Confirmacao =
  | { tipo: 'ativo'; usuario: UsuarioLinha }
  | { tipo: 'mfa'; usuario: UsuarioLinha }
  | { tipo: 'excluir'; usuario: UsuarioLinha }
  | { tipo: 'senha'; usuario: UsuarioLinha };

const textoOpcional = (v: string) => (v.trim() ? v.trim() : null);

function validarTexto(v: string, rotulo: string, obrigatorio = false): string | null {
  const t = v.trim();
  if (!t) return obrigatorio ? `Informe o ${rotulo}.` : null;
  if (t.length < 2 || t.length > 120) return `O ${rotulo} precisa ter de 2 a 120 caracteres.`;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(t)) return `O ${rotulo} tem caracteres inválidos.`;
  return null;
}

function SenhaTemporariaModal({ dados, onClose }: { dados: SenhaGerada | null; onClose: () => void }) {
  const [copiada, setCopiada] = useState(false);
  useEffect(() => setCopiada(false), [dados]);
  const copiar = async () => {
    if (!dados) return;
    try {
      await navigator.clipboard.writeText(dados.senha);
      setCopiada(true);
    } catch {
      setCopiada(false);
    }
  };
  return (
    <Modal
      open={Boolean(dados)}
      title="Senha temporária"
      description={dados ? `Usuário ${dados.usuario}. Ela aparece só agora e não fica gravada.` : undefined}
      onClose={onClose}
      size="sm"
      footer={<Button onClick={onClose}>Fechar</Button>}
    >
      {dados && (
        <div className="space-y-3">
          <div className="flex gap-2">
            <Input readOnly value={dados.senha} className="font-mono" aria-label="Senha temporária" onFocus={(e) => e.currentTarget.select()} />
            <Button variant="secondary" onClick={copiar}>
              {copiada ? 'Copiada' : 'Copiar'}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Válida até {new Date(dados.expiraEm).toLocaleString('pt-BR')}. Envie por um canal reservado. No próximo acesso, a troca é obrigatória.
          </p>
        </div>
      )}
    </Modal>
  );
}

function VincularContaModal({
  sugestao,
  onClose,
  onVinculado,
}: {
  sugestao: string | null;
  onClose: () => void;
  onVinculado: () => void;
}) {
  const comStepUp = useStepUp();
  const toast = useToast();
  const [contas, setContas] = useState<ContaExistente[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState(sugestao ?? '');
  const [selecionada, setSelecionada] = useState<ContaExistente | null>(null);
  const [nome, setNome] = useState('');
  const [setor, setSetor] = useState('');
  const [cargo, setCargo] = useState('');
  const [papel, setPapel] = useState<Papel>('user');
  const [erros, setErros] = useState<Record<string, string | null>>({});
  const [enviando, setEnviando] = useState(false);

  const escolher = useCallback((conta: ContaExistente) => {
    setSelecionada(conta);
    setNome(conta.name);
    setSetor(conta.department ?? '');
    setCargo('');
    setPapel('user');
    setErros({});
  }, []);

  useEffect(() => {
    let ativo = true;
    void supabase.rpc('pp_admin_list_auth_candidates', { p_domain: DOMINIO_TECNICO }).then(({ data, error }) => {
      if (!ativo) return;
      setCarregando(false);
      if (error) {
        setErro('Não foi possível carregar as contas do Supabase.');
        return;
      }
      const itens = (data ?? []) as ContaExistente[];
      setContas(itens);
      const alvo = sugestao ? itens.find((c) => c.username === sugestao && c.username_valid) : undefined;
      if (alvo) escolher(alvo);
    });
    return () => {
      ativo = false;
    };
  }, [sugestao, escolher]);

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return contas;
    return contas.filter((c) => [c.name, c.username, c.department ?? ''].some((v) => v.toLowerCase().includes(termo)));
  }, [contas, busca]);

  const vincular = async () => {
    if (!selecionada) return;
    const novos = { nome: validarTexto(nome, 'nome', true), setor: validarTexto(setor, 'setor'), cargo: validarTexto(cargo, 'cargo') };
    setErros(novos);
    if (Object.values(novos).some(Boolean)) return;
    setEnviando(true);
    try {
      const r = await comStepUp(() =>
        callFunction<{ usuario: string }>('admin-link-user', {
          user_id: selecionada.id,
          nome: nome.trim(),
          setor: textoOpcional(setor),
          cargo: textoOpcional(cargo),
          papel,
        }),
      );
      toast.success(`Acesso liberado para ${r.usuario}. A pessoa entra com a mesma senha que já usa.`);
      onVinculado();
    } catch (err) {
      if (!(err instanceof AcaoCancelada)) toast.error(functionErrorMessage(err));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Modal
      open
      title="Vincular conta existente"
      description="Pessoas que já têm conta corporativa no Supabase (ex.: outro sistema da empresa). O acesso é liberado com a senha que elas já usam."
      onClose={onClose}
      locked={enviando}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={enviando}>
            Cancelar
          </Button>
          <Button onClick={() => void vincular()} loading={enviando} disabled={!selecionada}>
            <Link2 size={16} aria-hidden="true" /> Liberar acesso
          </Button>
        </>
      }
    >
      {sugestao && !carregando && (
        <Alert tone="info" className="mb-4">
          O usuário <span className="font-mono">{sugestao}</span> já tem conta corporativa. Libere o acesso por aqui, sem criar senha nova.
        </Alert>
      )}
      {erro && <Alert tone="error">{erro}</Alert>}

      {!erro && !selecionada && (
        <div className="space-y-3">
          <div className="relative">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome, usuário ou setor" className="pl-9" aria-label="Buscar contas" data-autofocus />
          </div>
          {carregando ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Carregando contas…</p>
          ) : filtradas.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {contas.length === 0 ? 'Todas as contas do Supabase já têm acesso ao portal.' : 'Nenhuma conta encontrada.'}
            </p>
          ) : (
            <ul className="max-h-80 space-y-1.5 overflow-y-auto pr-1">
              {filtradas.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    disabled={!c.username_valid}
                    onClick={() => escolher(c)}
                    className="flex w-full items-center justify-between gap-3 rounded-xl border border-border px-4 py-3 text-left transition-colors hover:border-brand/60 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-foreground">{c.name}</span>
                      <span className="block truncate font-mono text-xs text-muted-foreground">{c.username}</span>
                    </span>
                    <span className="shrink-0 text-right text-xs text-muted-foreground">
                      {c.username_valid ? (c.department ?? '') : 'Login fora do padrão nome.sobrenome'}
                      <span className="block">{c.last_sign_in_at ? `Último acesso ${formatarData(c.last_sign_in_at)}` : 'Nunca acessou'}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {selecionada && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3 rounded-xl border border-brand/40 bg-brand/10 px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">{selecionada.name}</p>
              <p className="truncate font-mono text-xs text-muted-foreground">Login: {selecionada.username}</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setSelecionada(null)} disabled={enviando}>
              Trocar
            </Button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome" error={erros.nome} className="sm:col-span-2">
              {(p) => <Input {...p} value={nome} onChange={(e) => setNome(e.target.value)} maxLength={120} />}
            </Field>
            <Field label="Setor" error={erros.setor}>
              {(p) => <Input {...p} value={setor} onChange={(e) => setSetor(e.target.value)} maxLength={120} />}
            </Field>
            <Field label="Cargo" error={erros.cargo}>
              {(p) => <Input {...p} value={cargo} onChange={(e) => setCargo(e.target.value)} maxLength={120} />}
            </Field>
            <Field label="Papel no portal">
              {(p) => (
                <Select {...p} value={papel} onChange={(e) => setPapel(e.target.value as Papel)}>
                  {Object.entries(PAPEIS).map(([valor, rotulo]) => (
                    <option key={valor} value={valor}>
                      {rotulo}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
        </div>
      )}
    </Modal>
  );
}

function NovoUsuarioCard({ onCriado, onJaExiste }: { onCriado: (s: SenhaGerada) => void; onJaExiste: (usuario: string) => void }) {
  const comStepUp = useStepUp();
  const toast = useToast();
  const [usuario, setUsuario] = useState('');
  const [nome, setNome] = useState('');
  const [setor, setSetor] = useState('');
  const [papel, setPapel] = useState<Papel>('user');
  const [erros, setErros] = useState<Record<string, string | null>>({});
  const [enviando, setEnviando] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const u = usuario.trim().toLowerCase();
    const novos = {
      usuario: USERNAME_RE.test(u) ? null : 'Use o formato nome.sobrenome, só letras minúsculas e números.',
      nome: validarTexto(nome, 'nome', true),
      setor: validarTexto(setor, 'setor'),
    };
    setErros(novos);
    if (Object.values(novos).some(Boolean)) return;
    setEnviando(true);
    try {
      const r = await comStepUp(() =>
        callFunction<{ usuario: string; senha_temporaria: string; expira_em: string }>('admin-create-user', {
          usuario: u,
          nome: nome.trim(),
          setor: textoOpcional(setor),
          papel,
        }),
      );
      toast.success('Usuário criado. Copie a senha temporária e envie por um canal reservado.');
      onCriado({ usuario: r.usuario, senha: r.senha_temporaria, expiraEm: r.expira_em });
      setUsuario('');
      setNome('');
      setSetor('');
      setPapel('user');
    } catch (err) {
      if (err instanceof FunctionError && err.code === 'EXISTS_IN_AUTH') onJaExiste(u);
      else if (!(err instanceof AcaoCancelada)) toast.error(functionErrorMessage(err));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Card className="mb-6 p-6">
      <CardTitle title="Cadastrar novo usuário" description="A senha temporária é gerada pelo servidor e mostrada uma única vez." icon={UserPlus} />
      <form onSubmit={submit} className="grid gap-4 md:grid-cols-2 lg:grid-cols-5" noValidate>
        <Field label="Usuário" error={erros.usuario} hint={`Login: nome.sobrenome (e-mail técnico @${DOMINIO_TECNICO})`} className="lg:col-span-1">
          {(p) => <Input {...p} value={usuario} onChange={(e) => setUsuario(e.target.value)} placeholder="nome.sobrenome" autoComplete="off" />}
        </Field>
        <Field label="Nome" error={erros.nome} className="lg:col-span-2">
          {(p) => <Input {...p} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome completo" maxLength={120} />}
        </Field>
        <Field label="Setor" error={erros.setor}>
          {(p) => <Input {...p} value={setor} onChange={(e) => setSetor(e.target.value)} maxLength={120} />}
        </Field>
        <Field label="Papel">
          {(p) => (
            <Select {...p} value={papel} onChange={(e) => setPapel(e.target.value as Papel)}>
              {Object.entries(PAPEIS).map(([valor, rotulo]) => (
                <option key={valor} value={valor}>
                  {rotulo}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <div className="flex items-end lg:col-span-5 lg:justify-end">
          <Button type="submit" loading={enviando}>
            <UserPlus size={16} aria-hidden="true" /> Cadastrar usuário
          </Button>
        </div>
      </form>
    </Card>
  );
}

function EditarUsuarioCard({ usuario, ehVoce, onFechar, onSalvo }: { usuario: UsuarioLinha; ehVoce: boolean; onFechar: () => void; onSalvo: () => void }) {
  const comStepUp = useStepUp();
  const toast = useToast();
  const [nome, setNome] = useState(usuario.name);
  const [setor, setSetor] = useState(usuario.department ?? '');
  const [cargo, setCargo] = useState(usuario.job_title ?? '');
  const [papel, setPapel] = useState<Papel>(usuario.role);
  const [ativo, setAtivo] = useState(usuario.active);
  const [erros, setErros] = useState<Record<string, string | null>>({});
  const [salvando, setSalvando] = useState(false);

  const salvar = async (event: FormEvent) => {
    event.preventDefault();
    const novos = { nome: validarTexto(nome, 'nome', true), setor: validarTexto(setor, 'setor'), cargo: validarTexto(cargo, 'cargo') };
    setErros(novos);
    if (Object.values(novos).some(Boolean)) return;
    setSalvando(true);
    try {
      await comStepUp(() =>
        callFunction('admin-update-user', {
          user_id: usuario.id,
          nome: nome.trim(),
          setor: textoOpcional(setor),
          cargo: textoOpcional(cargo),
          papel,
          ativo,
        }),
      );
      toast.success('Usuário atualizado.');
      onSalvo();
    } catch (err) {
      if (!(err instanceof AcaoCancelada)) toast.error(functionErrorMessage(err));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="mb-6 grid gap-6 xl:grid-cols-2">
      <Card className="p-6">
        <CardTitle
          title={`Editar ${usuario.name}`}
          description={`Usuário de login: ${usuario.username} (não muda)`}
          icon={Pencil}
          action={
            <button type="button" onClick={onFechar} aria-label="Fechar edição" className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
              <X size={18} aria-hidden="true" />
            </button>
          }
        />
        <form onSubmit={salvar} className="grid gap-4 sm:grid-cols-2" noValidate>
          <Field label="Nome" error={erros.nome} className="sm:col-span-2">
            {(p) => <Input {...p} value={nome} onChange={(e) => setNome(e.target.value)} maxLength={120} />}
          </Field>
          <Field label="Setor" error={erros.setor}>
            {(p) => <Input {...p} value={setor} onChange={(e) => setSetor(e.target.value)} maxLength={120} />}
          </Field>
          <Field label="Cargo" error={erros.cargo}>
            {(p) => <Input {...p} value={cargo} onChange={(e) => setCargo(e.target.value)} maxLength={120} />}
          </Field>
          <Field label="Papel" hint={ehVoce ? 'Você não pode remover o seu próprio acesso de administrador.' : undefined}>
            {(p) => (
              <Select {...p} value={papel} onChange={(e) => setPapel(e.target.value as Papel)} disabled={ehVoce}>
                {Object.entries(PAPEIS).map(([valor, rotulo]) => (
                  <option key={valor} value={valor}>
                    {rotulo}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <div className="flex items-end pb-2">
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} disabled={ehVoce} className="h-4 w-4 accent-[oklch(var(--brand))]" />
              Ativo
            </label>
          </div>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button variant="secondary" onClick={onFechar} disabled={salvando}>
              Cancelar
            </Button>
            <Button type="submit" loading={salvando}>
              Salvar
            </Button>
          </div>
        </form>
      </Card>
      <ProfileAuditPanel userId={usuario.id} />
    </div>
  );
}

function AlterarSenhaCard({ usuario, onFechar, onGerar }: { usuario: UsuarioLinha; onFechar: () => void; onGerar: () => void }) {
  return (
    <Card id={`reset-${usuario.id}`} className="mb-6 border-brand/50 p-6">
      <CardTitle
        title={`Alterar senha de ${usuario.name}`}
        icon={KeyRound}
        action={
          <button type="button" onClick={onFechar} aria-label="Fechar" className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
            <X size={18} aria-hidden="true" />
          </button>
        }
      />
      <p className="text-sm text-muted-foreground">
        A senha atual deixa de valer e as sessões do usuário são encerradas. O portal cria 12 caracteres com letras maiúsculas e minúsculas, números e caractere especial, sem sequência, e não grava o texto. Envie por um canal reservado. No próximo acesso, a troca é obrigatória.
      </p>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onFechar}>
          Cancelar
        </Button>
        <Button onClick={onGerar}>
          <KeyRound size={16} aria-hidden="true" /> Gerar senha
        </Button>
      </div>
    </Card>
  );
}

export default function UsuariosPage() {
  const { perfil } = useAuth();
  const comStepUp = useStepUp();
  const toast = useToast();
  const location = useLocation();
  const navigate = useNavigate();
  const [usuarios, setUsuarios] = useState<UsuarioLinha[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [editando, setEditando] = useState<UsuarioLinha | null>(null);
  const [resetando, setResetando] = useState<UsuarioLinha | null>(null);
  const [confirmacao, setConfirmacao] = useState<Confirmacao | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [senha, setSenha] = useState<SenhaGerada | null>(null);
  const [vinculando, setVinculando] = useState<{ sugestao: string | null } | null>(null);

  const carregar = useCallback(async () => {
    const { data, error } = await supabase.rpc('pp_admin_list_users');
    setCarregando(false);
    if (error) {
      setErro('Não foi possível carregar os usuários.');
      return;
    }
    setErro(null);
    setUsuarios((data ?? []) as UsuarioLinha[]);
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  useEffect(() => {
    const match = location.hash.match(/^#reset-([0-9a-f-]{36})$/i);
    if (!match || usuarios.length === 0) return;
    const alvo = usuarios.find((u) => u.id === match[1]);
    if (alvo && alvo.id !== perfil?.id) {
      setResetando(alvo);
      setEditando(null);
      requestAnimationFrame(() => document.getElementById(`reset-${alvo.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    }
  }, [location.hash, usuarios, perfil?.id]);

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return usuarios;
    return usuarios.filter((u) =>
      [u.name, u.username, PAPEIS[u.role], u.department ?? ''].some((v) => v.toLowerCase().includes(termo)),
    );
  }, [usuarios, busca]);

  const fecharReset = () => {
    setResetando(null);
    if (location.hash) navigate('/usuarios', { replace: true });
  };

  const executar = async (reason?: string) => {
    if (!confirmacao) return;
    const { tipo, usuario } = confirmacao;
    setOcupado(true);
    try {
      if (tipo === 'ativo') {
        await comStepUp(() =>
          callFunction('admin-update-user', {
            user_id: usuario.id,
            nome: usuario.name,
            setor: usuario.department,
            cargo: usuario.job_title,
            papel: usuario.role,
            ativo: !usuario.active,
          }),
        );
        toast.success(usuario.active ? 'Usuário desativado. As sessões no portal foram encerradas.' : 'Usuário reativado.');
      } else if (tipo === 'mfa') {
        await comStepUp(() => callFunction('admin-reset-mfa', { user_id: usuario.id, motivo: reason }));
        toast.success('Autenticador removido. O usuário cadastra de novo no próximo acesso.');
      } else if (tipo === 'excluir') {
        await comStepUp(() => callFunction('admin-delete-user', { user_id: usuario.id, confirmacao: usuario.username }));
        toast.success(
          usuario.shared_account
            ? 'Acesso ao portal removido. A conta corporativa continua valendo no outro sistema.'
            : 'Usuário excluído. A trilha de auditoria permanece.',
        );
        if (editando?.id === usuario.id) setEditando(null);
      } else if (tipo === 'senha') {
        const r = await comStepUp(() =>
          callFunction<{ usuario: string; senha_temporaria: string; expira_em: string }>('admin-reset-password', { user_id: usuario.id, motivo: reason }),
        );
        setSenha({ usuario: r.usuario, senha: r.senha_temporaria, expiraEm: r.expira_em });
        fecharReset();
        window.dispatchEvent(new Event(EVENTO_AVISOS));
        toast.success('Senha temporária gerada. Copie e envie por um canal reservado.');
      }
      setConfirmacao(null);
      await carregar();
    } catch (err) {
      if (!(err instanceof AcaoCancelada)) toast.error(functionErrorMessage(err));
    } finally {
      setOcupado(false);
    }
  };

  const colunas: Column<UsuarioLinha>[] = [
    {
      key: 'nome',
      header: 'Nome',
      render: (u) => (
        <div>
          <p className="font-medium text-foreground">{u.name}</p>
          <div className="mt-0.5 flex flex-wrap gap-1">
            {!u.active && <Badge tone="destructive">Inativo</Badge>}
            {u.active && u.must_change_password && <Badge tone="warning">Troca de senha pendente</Badge>}
            {u.shared_account && <Badge tone="info">Conta compartilhada</Badge>}
          </div>
        </div>
      ),
    },
    { key: 'usuario', header: 'Usuário', render: (u) => <span className="font-mono text-xs">{u.username}</span> },
    { key: 'papel', header: 'Papel', render: (u) => <Badge tone={u.role === 'admin' ? 'brand' : 'neutral'}>{PAPEIS[u.role]}</Badge> },
    { key: 'setor', header: 'Setor', render: (u) => u.department ?? '—' },
    { key: 'criado', header: 'Criado em', render: (u) => formatarData(u.created_at) },
    { key: 'mfa', header: 'MFA', render: (u) => (u.mfa_enabled ? <Badge tone="success">Ativo</Badge> : <Badge tone="warning">Pendente</Badge>) },
    {
      key: 'acoes',
      header: 'Ações',
      className: 'text-right',
      render: (u) => {
        const voce = u.id === perfil?.id;
        const btn = 'rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30';
        return (
          <div className="flex justify-end gap-0.5">
            <button type="button" className={btn} onClick={() => { setEditando(u); setResetando(null); }} aria-label={`Editar ${u.username}`} title="Editar">
              <Pencil size={16} aria-hidden="true" />
            </button>
            <button
              type="button"
              className={btn}
              disabled={voce || u.shared_account}
              onClick={() => { setResetando(u); setEditando(null); }}
              aria-label={`Alterar senha de ${u.username}`}
              title={u.shared_account ? 'Conta compartilhada: a senha é a mesma do outro sistema' : 'Alterar senha'}
            >
              <KeyRound size={16} aria-hidden="true" />
            </button>
            <button type="button" className={btn} disabled={voce || !u.mfa_enabled} onClick={() => setConfirmacao({ tipo: 'mfa', usuario: u })} aria-label={`Resetar MFA de ${u.username}`} title="Resetar MFA">
              <ShieldOff size={16} aria-hidden="true" />
            </button>
            <button
              type="button"
              className={btn}
              disabled={voce}
              onClick={() => setConfirmacao({ tipo: 'ativo', usuario: u })}
              aria-label={`${u.active ? 'Desativar' : 'Reativar'} ${u.username}`}
              title={u.active ? 'Desativar' : 'Reativar'}
            >
              <Power size={16} aria-hidden="true" />
            </button>
            <button type="button" className={`${btn} hover:text-destructive`} disabled={voce} onClick={() => setConfirmacao({ tipo: 'excluir', usuario: u })} aria-label={`Excluir ${u.username}`} title="Excluir">
              <Trash2 size={16} aria-hidden="true" />
            </button>
          </div>
        );
      },
    },
  ];

  const c = confirmacao;

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Gestão de usuários"
        subtitle="Cadastre, edite e controle o acesso ao portal."
        action={
          <Button variant="secondary" onClick={() => setVinculando({ sugestao: null })}>
            <Link2 size={16} aria-hidden="true" /> Vincular conta existente
          </Button>
        }
      />
      <NovoUsuarioCard
        onCriado={(s) => {
          setSenha(s);
          void carregar();
        }}
        onJaExiste={(usuario) => setVinculando({ sugestao: usuario })}
      />
      {vinculando && (
        <VincularContaModal
          sugestao={vinculando.sugestao}
          onClose={() => setVinculando(null)}
          onVinculado={() => {
            setVinculando(null);
            void carregar();
          }}
        />
      )}

      {editando && (
        <EditarUsuarioCard
          key={editando.id}
          usuario={editando}
          ehVoce={editando.id === perfil?.id}
          onFechar={() => setEditando(null)}
          onSalvo={() => {
            setEditando(null);
            void carregar();
          }}
        />
      )}
      {resetando && <AlterarSenhaCard usuario={resetando} onFechar={fecharReset} onGerar={() => setConfirmacao({ tipo: 'senha', usuario: resetando })} />}

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <p className="text-sm font-semibold text-foreground">{usuarios.length} usuário(s)</p>
          <div className="relative w-full sm:w-72">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome, usuário, papel ou setor" className="pl-9" aria-label="Buscar usuários" />
          </div>
        </div>
        {erro ? (
          <div className="p-5">
            <Alert tone="error">{erro}</Alert>
          </div>
        ) : (
          <Table columns={colunas} rows={filtrados} rowKey={(u) => u.id} loading={carregando} emptyTitle="Nenhum usuário encontrado" emptyText="Ajuste a busca." />
        )}
      </Card>

      <ConfirmDialog
        open={c?.tipo === 'ativo'}
        title={c?.usuario.active ? 'Desativar usuário' : 'Reativar usuário'}
        description={
          c?.usuario.active
            ? `${c.usuario.name} perde o acesso ao portal agora e as sessões abertas nele são encerradas.${
                c.usuario.shared_account ? ' A conta corporativa continua valendo no outro sistema.' : ''
              } Desativar é a ação recomendada no lugar de excluir.`
            : `${c?.usuario.name} volta a acessar o portal com a senha atual.`
        }
        confirmLabel={c?.usuario.active ? 'Desativar' : 'Reativar'}
        destructive={c?.usuario.active}
        busy={ocupado}
        onConfirm={() => void executar()}
        onCancel={() => setConfirmacao(null)}
      />
      <ConfirmDialog
        open={c?.tipo === 'mfa'}
        title="Resetar MFA"
        description={`Remove o autenticador de ${c?.usuario.name} e encerra as sessões no portal. No próximo acesso, o cadastro é refeito.${
          c?.usuario.shared_account ? ' Conta compartilhada: o autenticador também é removido do outro sistema.' : ''
        }`}
        confirmLabel="Resetar MFA"
        destructive
        busy={ocupado}
        reasonMinLength={5}
        onConfirm={(motivo) => void executar(motivo)}
        onCancel={() => setConfirmacao(null)}
      />
      <ConfirmDialog
        open={c?.tipo === 'senha'}
        title="Gerar senha temporária"
        description={`A senha atual de ${c?.usuario.name} deixa de valer e as sessões são encerradas.`}
        confirmLabel="Gerar senha"
        busy={ocupado}
        reasonMinLength={5}
        onConfirm={(motivo) => void executar(motivo)}
        onCancel={() => setConfirmacao(null)}
      />
      <ConfirmDialog
        open={c?.tipo === 'excluir'}
        title={c?.usuario.shared_account ? 'Remover acesso ao portal' : 'Excluir definitivamente'}
        description={
          c?.usuario.shared_account
            ? 'Conta compartilhada: só o acesso ao portal é removido. A conta corporativa e a senha continuam valendo no outro sistema. A trilha de auditoria permanece.'
            : 'Use só em pedidos de eliminação (LGPD). Para tirar o acesso, prefira Desativar. A trilha de auditoria permanece.'
        }
        confirmLabel={c?.usuario.shared_account ? 'Remover acesso' : 'Excluir'}
        destructive
        busy={ocupado}
        confirmText={c?.usuario.username}
        confirmTextLabel={`Digite o usuário ${c?.usuario.username ?? ''} para confirmar`}
        onConfirm={() => void executar()}
        onCancel={() => setConfirmacao(null)}
      />

      <SenhaTemporariaModal dados={senha} onClose={() => setSenha(null)} />
    </div>
  );
}
