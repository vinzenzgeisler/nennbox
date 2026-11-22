import { AppConfirmAction } from '@nennbox/ui';
import { words, type ModuleLocale } from './moduleWords.js';
export function ModuleDisableButton({
  locale,
  onConfirm,
}: {
  locale: ModuleLocale;
  onConfirm: () => void;
}) {
  const t = words[locale];
  return (
    <AppConfirmAction
      confirmation={{
        title: t.disableTitle,
        message: t.confirm,
        reasonLabel: t.reason,
        cancelLabel: t.cancel,
        confirmLabel: t.disable,
        closeLabel: t.close,
      }}
      onConfirm={onConfirm}
    >
      {t.disable}
    </AppConfirmAction>
  );
}
