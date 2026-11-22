import { Toast } from '@nennbox/ui';
export function EntryStatusToast({
  notice,
  clear,
}: {
  notice: { message: string; undo?: () => void };
  clear: () => void;
}) {
  return (
    <Toast
      key={notice.message}
      duration={5000}
      dismissLabel="Hinweis schließen"
      onDismiss={clear}
      {...(notice.undo ? { action: 'Rückgängig', onAction: notice.undo } : {})}
    >
      {notice.message}
    </Toast>
  );
}
