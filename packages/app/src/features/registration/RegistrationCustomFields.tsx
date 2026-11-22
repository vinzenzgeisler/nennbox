import { useState } from 'react';
import {
  AppButton,
  AppEditorRow,
  AppCheckbox,
  AppTextInput,
  AppSection,
  AppSelect,
  AppTextarea,
} from '@nennbox/ui';
import type {
  RegistrationCustomField,
  RegistrationFormConfig,
} from '@nennbox/contracts';

type UpdateConfig = (
  updater: (current: RegistrationFormConfig) => RegistrationFormConfig,
) => void;
type ChangeConfig = (patch: Partial<RegistrationFormConfig>) => void;
type UpdateCustomField = (
  key: string,
  patch: Partial<RegistrationCustomField>,
) => void;

export function RegistrationCustomFields({
  activeConfig,
  updateConfig,
  updateCustomField,
  change,
}: {
  activeConfig: RegistrationFormConfig;
  updateConfig: UpdateConfig;
  updateCustomField: UpdateCustomField;
  change: ChangeConfig;
}) {
  const [openKeys, setOpenKeys] = useState<Set<string>>(() => new Set());
  return (
    <AppSection
      title="Eigene Felder"
      description="Text-, Auswahl-, Ja/Nein- und sichere Bilddatei-Felder erscheinen im Fahrerschritt."
    >
      {activeConfig.customFields.map((field) => (
        <AppEditorRow
          key={field.key}
          label={`${field.label.de || field.key} bearbeiten`}
          preview={<span>{field.label.de || field.key}</span>}
          description={`${field.type === 'select' ? 'Auswahl' : field.type === 'yes_no' ? 'Ja / Nein' : field.type === 'file' ? 'Bilddatei' : 'Text'} · ${field.required ? 'Pflichtfeld' : 'Freiwillig'}`}
          open={openKeys.has(field.key)}
          onToggle={() =>
            setOpenKeys((current) => {
              const next = new Set(current);
              if (next.has(field.key)) next.delete(field.key);
              else next.add(field.key);
              return next;
            })
          }
        >
          <AppSelect
            label="Typ"
            value={field.type}
            onChange={(event) => {
              const type = event.target
                .value as RegistrationCustomField['type'];
              updateConfig((current) => ({
                ...current,
                customFields: current.customFields.map((item) => {
                  if (item.key !== field.key) return item;
                  const updated = { ...item, type };
                  if (type !== 'select') delete updated.options;
                  return type === 'select'
                    ? {
                        ...updated,
                        type,
                        options: [
                          {
                            value: 'option-1',
                            label: { de: 'Option 1', en: 'Option 1' },
                          },
                        ],
                      }
                    : updated;
                }),
              }));
            }}
          >
            <option value="text">Text</option>
            <option value="select">Auswahl</option>
            <option value="yes_no">Ja / Nein</option>
            <option value="file">Bilddatei</option>
          </AppSelect>
          <AppTextInput label="Feldschlüssel" value={field.key} readOnly />
          <AppTextInput
            label="Bezeichnung · Deutsch"
            maxLength={120}
            value={field.label.de}
            onChange={(event) =>
              updateCustomField(field.key, {
                label: { ...field.label, de: event.target.value },
              })
            }
          />
          <AppTextInput
            label="Bezeichnung · English"
            maxLength={120}
            value={field.label.en}
            onChange={(event) =>
              updateCustomField(field.key, {
                label: { ...field.label, en: event.target.value },
              })
            }
          />
          {field.type === 'select' && (
            <AppTextarea
              label="Optionen · je Zeile Wert|Deutsch|English"
              value={(field.options ?? [])
                .map(
                  (option) =>
                    `${option.value}|${option.label.de}|${option.label.en}`,
                )
                .join('\n')}
              onChange={(event) =>
                updateCustomField(field.key, {
                  options: event.target.value
                    .split('\n')
                    .filter(Boolean)
                    .map((line) => {
                      const [value, de, en] = line.split('|');
                      return {
                        value: value ?? '',
                        label: { de: de ?? '', en: en ?? '' },
                      };
                    }),
                })
              }
            />
          )}
          <AppCheckbox
            label="Pflichtfeld"
            checked={field.required}
            onChange={(event) =>
              updateCustomField(field.key, { required: event.target.checked })
            }
          />
          <AppButton
            type="button"
            tone="danger"
            onClick={() =>
              change({
                customFields: activeConfig.customFields.filter(
                  (item) => item.key !== field.key,
                ),
              })
            }
          >
            Eigenes Feld entfernen
          </AppButton>
        </AppEditorRow>
      ))}
      <AppButton
        type="button"
        tone="secondary"
        disabled={activeConfig.customFields.length >= 30}
        onClick={() => {
          const key = `custom_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
          setOpenKeys((current) => new Set(current).add(key));
          change({
            customFields: [
              ...activeConfig.customFields,
              {
                key,
                type: 'text',
                required: false,
                label: { de: 'Neues Feld', en: 'New field' },
              },
            ],
          });
        }}
      >
        Eigenes Feld hinzufügen
      </AppButton>
    </AppSection>
  );
}
