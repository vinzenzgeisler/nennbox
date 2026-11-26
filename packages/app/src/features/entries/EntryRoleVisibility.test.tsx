import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { DataTable } from '@nennbox/ui';
import {
  teamRoles,
  type TeamRole,
  type EntryResponse as Entry,
} from '@nennbox/contracts';
import {
  SessionPermissions,
  sessionPermissions,
} from '../shell/SessionPermissions.js';
import { AppShell } from '../shell/AppShell.js';
import { EntryPreview } from '../shell/EntryPreview.js';
import { AdminEntryRow } from './AdminEntryRow.js';
import { EntryActionRail } from './detail/EntryActionRail.js';
import { EntryDocumentsSection } from './detail/EntryDocumentsSection.js';
import type { WorkflowView } from './AdminEntriesModel.js';

const workflow: WorkflowView = {
  statuses: [
    {
      key: 'accepted',
      category: 'accepted',
      labels: { de: 'Zugelassen', en: 'Accepted' },
      color: '',
    },
  ],
  transitions: [{ from: 'pending', to: 'accepted', reasonRequired: true }],
};
function entryFor(role: TeamRole): Entry {
  return {
    id: 'entry',
    eventId: 'event',
    acceptanceStatus: 'pending',
    verificationStatus: 'unverified',
    createdAt: '2026-01-01T00:00:00Z',
    availableActions:
      role === 'admin' || role === 'office'
        ? ['acceptance:accepted', 'message', 'start_number', 'delete']
        : [],
    adminDetails: {
      driver: { name: 'Max Muster' },
      vehicle: { make: 'BMW', model: '2002', imageUrl: null },
      eventClass: { name: 'Klasse A' },
      customAnswers: [],
      invoice: {
        status: 'open',
        totalCents: 100,
        paidCents: 0,
        paymentReference: 'REF-1',
        currency: 'EUR',
        providerPayments: [{ refundableCents: 100 }],
      },
    },
    statusProjection: {
      hints: [],
      dimensions: [
        {
          key: 'entry',
          meaning: 'new',
          required: true,
          label: { de: 'Neu' },
          nextAction: { key: 'entry:accepted', label: { de: 'Zulassen' } },
        },
        {
          key: 'waiver',
          meaning: 'missing',
          required: true,
          label: { de: 'Fehlt' },
          nextAction: {
            key: 'waiver:signed',
            label: { de: 'Haftverzicht bestätigen' },
          },
        },
        {
          key: 'technical_inspection',
          meaning: 'missing',
          required: true,
          nextAction: {
            key: 'technical_inspection:passed',
            label: { de: 'Abnahme bestätigen' },
          },
        },
        { key: 'payment', meaning: 'missing', label: { de: 'Offen' } },
      ],
    },
  } as unknown as Entry;
}
describe.each(Object.keys(teamRoles) as TeamRole[])('%s visibility', (role) => {
  const permissions = sessionPermissions({ role });
  const write = role === 'admin' || role === 'office';
  const pay = role === 'admin' || role === 'cashier';
  const inspect = write || role === 'scrutineer';
  it('hides unauthorized navigation and header actions', () => {
    const html = renderToStaticMarkup(
      <AppShell permissions={permissions}>
        <p>App</p>
      </AppShell>,
    );
    expect(html.includes('aria-label="Einstellungen"')).toBe(role === 'admin');
    expect(html.includes('aria-label="Nennungsablauf"')).toBe(role === 'admin');
    expect(html.includes('Nachricht schreiben')).toBe(write);
  });
  it('uses entry-specific admission capabilities in the list and preview', () => {
    const entry = entryFor(role);
    const row = renderToStaticMarkup(
      <DataTable headers={[]}>
        <AdminEntryRow
          entry={entry}
          eventId="event"
          selected={null}
          selectedIds={new Set()}
          setSelection={vi.fn()}
          classes={[]}
          workflow={workflow}
          openEntry={vi.fn()}
          onChangeStatus={vi.fn()}
        />
      </DataTable>,
    );
    expect(row.includes('aria-label="Status ändern"')).toBe(write);
    const preview = renderToStaticMarkup(
      <EntryPreview
        entry={entry}
        workflow={workflow}
        busy={false}
        onNextAction={vi.fn()}
        onClose={vi.fn()}
        onOpenDetail={vi.fn()}
        onMessage={vi.fn()}
      />,
    );
    expect(preview.includes('>Zulassen<')).toBe(write);
    expect(preview.includes('Unterlagen anfordern')).toBe(write);
  });
  it('separates admission, inspection, payment and document-review actions in the detail', () => {
    const entry = entryFor(role);
    const html = renderToStaticMarkup(
      <SessionPermissions.Provider value={permissions}>
        <EntryActionRail
          entry={entry}
          workflow={workflow}
          busy={false}
          onStatus={vi.fn()}
          onVerify={vi.fn()}
          onPayment={vi.fn()}
          onDimension={vi.fn()}
          onAdminAction={vi.fn()}
          onPassenger={vi.fn()}
          onMessage={vi.fn()}
        />
        <EntryDocumentsSection
          entry={entry}
          busy={false}
          onDimensionAction={vi.fn()}
          onRecordPayment={vi.fn()}
          onRefundPayment={vi.fn()}
          onReviewDocument={vi.fn()}
          onRejectDocument={vi.fn()}
        />
      </SessionPermissions.Provider>,
    );
    expect(html.includes('>Zulassen<')).toBe(write);
    expect(html.includes('E-Mail verifizieren')).toBe(write);
    expect(html.includes('Nachricht schreiben')).toBe(write);
    expect(html.includes('Zahlung erfassen')).toBe(pay);
    expect(html.includes('Erstattung auslösen')).toBe(pay);
    expect(html.includes('Haftverzicht bestätigen')).toBe(inspect);
    expect(html.includes('Abnahme bestätigen')).toBe(inspect);
  });
});
it('fails closed for unresolved session and omitted entry capabilities', () => {
  expect(sessionPermissions({ role: 'unknown' })).toEqual([]);
  expect(sessionPermissions({ role: 'admin', permissions: [] })).toEqual([]);
  const entry = { ...entryFor('admin'), availableActions: undefined };
  const html = renderToStaticMarkup(
    <EntryActionRail
      entry={entry}
      workflow={workflow}
      busy={false}
      onStatus={vi.fn()}
      onVerify={vi.fn()}
      onPayment={vi.fn()}
      onDimension={vi.fn()}
      onAdminAction={vi.fn()}
      onPassenger={vi.fn()}
      onMessage={vi.fn()}
    />,
  );
  expect(html).not.toContain('<button');
});
