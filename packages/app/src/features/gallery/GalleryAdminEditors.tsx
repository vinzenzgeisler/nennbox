import { useState } from 'react';
import {
  AppActions,
  AppButton,
  AppConfirmAction,
  AppDialog,
  AppFileInput,
  AppSection,
  AppSelectionList,
  AppCheckbox,
  AppTextarea,
  AppView,
  MessageLayout,
} from '@nennbox/ui';

export function GalleryAdminEditors() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState(
    'Hallo {{firstName}}, deine Unterlagen fehlen noch.',
  );
  const [removed, setRemoved] = useState(false);
  return (
    <AppSection title="App-Design · Nachrichten und Verwaltungsdialoge">
      <AppView>
        <MessageLayout
          editor={
            <AppSection title="Nachricht verfassen">
              <AppSelectionList label="Empfänger auswählen">
                <AppCheckbox
                  label="Anja Richter · anja@example.test"
                  defaultChecked
                />
                <AppCheckbox label="Tom Probe · tom@example.test" />
              </AppSelectionList>
              <AppTextarea
                label="Nachricht"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
              />
              <AppFileInput
                label="PDF hinzufügen"
                accept="application/pdf,.pdf"
              />
              <AppActions>
                <AppButton tone="primary" onClick={() => setOpen(true)}>
                  Vorschau öffnen
                </AppButton>
                <AppConfirmAction
                  confirmation={{
                    title: 'Status entfernen?',
                    message: 'Entferne den Beispielstatus.',
                    reasonLabel: 'Grund',
                    cancelLabel: 'Abbrechen',
                    confirmLabel: 'Status entfernen',
                    closeLabel: 'Schließen',
                  }}
                  onConfirm={() => setRemoved(true)}
                >
                  Status entfernen
                </AppConfirmAction>
              </AppActions>
              {removed && <p role="status">Beispielstatus entfernt.</p>}
            </AppSection>
          }
          aside={
            <AppSection title="Nachrichtenvorschau">
              <p>{message}</p>
            </AppSection>
          }
        />
        <AppDialog
          open={open}
          title="Nachrichtenvorschau"
          closeLabel="Schließen"
          onClose={() => setOpen(false)}
          actions={
            <AppButton onClick={() => setOpen(false)}>
              Vorschau schließen
            </AppButton>
          }
        >
          <p>{message}</p>
        </AppDialog>
      </AppView>
    </AppSection>
  );
}
