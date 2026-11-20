import { DataTable, Field } from '@nennbox/ui';
import type { ClassOption } from './startNumberApi.js';

export type { ClassOption };

export function ClassCapacities({
  classes,
  onChange,
}: {
  classes: ClassOption[];
  onChange: (classes: ClassOption[]) => void;
}) {
  return (
    <section
      className="nb-class-capacities"
      aria-labelledby="class-capacities-title"
    >
      <h3 id="class-capacities-title">Kapazität pro Klasse</h3>
      <p>Leer lassen, wenn die Klasse nicht begrenzt ist.</p>
      <DataTable
        compact
        className="nb-number-table"
        headers={['Klasse', 'Kapazität']}
      >
        {classes.map((eventClass, index) => (
          <tr key={eventClass.id}>
            <th scope="row">{eventClass.name}</th>
            <td>
              <Field
                label={`Kapazität ${eventClass.name}`}
                type="number"
                min="1"
                placeholder="Unbegrenzt"
                value={eventClass.maxParticipants ?? ''}
                onChange={(event) =>
                  onChange(
                    classes.map((item, i) =>
                      i === index
                        ? {
                            ...item,
                            maxParticipants: event.target.value
                              ? Number(event.target.value)
                              : null,
                          }
                        : item,
                    ),
                  )
                }
              />
            </td>
          </tr>
        ))}
      </DataTable>
    </section>
  );
}
