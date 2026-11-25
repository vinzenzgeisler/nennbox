import {
  AppActions,
  AppNotice,
  AppButton,
  AppCheckbox,
  AppSection,
  AppView,
  AppGrid,
  FormItem,
  AppTextInput,
  AppTextarea,
} from '@nennbox/ui';
import {
  MAX_DOCUMENT_TYPES,
  newDraft,
  type DocumentTypeDraft,
} from './documentTypeModel.js';
import { useEventDocumentSettings } from './useEventDocumentSettings.js';

export function EventDocumentSettings({
  eventId,
  onSaved,
}: {
  eventId: string;
  onSaved?: () => void;
}) {
  const settings = useEventDocumentSettings(eventId, onSaved);
  if (!eventId) return null;
  if (settings.state === 'loading')
    return <p role="status">Unterlagen werden geladen …</p>;
  if (settings.state === 'error')
    return <AppNotice tone="error">{settings.message}</AppNotice>;
  const update = (index: number, patch: Partial<DocumentTypeDraft>) =>
    settings.setTypes(
      settings.types.map((type, position) =>
        position === index ? { ...type, ...patch } : type,
      ),
    );
  return (
    <section className="nb-app-view" aria-label="Nennungsunterlagen">
      <AppView>
        <AppSection
          title="Unterlagentypen"
          description="Aktive Unterlagen erscheinen bei jeder Nennung. Deaktivierte Typen erscheinen nicht bei neuen Nennungen; vorhandene Uploads bleiben im Verlauf erhalten. Orga-Codes werden automatisch kurz und NENNBOX-weit eindeutig vergeben."
        >
          {settings.types.map((type, index) => (
            <FormItem
              key={type.saved ? type.key : `new-${index}`}
              label={`Unterlage ${index + 1}`}
            >
              <AppGrid columns="two">
                <AppTextInput
                  label="Name"
                  value={type.name}
                  maxLength={120}
                  disabled={settings.saving}
                  onChange={(event) =>
                    update(index, { name: event.target.value })
                  }
                />
                <AppCheckbox
                  label="Pflichtunterlage"
                  checked={type.required}
                  disabled={settings.saving}
                  onChange={(event) =>
                    update(index, { required: event.target.checked })
                  }
                />
              </AppGrid>
              <AppTextarea
                label="Hinweis für Teilnehmende"
                value={type.hint}
                maxLength={500}
                disabled={settings.saving}
                onChange={(event) =>
                  update(index, { hint: event.target.value })
                }
              />
              <AppCheckbox
                label="Aktiv"
                checked={type.active}
                disabled={settings.saving}
                onChange={(event) =>
                  update(index, { active: event.target.checked })
                }
              />
              {settings.errors[index] && (
                <AppNotice tone="error">{settings.errors[index]}</AppNotice>
              )}
            </FormItem>
          ))}
          <AppButton
            type="button"
            tone="secondary"
            disabled={
              settings.saving || settings.types.length >= MAX_DOCUMENT_TYPES
            }
            onClick={() => settings.setTypes([...settings.types, newDraft()])}
          >
            Unterlage hinzufügen
          </AppButton>
        </AppSection>
        <AppActions>
          <AppButton
            tone="primary"
            type="button"
            disabled={settings.saving || !settings.valid}
            onClick={() => void settings.save()}
          >
            {settings.saving ? 'Wird gespeichert …' : 'Unterlagen speichern'}
          </AppButton>
        </AppActions>
        {settings.message && (
          <AppNotice tone="error">{settings.message}</AppNotice>
        )}
        {settings.saved && <p role="status">Unterlagen gespeichert.</p>}
      </AppView>
    </section>
  );
}
