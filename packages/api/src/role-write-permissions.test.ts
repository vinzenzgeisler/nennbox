import { describe, expect, it, vi } from 'vitest';
import {
  createInMemoryModuleActivationRepository,
  createModuleRegistry,
  organizationId,
  permissionsForRole,
  type MembershipRole,
} from '@nennbox/core';
import type { TimingRepository } from '@nennbox/adapter-postgres';
import { createApp } from './app.js';
import type { ApiDeps } from './types.js';
import { testDeps, testRegistration } from './testing.js';
import { timingModule } from './timing-module.js';
import { installTimingRoutes } from './timing.js';

const id = '20000000-0000-4000-8000-000000000001';
const orgId = organizationId('10000000-0000-4000-8000-000000000001');
const roles = ['admin', 'office', 'cashier', 'scrutineer', 'viewer'] as const;
const eventInput = {
  slug: 'rallye-2027',
  name: 'Rallye 2027',
  startsOn: '2027-06-01',
  endsOn: '2027-06-02',
};
const event = {
  ...eventInput,
  id,
  organizationId: orgId,
  status: 'draft' as const,
  registrationOpensAt: null,
  registrationClosesAt: null,
  openedAt: null,
  closedAt: null,
  archivedAt: null,
};
const classInput = {
  name: 'Touring',
  code: 'TOUR',
  vehicleType: 'car',
  sortOrder: 0,
  maxParticipants: null,
  closed: false,
};
const setupInput = {
  event: eventInput,
  classes: [
    {
      ...classInput,
      price: {
        baseCents: 1000,
        additionalEntryAdjustmentCents: 0,
        earlyBirdDeadline: null,
        earlyBirdDiscountCents: 0,
      },
    },
  ].map((item) => ({
    name: item.name,
    code: item.code,
    vehicleType: item.vehicleType,
    price: item.price,
  })),
  terms: [],
};

// Like testDeps: partial ports fail loudly if a scenario reaches an unwired call.
// No fake 500/503 is accepted as evidence that authorization passed.
function port<T extends object>(name: string, wired: Partial<T> = {}): T {
  return new Proxy(wired, {
    get(target, key) {
      if (key === 'then') return undefined;
      if (key in target) return Reflect.get(target, key);
      return () => {
        throw new Error(`Unwired matrix dependency: ${name}.${String(key)}`);
      };
    },
  }) as T;
}

async function build(role: MembershipRole, withEvent = false) {
  const writes = vi.fn();
  const activations = createInMemoryModuleActivationRepository(
    (ctx, eventId) => ctx.organizationId === orgId && eventId === id,
  );
  const timing = port<TimingRepository>('timing', {
    list: async () => [],
    listEntries: async () => [],
    createDraft: async () => null,
    publish: async () => null,
  });
  const deps = testDeps({
    config: { deploymentMode: 'community', organizationId: orgId },
    organizations: { getById: async () => null, update: async () => null },
    events: {
      listByOrganization: async () => [],
      getById: async () => (withEvent ? event : null),
      create: async () => {
        writes();
        return event;
      },
      update: async () => {
        writes();
        return null;
      },
    },
    eventSetup: {
      createSetup: async () => {
        writes();
        return event;
      },
    },
    classes: {
      create: async () => {
        writes();
        return {
          ...classInput,
          vehicleType: 'car',
          id,
          eventId: id,
          organizationId: orgId,
          maxParticipants: null,
          closed: false,
          passengerMode: 'optional',
        };
      },
      update: async () => {
        writes();
        return null;
      },
    },
    pricing: { listByEvent: async () => [] },
    registrationSettings: { update: async (_ctx, settings) => settings },
    registrationFormConfigs: { updateEvent: async () => null },
    publicRegistrationRateLimits: { updateOrganization: async () => ({}) },
    entries: { getById: async () => null },
    entryStatusDimensions: {
      transition: async () => {
        writes();
        return null;
      },
    },
    entryConfirmations: { getByGroup: async () => null },
    paymentRecipients: {
      get: async () => null,
      delete: async () => {
        writes();
      },
    },
    messages: {
      preview: async () => ({
        ok: false,
        error: {
          code: 'event-not-found',
          message: 'Event not found',
        },
      }),
      retryFailed: async () => null,
    },
    team: port<NonNullable<ApiDeps['team']>>('team', {
      invite: async () => {
        writes();
        return id;
      },
      revoke: async () => {
        writes();
      },
      resend: async () => {
        writes();
      },
      change: async () => {
        writes();
      },
    }),
    authenticator: {
      authenticate: async () => ({ issuer: 'test', subject: 'member' }),
    },
    memberships: { resolvePermissions: async () => permissionsForRole(role) },
    objectStorage: port<NonNullable<ApiDeps['objectStorage']>>('storage'),
    paymentProvider:
      port<NonNullable<ApiDeps['paymentProvider']>>('paymentProvider'),
    paymentRefunds: port<NonNullable<ApiDeps['paymentRefunds']>>('refunds', {
      abandonReservation: async () => 'not_found',
      requestReconciliation: async () => 'not_found',
    }),
    startNumbers: port<NonNullable<ApiDeps['startNumbers']>>('startNumbers', {
      assignAll: async () => [],
      promoteNext: async () => null,
    }),
    workbasket: port<NonNullable<ApiDeps['workbasket']>>('workbasket', {
      configure: async () => null,
    }),
    passengers: {
      admin: port<NonNullable<ApiDeps['passengers']>['admin']>(
        'passengerAdmin',
        {
          issueLink: async () => ({ status: 'not_found' }),
        },
      ),
      public:
        port<NonNullable<ApiDeps['passengers']>['public']>('passengerPublic'),
    },
    publicRegistration: testRegistration({}),
    driverPortal: port<NonNullable<ApiDeps['driverPortal']>>('driverPortal'),
    modules: {
      registry: createModuleRegistry([timingModule]),
      activations,
      routes: { timing: (router) => installTimingRoutes(router, timing) },
      publicReads: { timing: async () => null },
    },
  });
  const app = createApp(deps);
  // Enable the real timing module through its real activation repository and API.
  const admin = createApp({
    ...deps,
    memberships: {
      resolvePermissions: async () => permissionsForRole('admin'),
    },
  });
  for (const path of [
    '/admin/organization/modules/timing',
    `/admin/events/${id}/modules/timing`,
  ]) {
    const response = await admin.request(path, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enabled: true }),
    });
    expect(response.status, path).toBe(200);
  }
  return { app, writes };
}

type Access = 'inspect' | 'admin' | 'office' | 'cashier' | 'read';
type RouteCase = {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  access: Access;
  body?: unknown;
};
const route = (
  method: RouteCase['method'],
  path: string,
  access: Access,
  body?: unknown,
): RouteCase => ({ method, path, access, body });

// Expectations are deliberately independent of permissionsForRole and the guards.
const cases: RouteCase[] = [
  route('POST', '/admin/team/invitations', 'admin', {
    email: 'office@example.test',
    role: 'office',
  }),
  route('POST', '/admin/team/invitations/:id/revoke', 'admin'),
  route('POST', '/admin/team/invitations/:id/resend', 'admin'),
  route('PATCH', '/admin/team/members/:id', 'admin', {
    kind: 'role',
    role: 'viewer',
  }),
  route('PATCH', '/admin/organization', 'admin'),
  route('POST', '/admin/events', 'admin', eventInput),
  route('POST', '/admin/events/setup', 'admin', setupInput),
  route('PATCH', '/admin/events/:eventId', 'admin', { name: 'Updated' }),
  route('POST', '/admin/events/:eventId/transitions', 'admin', {
    status: 'open',
  }),
  route('PUT', '/admin/events/:eventId/pricing/:classId', 'admin'),
  route('POST', '/admin/events/:eventId/classes', 'admin', classInput),
  route('PATCH', '/admin/events/:eventId/classes/:classId', 'admin', {
    name: 'Updated',
  }),
  route('PUT', '/admin/events/:eventId/consents', 'admin'),
  route('PUT', '/admin/organization/registration-workflow', 'admin'),
  route('PUT', '/admin/events/:eventId/registration-workflow', 'admin'),
  route('PUT', '/admin/events/:eventId/status-dimensions', 'admin'),
  route('PUT', '/admin/events/:eventId/start-numbers', 'admin'),
  route('POST', '/admin/events/:eventId/start-numbers/assign-all', 'office'),
  route(
    'PUT',
    '/admin/events/:eventId/entries/:entryId/start-number',
    'office',
  ),
  route(
    'POST',
    '/admin/events/:eventId/classes/:classId/waitlist/next',
    'office',
  ),
  route('PUT', '/admin/organization/workbasket/configuration', 'admin'),
  route('PUT', '/admin/events/:eventId/workbasket/configuration', 'admin'),
  route('PUT', '/admin/events/:eventId/entry-document-types', 'office'),
  ...['reviewed', 'rejected'].map((status) =>
    route(
      'POST',
      `/admin/entries/:entryId/documents/:documentId/${status}`,
      'office',
    ),
  ),
  route('POST', '/admin/entries/:entryId/documents', 'office'),
  route('POST', '/admin/entries/:entryId/actions', 'office'),
  route('POST', '/admin/entries/:entryId/transitions', 'office'),
  route(
    'POST',
    '/admin/entries/:entryId/status-dimensions/:dimension/transitions',
    'inspect',
  ),
  route('PUT', '/admin/entries/:entryId/status-hints', 'office'),
  route('PATCH', '/admin/entries/:entryId/driver', 'office'),
  route('PATCH', '/admin/entries/:entryId/vehicle', 'office'),
  route('POST', '/admin/entries/:entryId/passenger', 'office'),
  route('POST', '/admin/entries/:entryId/passenger/link', 'office'),
  route('POST', '/admin/events/:eventId/messages/recipients/preview', 'read'),
  route('POST', '/admin/events/:eventId/messages/templates', 'admin'),
  route('POST', '/admin/events/:eventId/messages/templates/preview', 'read'),
  route('POST', '/admin/events/:eventId/messages/actions/:action', 'office'),
  route('POST', '/admin/events/:eventId/messages/campaigns', 'office'),
  route('POST', '/admin/message-campaigns/:campaignId/retry', 'office'),
  route('POST', '/admin/events/:eventId/messages/attachments', 'office'),
  route('PUT', '/admin/organization/payment-recipient', 'admin'),
  route('DELETE', '/admin/organization/payment-recipient', 'admin'),
  route('POST', '/admin/invoices/:invoiceId/payments', 'cashier'),
  route('POST', '/admin/payments/:paymentId/corrections', 'cashier'),
  route('POST', '/admin/invoices/:invoiceId/refunds', 'cashier'),
  route(
    'POST',
    '/admin/invoices/:invoiceId/refund-reservations/:key/abandon',
    'cashier',
  ),
  route(
    'POST',
    '/admin/invoices/:invoiceId/refund-reservations/:key/reconcile',
    'cashier',
  ),
  route('PUT', '/admin/organization/registration-form-config', 'admin'),
  route('PUT', '/admin/events/:eventId/registration-form-config', 'admin'),
  route('PATCH', '/admin/organization/registration-settings', 'admin'),
  route('POST', '/admin/organization/registration-assets', 'admin'),
  route('PUT', '/admin/organization/public-registration-rate-limits', 'admin'),
  route(
    'PUT',
    '/admin/events/:eventId/public-registration-rate-limits',
    'admin',
  ),
  route('PUT', '/admin/events/:eventId/driver-portal-fields', 'admin'),
  // Existing read-authorized POSTs enqueue artifacts; pin that behavior explicitly.
  route('GET', '/admin/events/:eventId/entries.csv', 'read'),
  route('POST', '/admin/events/:eventId/entries.csv', 'read'),
  route(
    'POST',
    '/admin/events/:eventId/registration-groups/:groupId/confirmation',
    'read',
  ),
  route('PATCH', '/admin/organization/modules/:moduleId', 'admin', {
    enabled: true,
  }),
  route('PATCH', '/admin/events/:eventId/modules/:moduleId', 'admin', {
    enabled: true,
  }),
  ...[
    '/measurements',
    '/measurements/csv',
    '/measurements/:measurementId/corrections',
    '/results/drafts',
    '/results/:version/publish',
  ].map((path) =>
    route('POST', `/admin/events/:eventId/modules/timing${path}`, 'admin'),
  ),
];

const urlFor = (path: string) =>
  path.replace(
    /:([A-Za-z]+)/g,
    (_, key: string) =>
      ({
        moduleId: 'timing',
        dimension: 'technical_inspection',
        action: 'remind-open-payments',
        version: '1',
      })[key] ?? id,
  );
const keyFor = ({ method, path }: Pick<RouteCase, 'method' | 'path'>) =>
  `${method} ${path}`;

describe('writing admin route role matrix (#240)', () => {
  it.each(roles)(
    'exposes the canonical %s membership role marker',
    async (role) => {
      const { app } = await build(role);
      const response = await app.request('/admin/session');
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ role });
      expect(
        [...permissionsForRole(role)].filter((permission) =>
          permission.startsWith('role:'),
        ),
      ).toEqual([`role:${role}`]);
    },
  );

  it('enumerates every mounted writing admin endpoint, including optional modules', async () => {
    const { app } = await build('admin');
    const mounted = [
      ...new Set(
        app.routes
          .filter(
            (r) =>
              r.path.startsWith('/admin/') &&
              (['POST', 'PUT', 'PATCH', 'DELETE'].includes(r.method) ||
                (r.method === 'GET' &&
                  r.path === '/admin/events/:eventId/entries.csv')),
          )
          .map((r) => `${r.method} ${r.path}`),
      ),
    ].sort();
    expect(cases.map(keyFor).sort()).toEqual(mounted);
  });

  describe.each(roles)('%s', (role) => {
    it.each(['technical_inspection', 'waiver'])(
      'checks entry:inspect for a valid %s transition',
      async (dimension) => {
        const { app, writes } = await build(role);
        const response = await app.request(
          `/admin/entries/${id}/status-dimensions/${dimension}/transitions`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              status: dimension === 'waiver' ? 'f_signed' : 'passed',
              reason: 'Checked on site',
            }),
          },
        );
        const allowed = ['admin', 'office', 'scrutineer'].includes(role);
        expect(response.status).toBe(allowed ? 404 : 403);
        expect(writes).toHaveBeenCalledTimes(allowed ? 1 : 0);
      },
    );

    it.each(cases)('$method $path ($access)', async (testCase) => {
      const { app, writes } = await build(
        role,
        testCase.method === 'POST' &&
          testCase.path === '/admin/events/:eventId/classes',
      );
      const response = await app.request(urlFor(testCase.path), {
        method: testCase.method,
        headers: { 'content-type': 'application/json' },
        ...(testCase.method === 'GET'
          ? {}
          : { body: JSON.stringify(testCase.body ?? {}) }),
      });
      const body = response.status === 204 ? null : await response.json();
      const allowed =
        role === 'admin' ||
        testCase.access === 'read' ||
        (testCase.access === 'inspect' &&
          ['office', 'scrutineer'].includes(role)) ||
        (role === 'office' && testCase.access === 'office') ||
        (role === 'cashier' && testCase.access === 'cashier');
      if (!allowed) {
        expect(response.status, JSON.stringify(body)).toBe(403);
        expect(writes).not.toHaveBeenCalled();
      } else {
        expect(response.status, JSON.stringify(body)).not.toBe(401);
        expect(response.status, JSON.stringify(body)).not.toBe(403);
        expect(response.status, JSON.stringify(body)).toBeLessThan(500);
        expect(body).not.toEqual({ error: 'Unavailable' });
      }
    });
  });
});
