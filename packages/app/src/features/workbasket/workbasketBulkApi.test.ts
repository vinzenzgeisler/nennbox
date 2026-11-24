import { beforeEach, expect, it, vi } from 'vitest';
import { executeAdmissions, prepareAdmissions } from './workbasketBulkApi.js';
import { request } from '../entries/AdminEntriesModel.js';
vi.mock('../entries/AdminEntriesModel.js', () => ({ request: vi.fn() }));
const eventId = '10000000-0000-4000-8000-000000000001';
const entryId = '10000000-0000-4000-8000-000000000002';
const secondId = '10000000-0000-4000-8000-000000000003';
const entry = (id = entryId) => ({
  id,
  eventId,
  organizationId: eventId,
  classId: eventId,
  registrationGroupId: eventId,
  driverPersonId: eventId,
  vehicleId: eventId,
  verificationStatus: 'verified',
  acceptanceStatus: 'open',
  requestedStartNumber: null,
  priceSnapshotVersion: null,
  formSnapshotVersion: null,
  createdAt: '2026-11-01T00:00:00Z',
  deletedAt: null,
  deletionReason: null,
  availableActions: ['acceptance:approved'],
  acceptanceTransitions: [
    { to: 'approved', label: 'Startberechtigt', category: 'accepted' },
  ],
});
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });
const tasks = (...ids: string[]) =>
  response({ tasks: ids.map((id) => ({ ruleId: 'ready', entryId: id })) });
beforeEach(() => vi.resetAllMocks());

it('uses only accepted-category targets authorized by each pinned entry workflow', async () => {
  vi.mocked(request)
    .mockResolvedValueOnce(tasks(entryId))
    .mockResolvedValueOnce(response(entry()));
  const prepared = await prepareAdmissions(eventId, [entryId, entryId]);
  expect(prepared.admissions).toEqual([
    { entryId, name: entryId, to: 'approved', label: 'Startberechtigt' },
  ]);
  expect(prepared.results).toEqual([]);
});
it('fails closed without pinned category metadata instead of guessing from literal keys', async () => {
  const value = {
    ...entry(),
    acceptanceTransitions: undefined,
    availableActions: ['acceptance:accepted'],
  };
  vi.mocked(request)
    .mockResolvedValueOnce(tasks(entryId))
    .mockResolvedValueOnce(response(value));
  const prepared = await prepareAdmissions(eventId, [entryId]);
  expect(prepared.admissions).toEqual([]);
  expect(prepared.results[0]?.ok).toBe(false);
});
it('never executes a stale ready suggestion', async () => {
  vi.mocked(request).mockResolvedValueOnce(tasks());
  const results = await executeAdmissions(
    eventId,
    [{ entryId, name: 'Anja', to: 'approved', label: 'Startberechtigt' }],
    'Geprüft',
  );
  expect(results[0]?.ok).toBe(false);
  expect(request).toHaveBeenCalledTimes(1);
});
it('rejects a changed target after confirmation', async () => {
  vi.mocked(request)
    .mockResolvedValueOnce(tasks(entryId))
    .mockResolvedValueOnce(response(entry()));
  const results = await executeAdmissions(
    eventId,
    [{ entryId, name: 'Anja', to: 'accepted', label: 'Zugelassen' }],
    'Geprüft',
  );
  expect(results[0]?.message).toContain('Zielstatus geändert');
  expect(request).toHaveBeenCalledTimes(2);
});
it('continues sequentially after a per-entry failure and uses existing transition service', async () => {
  const updated = { ...entry(secondId), acceptanceStatus: 'approved' };
  delete (updated as Partial<typeof updated>).acceptanceTransitions;
  vi.mocked(request)
    .mockResolvedValueOnce(tasks(entryId, secondId))
    .mockResolvedValueOnce(response(entry()))
    .mockResolvedValueOnce(response({}, 403))
    .mockResolvedValueOnce(tasks(secondId))
    .mockResolvedValueOnce(response(entry(secondId)))
    .mockResolvedValueOnce(response(updated));
  const plan = [entryId, secondId].map((id) => ({
    entryId: id,
    name: id,
    to: 'approved',
    label: 'Startberechtigt',
  }));
  const results = await executeAdmissions(eventId, plan, 'Unterlagen geprüft');
  expect(results.map((item) => item.ok)).toEqual([false, true]);
  expect(request).toHaveBeenNthCalledWith(
    6,
    `/admin/entries/${secondId}/transitions`,
    {
      method: 'POST',
      body: JSON.stringify({
        transition: 'acceptance',
        status: 'approved',
        reason: 'Unterlagen geprüft',
      }),
    },
  );
});

it('does not start more reads or mutations after the view is unmounted', async () => {
  const controller = new AbortController();
  controller.abort();
  const result = await executeAdmissions(
    eventId,
    [{ entryId, name: 'Anja', to: 'approved', label: 'Zugelassen' }],
    'Geprüft',
    controller.signal,
  );
  expect(result[0]?.ok).toBe(false);
  expect(request).not.toHaveBeenCalled();
});
