import { AppButton, AppDialog } from '@nennbox/ui';

/** The bank details are organization-wide, so deleting them needs an explicit confirmation at save. */
export function RecipientRemovalDialog({
  open,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <AppDialog
      open={open}
      title="Bankverbindung organisationsweit entfernen?"
      closeLabel="Dialog schließen"
      onClose={onCancel}
      actions={
        <>
          <AppButton tone="secondary" onClick={onCancel}>
            Abbrechen
          </AppButton>
          <AppButton tone="danger" onClick={onConfirm}>
            Entfernen und speichern
          </AppButton>
        </>
      }
    >
      <p>
        Die Bankverbindung wird organisationsweit für alle Veranstaltungen
        entfernt. Möchtest du die Änderung speichern?
      </p>
    </AppDialog>
  );
}
