import { expect, it } from 'vitest';
import {
  organizationId,
  type Entry,
  type EntryWorkflowRevision,
} from '@nennbox/core';
import { createApp } from './index.js';
import { testDeps } from './testing.js';

it('advertises only authorized targets from the pinned workflow, including stable IDs and labels', async () => {
  const org = organizationId('11111111-1111-4111-8111-111111111111');
  const pinned: EntryWorkflowRevision = {
    id: 'revision',
    organizationId: org,
    eventId: 'event',
    version: 1,
    workflow: {
      version: 1,
      statuses: [
        {
          id: 'status_pending',
          key: 'new',
          category: 'pending',
          color: '#64748b',
          labels: { de: 'Neu', en: 'New' },
        },
        {
          id: 'status_admitted',
          key: 'shortlist',
          category: 'accepted',
          color: '#64748b',
          labels: { de: 'Startberechtigt', en: 'Admitted' },
        },
        {
          key: 'denied',
          category: 'rejected',
          color: '#64748b',
          labels: { de: 'Abgesagt', en: 'Rejected' },
        },
      ],
      transitions: [
        { from: 'status_pending', to: 'status_admitted', reasonRequired: true },
        {
          from: 'status_pending',
          to: 'denied',
          reasonRequired: true,
          permission: 'special:reject',
        },
      ],
    },
  };
  for (const write of [false, true]) {
    const app = createApp(
      testDeps({
        config: { deploymentMode: 'community', organizationId: org },
        authenticator: {
          authenticate: async () => ({
            issuer: 'https://id.example',
            subject: 'admin',
          }),
        },
        memberships: {
          resolvePermissions: async () =>
            new Set(['entry:read', ...(write ? ['entry:write'] : [])]),
        },
        entries: {
          getById: async () =>
            ({
              id: 'entry',
              organizationId: org,
              acceptanceStatus: 'status_pending',
            }) as Entry,
        },
        entryWorkflows: { getPinnedForEntry: async () => pinned },
        entryAdminActions: { availableActions: async () => [] },
      }),
    );
    const response = await app.request('/admin/entries/entry');
    expect(response.status).toBe(200);
    expect((await response.json()).acceptanceTransitions).toEqual(
      write
        ? [
            {
              to: 'status_admitted',
              label: 'Startberechtigt',
              category: 'accepted',
            },
          ]
        : [],
    );
  }
});
