import { Button, DataTable, Field, SelectField } from '@racepilot/ui';
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
  const change = (index: number, patch: Partial<Range>) =>
    onChange(
      ranges.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );
  return (
    <section className="nb-number-ranges" aria-labelledby="number-ranges-title">
      <h3 id="number-ranges-title">Nummernbereiche</h3>
      {ranges.length > 0 && (
        <DataTable
          compact
          className="nb-number-table"
          headers={[
            'Klasse',
            'Von',
            'Bis',
            'Reserviert',
            'Vergabe',
            'Entfernen',
          ]}
        >
          {ranges.map((range, index) => (
            <tr key={range.id ?? index}>
              <td>
                <SelectField
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
                </SelectField>
              </td>
              <td>
                <Field
                  label="Von"
                  type="number"
                  min="0"
                  value={range.from}
                  onChange={(event) =>
                    change(index, { from: event.target.value })
                  }
                />
              </td>
              <td>
                <Field
                  label="Bis"
                  type="number"
                  min="0"
                  value={range.to}
                  onChange={(event) =>
                    change(index, { to: event.target.value })
                  }
                />
              </td>
              <td>
                <Field
                  label="Reserviert (Komma-getrennt)"
                  placeholder="z. B. 7, 13"
                  value={range.reserved}
                  onChange={(event) =>
                    change(index, { reserved: event.target.value })
                  }
                />
              </td>
              <td>
                <SelectField
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
                </SelectField>
              </td>
              <td>
                <Button
                  variant="text"
                  aria-label="Bereich entfernen"
                  onClick={() => onChange(ranges.filter((_, i) => i !== index))}
                >
                  Entfernen
                </Button>
              </td>
            </tr>
          ))}
        </DataTable>
      )}
      <Button
        variant="text"
        className="nb-number-range-add"
        onClick={() => onChange([...ranges, emptyRange()])}
      >
        + Nummernbereich hinzufügen
      </Button>
    </section>
  );
}
