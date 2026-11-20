import { Button, FormSection, TextInput, Textarea } from '@nennbox/ui';
import type { SetupDraft } from './eventSetupApi.js';

export function EventOrganizerFields({
  draft,
  setDraft,
  busy,
  onClearRecipient,
}: {
  draft: SetupDraft;
  setDraft: (draft: SetupDraft | ((current: SetupDraft) => SetupDraft)) => void;
  busy: boolean;
  onClearRecipient: () => void;
}) {
  return (
    <>
      <section id="event-setup-organizer" className="event-setup-section">
        <FormSection title="Veranstalter und Zahlungsempfänger">
          <TextInput
            label="Veranstaltername"
            value={draft.organizerName}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                organizerName: event.target.value,
              }))
            }
            hint="Für diese Veranstaltung; leer bedeutet Organisationsname."
          />
          <Textarea
            label="Veranstalteranschrift"
            rows={3}
            maxLength={1000}
            value={draft.organizerAddress}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                organizerAddress: event.target.value,
              }))
            }
          />
          <p>
            Die Bankverbindung gilt für die Organisation und erscheint nur in
            Zahlungsunterlagen für Teilnehmende.
          </p>
          <TextInput
            label="Name des Zahlungsempfängers"
            maxLength={70}
            value={draft.accountName}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                accountName: event.target.value,
              }))
            }
          />
          <Textarea
            label="Anschrift des Zahlungsempfängers"
            rows={3}
            maxLength={1000}
            value={draft.recipientAddress}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                recipientAddress: event.target.value,
              }))
            }
          />
          <TextInput
            label="IBAN"
            autoComplete="off"
            value={draft.iban}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                iban: event.target.value,
              }))
            }
            hint="IBAN wird bei Speicherung geprüft."
          />
          <TextInput
            label="BIC (optional)"
            maxLength={11}
            autoComplete="off"
            value={draft.bic}
            onChange={(event) =>
              setDraft((current) => ({ ...current, bic: event.target.value }))
            }
          />
          <Button
            type="button"
            variant="secondary"
            size={40}
            disabled={busy || (!draft.iban && !draft.accountName)}
            onClick={onClearRecipient}
          >
            Bankverbindung entfernen
          </Button>
        </FormSection>
      </section>
      <section id="event-setup-arrival" className="event-setup-section">
        <FormSection title="Anreise und Fahrerlager">
          <Textarea
            label="Anreisehinweise"
            rows={5}
            maxLength={10000}
            value={draft.arrivalNotes}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                arrivalNotes: event.target.value,
              }))
            }
            hint="Im öffentlichen Nennformular sichtbar."
          />
          <Textarea
            label="Fahrerlagerhinweise"
            rows={5}
            maxLength={10000}
            value={draft.paddockNotes}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                paddockNotes: event.target.value,
              }))
            }
            hint="Im öffentlichen Nennformular sichtbar."
          />
        </FormSection>
      </section>
    </>
  );
}
