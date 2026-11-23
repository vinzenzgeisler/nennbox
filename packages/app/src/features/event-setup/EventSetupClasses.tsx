import { useState } from 'react';
import { formatFeeText } from '../../format.js';
import { AppEditorRow, AppTextInput, AppSelect, AppButton } from '@nennbox/ui';
import type {
  SetupDraft,
  VehicleType,
  PassengerMode,
} from './eventSetupApi.js';
const vehicleTypes: Array<{ value: VehicleType; label: string }> = [
  { value: 'car', label: 'Auto' },
  { value: 'motorcycle', label: 'Motorrad' },
  { value: 'kart', label: 'Kart' },
  { value: 'other', label: 'Andere' },
];

export function EventSetupClasses({
  draft,
  setDraft,
  busy,
}: {
  draft: SetupDraft;
  setDraft: (draft: SetupDraft | ((current: SetupDraft) => SetupDraft)) => void;
  busy: boolean;
}) {
  const [closedClasses, setClosedClasses] = useState<number[]>(
    draft.classes.flatMap((item, index) => (item.id ? [index] : [])),
  );
  const updateClass = (
    index: number,
    patch: Partial<SetupDraft['classes'][number]>,
  ) =>
    setDraft((current) => ({
      ...current,
      classes: current.classes.map((item, position) =>
        position === index ? { ...item, ...patch } : item,
      ),
    }));

  return (
    <>
      {' '}
      {draft.classes.map((item, index) => (
        <AppEditorRow
          key={item.id ?? index}
          label={`Klasse ${index + 1} bearbeiten`}
          preview={item.name || 'Neue Klasse'}
          description={`${item.code || 'Kürzel'} · ${formatFeeText(item.fee)}`}
          open={!closedClasses.includes(index)}
          onToggle={() =>
            setClosedClasses((current) =>
              current.includes(index)
                ? current.filter((value) => value !== index)
                : [...current, index],
            )
          }
        >
          <AppTextInput
            required
            label="Klassenname"
            value={item.name}
            onChange={(event) =>
              updateClass(index, { name: event.target.value })
            }
          />
          <AppTextInput
            required
            label="Kürzel"
            pattern="[A-Za-z0-9][A-Za-z0-9_-]*"
            value={item.code}
            onChange={(event) =>
              updateClass(index, { code: event.target.value.trim() })
            }
          />
          <AppSelect
            label="Fahrzeugtyp"
            value={item.vehicleType}
            onChange={(event) =>
              updateClass(index, {
                vehicleType:
                  parseVehicleType(event.target.value) ?? item.vehicleType,
              })
            }
          >
            {vehicleTypes.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </AppSelect>
          <AppSelect
            label="Beifahrer"
            value={item.passengerMode ?? 'optional'}
            onChange={(event) =>
              updateClass(index, {
                passengerMode: event.target.value as PassengerMode,
              })
            }
          >
            <option value="optional">Optional</option>
            <option value="required">Pflicht</option>
            <option value="none">Nein</option>
          </AppSelect>
          <AppTextInput
            required
            label="Startgeld in Euro"
            data-fee
            inputMode="decimal"
            pattern="[0-9]+([,.][0-9]{1,2})?"
            title="Betrag wie 25,00 oder 25.00 eingeben."
            value={item.fee}
            onChange={(event) =>
              updateClass(index, { fee: event.target.value })
            }
          />
          {draft.classes.length > 1 && (
            <AppButton
              type="button"
              tone="secondary"
              disabled={busy || Boolean(item.id)}
              onClick={() => {
                setClosedClasses((current) =>
                  current
                    .filter((value) => value !== index)
                    .map((value) => (value > index ? value - 1 : value)),
                );
                setDraft((current) => ({
                  ...current,
                  classes: current.classes.filter(
                    (_, position) => position !== index,
                  ),
                }));
              }}
            >
              Klasse entfernen
            </AppButton>
          )}
        </AppEditorRow>
      ))}
    </>
  );
}

function parseVehicleType(value: string): VehicleType | null {
  return vehicleTypes.find((type) => type.value === value)?.value ?? null;
}
