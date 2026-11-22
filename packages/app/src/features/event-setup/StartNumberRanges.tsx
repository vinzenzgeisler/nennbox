import { useState } from 'react';
import {
  AppEditorRow,
  AppSection,
  AppButton,
  AppTable,
  AppTextInput,
  AppSelect,
} from '@nennbox/ui';
import type { ClassOption, Mode, Range } from './startNumberApi.js';
import { emptyRange } from './startNumberApi.js';

export function StartNumberRanges({
  ranges,
  classes,
  onChange,
}: {
  ranges: Range[];
  classes: ClassOption[];
  onChange: (ranges: Range[]) => void;
}) {
  const [closed, setClosed] = useState<number[]>(
    ranges.map((_, index) => index),
  );
  const change = (index: number, patch: Partial<Range>) =>
    onChange(
      ranges.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );
  return (
    <AppSection title="Nummernbereiche">
      {ranges.length > 0 && (
        <AppTable headers={['Nummernbereich']}>
          {ranges.map((range, index) => (
            <tr key={range.id ?? index}>
              <td>
                <AppEditorRow
                  label={`Nummernbereich ${index + 1} bearbeiten`}
                  preview={`${range.from || 'Von'} – ${range.to || 'Bis'}`}
                  description={
                    classes.find((item) => item.id === range.classId)?.name ??
                    'Alle Klassen'
                  }
                  open={!closed.includes(index)}
                  onToggle={() =>
                    setClosed((current) =>
                      current.includes(index)
                        ? current.filter((value) => value !== index)
                        : [...current, index],
                    )
                  }
                >
                  <AppSelect
                    label="Gilt für"
                    value={range.classId ?? ''}
                    onChange={(event) =>
                      change(index, { classId: event.target.value || null })
                    }
                  >
                    <option value="">Alle Klassen</option>
                    {classes.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </AppSelect>

                  <AppTextInput
                    label="Von"
                    type="number"
                    min="0"
                    value={range.from}
                    onChange={(event) =>
                      change(index, { from: event.target.value })
                    }
                  />

                  <AppTextInput
                    label="Bis"
                    type="number"
                    min="0"
                    value={range.to}
                    onChange={(event) =>
                      change(index, { to: event.target.value })
                    }
                  />

                  <AppTextInput
                    label="Reserviert (Komma-getrennt)"
                    placeholder="z. B. 7, 13"
                    value={range.reserved}
                    onChange={(event) =>
                      change(index, { reserved: event.target.value })
                    }
                  />

                  <AppSelect
                    label="Vergabe"
                    value={range.mode}
                    onChange={(event) =>
                      change(index, { mode: event.target.value as Mode })
                    }
                  >
                    <option value="driver_choice">Fahrerwunsch</option>
                    <option value="organizer_assigned">
                      Veranstalter vergibt
                    </option>
                    <option value="automatic">Automatisch nächste freie</option>
                  </AppSelect>

                  <AppButton
                    tone="ghost"
                    aria-label="Bereich entfernen"
                    onClick={() => {
                      setClosed((current) =>
                        current
                          .filter((value) => value !== index)
                          .map((value) => (value > index ? value - 1 : value)),
                      );
                      onChange(ranges.filter((_, i) => i !== index));
                    }}
                  >
                    Entfernen
                  </AppButton>
                </AppEditorRow>
              </td>
            </tr>
          ))}
        </AppTable>
      )}
      <AppButton
        tone="ghost"
        onClick={() => onChange([...ranges, emptyRange()])}
      >
        + Nummernbereich hinzufügen
      </AppButton>
    </AppSection>
  );
}
