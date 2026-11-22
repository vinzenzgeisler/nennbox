import { EntryResponse } from '@nennbox/contracts';
import { assignedNumber } from '../entryStartNumber.js';
import { useState } from 'react';
import { Button, DetailSection, Banner, Field } from '@nennbox/ui';
import type { EntryResponse as Entry } from '@nennbox/contracts';
import { adminFetch } from '../../../auth.js';

export function EntryStartNumber({
  entry,
  onUpdated,
}: {
  entry: Entry;
  onUpdated: (entry: Entry) => void;
}) {
  const [value, setValue] = useState(assignedNumber(entry) ?? '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const save = async () => {
    setBusy(true);
    setMessage('');
    try {
      const response = await adminFetch(
        `/admin/events/${encodeURIComponent(entry.eventId)}/entries/${encodeURIComponent(entry.id)}/start-number`,
        {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ startNumber: value.trim() || null }),
        },
      );
      if (!response.ok) throw new Error();
      try {
        const detail = await adminFetch(
          `/admin/entries/${encodeURIComponent(entry.id)}`,
        );
        if (!detail.ok) throw new Error();
        onUpdated(EntryResponse.parse(await detail.json()));
      } catch {
        setMessage('Startnummer gespeichert. Bitte lade die Nennung neu.');
        return;
      }
      setMessage('Startnummer gespeichert.');
    } catch {
      setMessage('Nummer belegt oder außerhalb des konfigurierten Bereichs.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <DetailSection title="Startnummer">
      <p>
        Bestätigte Startnummer vergeben oder entfernen. Der Wunsch bleibt
        erhalten.
      </p>
      {message && (
        <Banner
          tone={
            message.includes('nicht') || message.includes('belegt')
              ? 'error'
              : 'info'
          }
        >
          {message}
        </Banner>
      )}
      <Field
        label="Startnummer"
        value={value}
        maxLength={16}
        onChange={(event) => setValue(event.target.value)}
      />
      <Button disabled={busy} onClick={() => void save()}>
        Nummer speichern
      </Button>
    </DetailSection>
  );
}
