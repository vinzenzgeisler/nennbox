import type { ReactNode } from 'react';
import { AppButton, AppSection, AppTextInput, AppTextarea } from '@nennbox/ui';
import type { SetupDraft } from './eventSetupApi.js';

export function EventOrganizerFields({
  draft,
  setDraft,
  busy,
  onClearRecipient,
  paymentSettings,
}: {
  draft: SetupDraft;
  setDraft: (draft: SetupDraft | ((current: SetupDraft) => SetupDraft)) => void;
  busy: boolean;
  onClearRecipient: () => void;
  /** Payment methods and refund rule of this event. */
  paymentSettings: ReactNode;
}) {
  return (
    <>
      <section id="event-setup-organizer" className="nb-app-anchor">
        <AppSection title="Veranstalter und Zahlungsempfänger">
          <AppTextInput
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
          <AppTextarea
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
          <AppTextInput
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
          <AppTextarea
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
          <AppTextInput
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
          <AppTextInput
            label="BIC (optional)"
            maxLength={11}
            autoComplete="off"
            value={draft.bic}
            onChange={(event) =>
              setDraft((current) => ({ ...current, bic: event.target.value }))
            }
          />
          <AppButton
            type="button"
            tone="secondary"
            disabled={busy || (!draft.iban && !draft.accountName)}
            onClick={() =>
              draft.recipientRemoval
                ? setDraft((current) => ({
                    ...current,
                    recipientRemoval: false,
                  }))
                : onClearRecipient()
            }
          >
            {draft.recipientRemoval
              ? 'Entfernen rückgängig machen'
              : 'Bankverbindung entfernen'}
          </AppButton>
        </AppSection>
        {paymentSettings}
      </section>
      <section id="event-setup-arrival" className="nb-app-anchor">
        <AppSection title="Anreise und Fahrerlager">
          <AppTextarea
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
          <AppTextarea
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
        </AppSection>
      </section>
    </>
  );
}
