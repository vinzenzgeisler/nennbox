import { useState } from 'react';
import { AppButton, Banner, Textarea } from '@nennbox/ui';
import type { EntryResponse as Entry } from '@nennbox/contracts';
import type { Outcome } from '../AdminEntriesModel.js';
import { formatMoney } from './entryDetailModel.js';
export function EntryProperties({
  entry,
  busy,
  saveNote,
  onNumber,
}: {
  entry: Entry;
  busy: boolean;
  saveNote: (text: string) => Promise<Outcome>;
  onNumber: () => void;
}) {
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const invoice = entry.adminDetails?.invoice;
  return (
    <>
      <section className="nb-entry-properties">
        <h2>Eigenschaften</h2>
        <dl>
          <dt>Startnummer</dt>
          <dd>
            <AppButton tone="ghost" onClick={onNumber}>
              {entry.requestedStartNumber ??
                entry.adminDetails?.startNumber ??
                'Vergeben'}
            </AppButton>
          </dd>
          <dt>Eingang</dt>
          <dd>
            {new Intl.DateTimeFormat('de-DE', {
              day: 'numeric',
              month: 'short',
              hour: '2-digit',
              minute: '2-digit',
              timeZone: 'Europe/Berlin',
            }).format(new Date(entry.createdAt))}
          </dd>
          <dt>Startgeld</dt>
          <dd>
            {invoice ? formatMoney(invoice.totalCents, invoice.currency) : '—'}
          </dd>
          <dt>Status</dt>
          <dd>
            {entry.statusProjection?.dimensions.find(
              (item) => item.key === 'payment',
            )?.label.de ?? '—'}
          </dd>
          {entry.statusProjection?.hints
            .filter((item) => item.present)
            .map((item) => (
              <div key={item.key}>
                <dt>Hinweis</dt>
                <dd>
                  {item.key === 'double_starter'
                    ? 'Doppelstarter'
                    : item.key === 'passenger'
                      ? 'Beifahrer'
                      : 'Nachnennung'}
                </dd>
              </div>
            ))}
        </dl>
      </section>
      {entry.availableActions?.includes('note:internal') && (
        <form
          className="nb-entry-note"
          onSubmit={(event) => {
            event.preventDefault();
            void saveNote(note.trim()).then((result) => {
              if (result.ok) {
                setNote('');
                setError('');
              } else setError(result.message);
            });
          }}
        >
          <h2 id="entry-internal-note-title">Interne Notiz</h2>
          <Textarea
            label="Interne Notiz"
            aria-labelledby="entry-internal-note-title"
            rows={3}
            maxLength={4000}
            placeholder="Nur für das Nennbüro sichtbar"
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
          {error && <Banner tone="error">{error}</Banner>}
          <AppButton disabled={busy || !note.trim()} type="submit">
            Speichern
          </AppButton>
        </form>
      )}
    </>
  );
}
