import { useState } from 'react';
import { AppButton, ReasonDialog } from '@nennbox/ui';
import { words, type ModuleLocale } from './moduleWords.js';
export function ModuleDisableButton({
  locale,
  onConfirm,
}: {
  locale: ModuleLocale;
  onConfirm: (reason: string) => void;
}) {
  const t = words[locale];
  const [open, setOpen] = useState(false);
  return (
    <>
      <AppButton tone="danger" onClick={() => setOpen(true)}>
        {t.disable}
      </AppButton>
      <ReasonDialog
        open={open}
        title={t.disableTitle}
        message={t.confirm}
        reasonLabel={t.reason}
        cancelLabel={t.cancel}
        confirmLabel={t.disable}
        closeLabel={t.close}
        confirmTone="danger"
        reasonMaxLength={500}
        onClose={() => setOpen(false)}
        onConfirm={(reason) => {
          setOpen(false);
          onConfirm(reason);
        }}
      />
    </>
  );
}
