import { useState, type ReactNode } from 'react';
import { AppButton } from './AppPrimitives.js';
import { AppDialog } from './AppControls.js';
import { AppTextarea } from './AppView.js';

export type AppConfirmation = {
  title: string;
  message: string;
  reasonLabel: string;
  cancelLabel: string;
  confirmLabel: string;
  closeLabel: string;
};
/** Existing reason-required destructive actions, without changing their API contract. */
export function AppConfirmAction({
  confirmation,
  onConfirm,
  children,
}: {
  confirmation: AppConfirmation;
  onConfirm: () => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  function close() {
    setOpen(false);
    setReason('');
  }
  return (
    <>
      <AppButton tone="danger" onClick={() => setOpen(true)}>
        {children}
      </AppButton>
      <AppDialog
        open={open}
        title={confirmation.title}
        closeLabel={confirmation.closeLabel}
        onClose={close}
        actions={
          <>
            <AppButton onClick={close}>{confirmation.cancelLabel}</AppButton>
            <AppButton
              tone="danger"
              disabled={!reason.trim()}
              onClick={() => {
                close();
                onConfirm();
              }}
            >
              {confirmation.confirmLabel}
            </AppButton>
          </>
        }
      >
        <p>{confirmation.message}</p>
        <AppTextarea
          label={confirmation.reasonLabel}
          value={reason}
          required
          onChange={(event) => setReason(event.target.value)}
        />
      </AppDialog>
    </>
  );
}
