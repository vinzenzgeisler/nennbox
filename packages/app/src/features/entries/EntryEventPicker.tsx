import { SelectField } from '@nennbox/ui';
export function EntryEventPicker({
  events,
  eventId,
  onChange,
}: {
  events: readonly { id: string; name: string }[];
  eventId: string;
  onChange: (id: string) => void;
}) {
  return (
    <SelectField
      label="Veranstaltung"
      aria-label="Veranstaltung"
      value={eventId}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">Veranstaltung wählen</option>
      {events.map((event) => (
        <option key={event.id} value={event.id}>
          {event.name}
        </option>
      ))}
    </SelectField>
  );
}
