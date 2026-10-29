import { useState, type FormEvent } from 'react';
import { KeyRound, ShieldCheck, Smartphone, Trash2, UserRound } from 'lucide-react';
import { z } from 'zod';
import { PAPEIS, SEGURANCA } from '@/config/portal';
import { Alert, Badge, Button, Card, CardTitle, ConfirmDialog, Field, Input, PageHeader, useToast } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { MfaEnroll } from '@/features/auth/MfaEnroll';
import { PasswordChecklist } from '@/features/auth/PasswordChecklist';
import { ProfileAuditPanel } from '@/features/logs/ProfileAuditPanel';
import { formatarData } from '@/features/logs/auditFields';
import { callFunction, functionErrorMessage } from '@/lib/functions';
import { supabase } from '@/lib/supabase';
import { PASSWORD_RULE_TEXT, validatePassword } from '@/shared/passwordPolicy';

// eslint-disable-next-line no-control-regex
const semControle = (v: string) => !/[\u0000-\u001f\u007f]/.test(v);
const opcional = z
  .string()
  .trim()
  .refine(semControle, 'Use só caracteres comuns.')
  .refine((v) => v === '' || (v.length >= 2 && v.length <= 120), 'Use de 2 a 120 caracteres.')
  .transform((v) => (v === '' ? null : v));

const perfilSchema = z.object({
  name: z.string().trim().min(2, 'Use de 2 a 120 caracteres.').max(120, 'Use de 2 a 120 caracteres.').refine(semControle, 'Use só caracteres comuns.'),
  department: opcional,
  job_title: opcional,
});

function DadosCadastrais() {
  const { perfil, papel, recarregar } = useAuth();
  const toast = useToast();
  const [nome, setNome] = useState(perfil?.name ?? '');
  const [setor, setSetor] = useState(perfil?.department ?? '');
  const [cargo, setCargo] = useState(perfil?.job_title ?? '');
  const [erros, setErros] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState(false);

  if (!perfil) return null;

  const salvar = async (event: FormEvent) => {
    event.preventDefault();
    const resultado = perfilSchema.safeParse({ name: nome, department: setor, job_title: cargo });
    if (!resultado.success) {
      const novos: Record<string, string> = {};
      for (const issue of resultado.error.issues) novos[String(issue.path[0])] ??= issue.message;
      setErros(novos);
      return;
    }
    setErros({});
    setSalvando(true);
    const { error } = await supabase.from('pp_profiles').update(resultado.data).eq('id', perfil.id);
    setSalvando(false);
    if (error) {
      toast.error('Não foi possível salvar o perfil.');
      return;
    }
    toast.success('Perfil atualizado.');
    await recarregar();
  };

  return (
    <Card className="p-6">
      <CardTitle title="Dados cadastrais" icon={UserRound} />
      <form onSubmit={salvar} className="space-y-4" noValidate>
        <Field label="Nome" error={erros.name}>
          {(p) => <Input {...p} value={nome} onChange={(e) => setNome(e.target.value)} maxLength={120} />}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Setor" error={erros.department}>
            {(p) => <Input {...p} value={setor} onChange={(e) => setSetor(e.target.value)} maxLength={120} />}
          </Field>
          <Field label="Cargo" error={erros.job_title}>
            {(p) => <Input {...p} value={cargo} onChange={(e) => setCargo(e.target.value)} maxLength={120} />}
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Usuário">{(p) => <Input {...p} value={perfil.username} readOnly disabled />}</Field>
          <Field label="Papel">{(p) => <Input {...p} value={papel ? PAPEIS[papel] : ''} readOnly disabled />}</Field>
          <Field label="Cadastrado em">{(p) => <Input {...p} value={formatarData(perfil.created_at)} readOnly disabled />}</Field>
        </div>
        <Alert tone="info">O nível de acesso é definido pelo administrador e não pode ser alterado por você.</Alert>
        <div className="flex justify-end">
          <Button type="submit" loading={salvando}>
            Salvar
          </Button>
        </div>
      </form>
    </Card>
  );
}

function AlterarSenha() {
  const { fatoresVerificados, recarregar } = useAuth();
  const toast = useToast();
  const [atual, setAtual] = useState('');
  const [nova, setNova] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [codigo, setCodigo] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const temFator = fatoresVerificados.length > 0;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setErro(null);
    if (!atual) return setErro('Informe a senha atual.');
    const problema = validatePassword(nova);
    if (problema) return setErro(problema);
    if (nova !== confirmacao) return setErro('A confirmação não confere com a nova senha.');
    if (nova === atual) return setErro('A nova senha precisa ser diferente da atual.');
    if (temFator && codigo.length !== 6) return setErro('Informe o código de 6 dígitos do aplicativo.');

    setEnviando(true);
    try {
      if (temFator) {
        const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: fatoresVerificados[0].id, code: codigo });
        if (error) throw new Error('Código inválido.');
      }
      await callFunction('change-own-password', { senha_atual: atual, nova_senha: nova });
      await supabase.auth.refreshSession();
      await recarregar();
      setAtual('');
      setNova('');
      setConfirmacao('');
      setCodigo('');
      toast.success('Senha alterada com sucesso.');
    } catch (err) {
      setErro(functionErrorMessage(err));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Card className="p-6">
      <CardTitle title="Alterar senha" description={PASSWORD_RULE_TEXT} icon={KeyRound} />
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Senha atual">
          {(p) => <Input {...p} type="password" value={atual} onChange={(e) => setAtual(e.target.value)} autoComplete="current-password" />}
        </Field>
        <div>
          <Field label="Nova senha">
            {(p) => <Input {...p} type="password" value={nova} onChange={(e) => setNova(e.target.value)} autoComplete="new-password" />}
          </Field>
          <PasswordChecklist value={nova} />
        </div>
        <Field label="Confirme a nova senha">
          {(p) => <Input {...p} type="password" value={confirmacao} onChange={(e) => setConfirmacao(e.target.value)} autoComplete="new-password" />}
        </Field>
        {temFator && (
          <Field label="Código do aplicativo autenticador">
            {(p) => (
              <Input
                {...p}
                value={codigo}
                onChange={(e) => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="000000"
                className="font-mono tracking-[0.4em]"
              />
            )}
          </Field>
        )}
        {erro && (
          <p role="alert" className="text-sm font-medium text-destructive">
            {erro}
          </p>
        )}
        <div className="flex justify-end">
          <Button type="submit" loading={enviando}>
            Alterar senha
          </Button>
        </div>
      </form>
    </Card>
  );
}

function DoisFatores() {
  const { fatoresVerificados, aalAtual, estado, recarregar } = useAuth();
  const toast = useToast();
  const [cadastrando, setCadastrando] = useState(false);
  const [removendo, setRemovendo] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const total = fatoresVerificados.length;
  const podeAdicionar = total < SEGURANCA.MAX_FATORES_MFA && (total === 0 || aalAtual === 'aal2');
  const podeRemover = aalAtual === 'aal2' && (!estado.mfaObrigatorio || total > 1);

  const remover = async () => {
    if (!removendo) return;
    setOcupado(true);
    const { error } = await supabase.auth.mfa.unenroll({ factorId: removendo });
    setOcupado(false);
    if (error) {
      toast.error('Não foi possível remover o autenticador.');
      return;
    }
    void callFunction('mfa-events', { evento: 'MFA_REMOVIDO' }).catch(() => undefined);
    setRemovendo(null);
    toast.success('Autenticador removido.');
    await recarregar();
  };

  return (
    <Card className="p-6">
      <CardTitle
        title="Autenticação em dois fatores"
        description="Código do aplicativo autenticador (TOTP)."
        icon={ShieldCheck}
        action={total > 0 ? <Badge tone="success">Ativo</Badge> : <Badge tone="warning">Pendente</Badge>}
      />
      {cadastrando ? (
        <MfaEnroll
          onDone={() => {
            setCadastrando(false);
            toast.success('Autenticador ativado.');
          }}
          onCancel={() => setCadastrando(false)}
        />
      ) : (
        <div className="space-y-3">
          {total === 0 && <p className="text-sm text-muted-foreground">Nenhum aplicativo cadastrado.</p>}
          {fatoresVerificados.map((fator, index) => (
            <div key={fator.id} className="flex items-center justify-between gap-3 rounded-xl border border-border px-4 py-3">
              <div className="flex items-center gap-3">
                <Smartphone size={18} className="text-muted-foreground" aria-hidden="true" />
                <div>
                  <p className="text-sm font-medium text-foreground">Dispositivo {index + 1}</p>
                  <p className="text-xs text-muted-foreground">Cadastrado em {formatarData(fator.created_at)}</p>
                </div>
              </div>
              {podeRemover && (
                <Button variant="ghost" size="sm" onClick={() => setRemovendo(fator.id)} aria-label={`Remover dispositivo ${index + 1}`}>
                  <Trash2 size={14} aria-hidden="true" /> Remover
                </Button>
              )}
            </div>
          ))}
          {total === 1 && <p className="text-xs text-muted-foreground">Cadastre um segundo celular como plano de recuperação.</p>}
          {podeAdicionar && (
            <Button variant="secondary" onClick={() => setCadastrando(true)}>
              <Smartphone size={16} aria-hidden="true" />
              {total === 0 ? 'Ativar autenticador' : 'Adicionar segundo dispositivo'}
            </Button>
          )}
        </div>
      )}
      <ConfirmDialog
        open={Boolean(removendo)}
        title="Remover autenticador"
        description="Este dispositivo deixa de gerar códigos válidos para o portal."
        confirmLabel="Remover"
        destructive
        busy={ocupado}
        onConfirm={() => void remover()}
        onCancel={() => setRemovendo(null)}
      />
    </Card>
  );
}

export default function PerfilPage() {
  const { perfil, papel } = useAuth();
  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title="Meu perfil" subtitle="Seus dados, senha e autenticação em dois fatores." />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <DadosCadastrais />
        </div>
        <div className="space-y-6">
          <AlterarSenha />
          <DoisFatores />
          {papel === 'admin' && perfil && <ProfileAuditPanel userId={perfil.id} />}
        </div>
      </div>
    </div>
  );
}
