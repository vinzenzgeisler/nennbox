import {
  AppButton,
  AppTextInput,
  AppSection,
  AppSelect,
  AppTextarea,
} from '@nennbox/ui';
import { EventSetupClasses } from './EventSetupClasses.js';
import type { FormEvent } from 'react';
import { EventOrganizerFields } from './EventOrganizerFields.js';
import type { SetupDraft } from './eventSetupApi.js';

export function EventSetupForm({
  draft,
  setDraft,
  events,
  busy,
  onResume,
  onReset,
  onClearRecipient,
  onSubmit,
}: {
  draft: SetupDraft;
  setDraft: (draft: SetupDraft | ((current: SetupDraft) => SetupDraft)) => void;
  events: Array<{ id: string; name: string; status: string }>;
  busy: boolean;
  onResume: (id: string) => void;
  onReset: () => void;
  onClearRecipient: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>, open: boolean) => void;
}) {
  return (
    <>
      <div>
        <AppSelect
          label="Gespeicherte Veranstaltung bearbeiten"
          value={draft.id ?? ''}
          disabled={busy}
          onChange={(event) => {
            const id = event.target.value;
            if (id) onResume(id);
            else onReset();
          }}
        >
          <option value="">Neue Veranstaltung einrichten</option>
          {events.map((event) => (
            <option key={event.id} value={event.id}>
              {event.name}
            </option>
          ))}
        </AppSelect>
      </div>
      <form
        className="nb-app-stack"
        onSubmit={(event) => {
          const nativeEvent = event.nativeEvent;
          const submitter =
            nativeEvent instanceof SubmitEvent ? nativeEvent.submitter : null;
          onSubmit(
            event,
            submitter instanceof HTMLButtonElement &&
              submitter.value === 'open',
          );
        }}
        noValidate={false}
      >
        <section id="event-setup-event" className="nb-app-anchor">
          <AppSection title="Veranstaltung">
            <AppTextInput
              required
              label="Name"
              name="event-name"
              value={draft.name}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  name: event.target.value,
                  slug: current.slug || slugify(event.target.value),
                }))
              }
            />
            <AppTextInput
              required
              label="Link-Kürzel"
              name="event-slug"
              pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
              title="Nur Kleinbuchstaben, Zahlen und Bindestriche verwenden."
              value={draft.slug}
              hint="Zum Beispiel: rallye-2027"
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  slug: event.target.value.toLowerCase(),
                }))
              }
            />
            <AppTextInput
              required
              type="date"
              label="Beginn"
              name="starts-on"
              value={draft.startsOn}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  startsOn: event.target.value,
                }))
              }
            />
            <AppTextInput
              required
              type="date"
              label="Ende"
              name="ends-on"
              min={draft.startsOn || undefined}
              value={draft.endsOn}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  endsOn: event.target.value,
                }))
              }
            />
          </AppSection>
        </section>
        <section id="event-setup-classes" className="nb-app-anchor">
          <AppSection title="Klassen und Startgeld">
            <EventSetupClasses
              key={draft.id ?? 'new'}
              draft={draft}
              setDraft={setDraft}
              busy={busy}
            />

            <AppButton
              type="button"
              tone="secondary"
              disabled={busy}
              onClick={() =>
                setDraft((current) => ({
                  ...current,
                  classes: [
                    ...current.classes,
                    { name: '', code: '', fee: '', vehicleType: 'car' },
                  ],
                }))
              }
            >
              Klasse hinzufügen
            </AppButton>
          </AppSection>
        </section>
        <section id="event-setup-terms" className="nb-app-anchor">
          <AppSection title="Teilnahmebedingungen">
            <AppTextarea
              label="Text der Bedingungen"
              rows={7}
              value={draft.terms}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  terms: event.target.value,
                }))
              }
              hint="Für einen Entwurf optional. Vor dem Öffnen der Nennung müssen verwendbare Teilnahmebedingungen hinterlegt sein."
            />
          </AppSection>
        </section>
        <EventOrganizerFields
          draft={draft}
          setDraft={setDraft}
          busy={busy}
          onClearRecipient={onClearRecipient}
        />
        <div
          id="event-setup-actions"
          className="nb-app-inline nb-app-actions nb-app-anchor"
        >
          <AppButton type="submit" tone="secondary" disabled={busy}>
            Entwurf speichern
          </AppButton>
          <AppButton
            type="submit"
            name="setup-action"
            value="open"
            tone="primary"
            disabled={busy}
          >
            Speichern und Nennung öffnen
          </AppButton>
        </div>
      </form>
    </>
  );
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
