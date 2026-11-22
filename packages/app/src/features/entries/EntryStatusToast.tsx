import { Toast } from '@nennbox/ui';
export function EntryStatusToast({
  notice,
  clear,
}: {
  notice: { id?: number; message: string; undo?: () => void } | null;
  clear: () => void;
}) {
  if (!notice) return null;
  return (
    <Toast
      key={notice.id ?? notice.message}
      duration={5000}
      dismissLabel="Hinweis schließen"
      onDismiss={clear}
      {...(notice.undo ? { action: 'Rückgängig', onAction: notice.undo } : {})}
    >
      {notice.message}
    </Toast>
  );
}
