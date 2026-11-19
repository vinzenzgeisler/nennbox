import { useState } from 'react';
import { Button, DetailSection, Banner, Field } from '@racepilot/ui';
import type { EntryResponse as Entry } from '@racepilot/contracts';
import { adminFetch } from '../../../auth.js';

export function EntryStartNumber({
  entry,
  onUpdated,
}: {
  entry: Entry;
  onUpdated: (entry: Entry) => void;
}) {
  const [value, setValue] = useState(entry.requestedStartNumber ?? '');
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
      onUpdated({ ...entry, requestedStartNumber: value.trim() || null });
      setMessage('Startnummer gespeichert.');
    } catch {
      setMessage('Nummer belegt oder außerhalb des konfigurierten Bereichs.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <DetailSection title="Startnummer">
      <p>Wunschnummer oder manuelle Vergabe durch den Veranstalter.</p>
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
