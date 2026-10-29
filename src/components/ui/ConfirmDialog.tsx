import { useEffect, useState, type ReactNode } from 'react';
import { Button } from './Button';
import { Field, Input } from './Field';
import { Modal } from './Modal';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  busy?: boolean;
  /** Exige digitar este texto exato para habilitar a confirmação. */
  confirmText?: string;
  confirmTextLabel?: string;
  /** Exige um motivo com no mínimo N caracteres; o motivo é passado ao onConfirm. */
  reasonMinLength?: number;
  reasonLabel?: string;
  onConfirm: (reason?: string) => void;
  onCancel: () => void;
  children?: ReactNode;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  destructive = false,
  busy = false,
  confirmText,
  confirmTextLabel,
  reasonMinLength,
  reasonLabel = 'Motivo',
  onConfirm,
  onCancel,
  children,
}: ConfirmDialogProps) {
  const [typed, setTyped] = useState('');
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (!open) {
      setTyped('');
      setReason('');
    }
  }, [open]);

  const close = () => {
    if (busy) return;
    setTyped('');
    setReason('');
    onCancel();
  };

  const typedOk = !confirmText || typed.trim().toLowerCase() === confirmText.toLowerCase();
  const reasonOk = !reasonMinLength || reason.trim().length >= reasonMinLength;

  return (
    <Modal
      open={open}
      title={title}
      onClose={close}
      locked={busy}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? 'danger' : 'primary'}
            loading={busy}
            disabled={!typedOk || !reasonOk}
            onClick={() => onConfirm(reasonMinLength ? reason.trim() : undefined)}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {description && <div className="text-sm text-muted-foreground">{description}</div>}
      {children}
      {reasonMinLength ? (
        <Field label={reasonLabel} hint={`Mínimo de ${reasonMinLength} caracteres. Vai para o registro de auditoria.`} className="mt-4">
          {(props) => (
            <Input {...props} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} disabled={busy} data-autofocus />
          )}
        </Field>
      ) : null}
      {confirmText ? (
        <Field label={confirmTextLabel ?? `Digite "${confirmText}" para confirmar`} className="mt-4">
          {(props) => (
            <Input {...props} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" disabled={busy} />
          )}
        </Field>
      ) : null}
    </Modal>
  );
}
