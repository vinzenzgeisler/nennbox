import { useState } from 'react';
import {
  AdmissionProgress,
  AppButton,
  DetailSection,
  EntryDetailPage,
  EntryMessageList,
  FieldGrid,
  FieldItem,
} from '@nennbox/ui';
export function GalleryEntryDetail() {
  const [tab, setTab] = useState('overview');
  return (
    <section>
      <h2>Seite einer Nennung</h2>
      <EntryDetailPage
        navigation={
          <AppButton tone="ghost" onClick={() => setTab('overview')}>
            Nennungen
          </AppButton>
        }
        header={
          <div className="nb-entry-identity">
            <div>
              <h1>Thomas Berger</h1>
              <p>
                Nr. 42 · Honda RS 250 · M4 · <code>XW7QQ</code>
              </p>
            </div>
          </div>
        }
        progress={
          <AdmissionProgress
            summary="1 von 4 erledigt · 2 Unterlagen fehlen"
            items={[
              { label: 'Startgeld', state: 'done', detail: 'bezahlt' },
              { label: 'Unterlagen', state: 'missing', detail: '2 fehlen' },
              { label: 'Abnahme', state: 'wait', detail: 'vor Ort' },
              { label: 'Haftverzicht', state: 'wait', detail: 'vor Ort' },
            ]}
          />
        }
        tabs={[
          { key: 'overview', label: 'Übersicht' },
          { key: 'documents', label: 'Unterlagen', count: 4 },
          { key: 'messages', label: 'Nachrichten', count: 1 },
          { key: 'history', label: 'Verlauf' },
        ]}
        activeTab={tab}
        onTab={setTab}
        sidebar={
          <section className="nb-entry-properties">
            <h2>Eigenschaften</h2>
            <dl>
              <dt>Startnummer</dt>
              <dd>42</dd>
              <dt>Startgeld</dt>
              <dd>bezahlt</dd>
            </dl>
          </section>
        }
      >
        {tab === 'overview' ? (
          <DetailSection title="Fahrer">
            <FieldGrid>
              <FieldItem label="E-Mail">thomas.berger@beispiel.de</FieldItem>
              <FieldItem label="Telefon">+49 151 0000000</FieldItem>
            </FieldGrid>
          </DetailSection>
        ) : tab === 'messages' ? (
          <EntryMessageList
            items={[
              {
                id: 'sample',
                subject: 'Unterlagen nachreichen',
                recipient: 'thomas.berger@beispiel.de',
                time: 'vor 2 Std.',
                dateTime: '2026-04-12T07:12:00Z',
                status: 'Gesendet',
                template: 'document_reminder',
              },
            ]}
            empty={<p>Keine Nachrichten</p>}
          />
        ) : (
          <p>
            {tab === 'documents'
              ? 'Unterlagen prüfen, ansehen und nachfordern'
              : tab === 'messages'
                ? 'Gesendete Nachrichten'
                : 'Änderungen der Nennung'}
          </p>
        )}
      </EntryDetailPage>
    </section>
  );
}
