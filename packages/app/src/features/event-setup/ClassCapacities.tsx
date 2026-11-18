import { Field } from '@racepilot/ui';

export type ClassOption = {
  id: string;
  name: string;
  maxParticipants: number | null;
};

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
      <div>
        {classes.map((eventClass, index) => (
          <Field
            key={eventClass.id}
            label={eventClass.name}
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
        ))}
      </div>
    </section>
  );
}
