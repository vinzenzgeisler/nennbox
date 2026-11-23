import { expect, it } from 'vitest';
import {
  defaultEntryWorkflow,
  normalizeEntryWorkflow,
  validateEntryWorkflow,
  projectEntryStatuses,
  defaultEntryStatusDimensionConfig,
} from './index.js';

it('migrates legacy IDs deterministically without changing pinned entry or transition references', () => {
  const normalized = normalizeEntryWorkflow(defaultEntryWorkflow);
  expect(normalized.statuses.map((status) => status.id)).toEqual(
    defaultEntryWorkflow.statuses.map((status) => status.key),
  );
  expect(normalized.transitions).toEqual(defaultEntryWorkflow.transitions);
  expect(normalizeEntryWorkflow(normalized)).toEqual(normalized);
  const renamed = {
    ...normalized,
    statuses: normalized.statuses.map((status) => ({
      ...status,
      key: `renamed_${status.key}`,
    })),
  };
  expect(validateEntryWorkflow(renamed)).toEqual([]);
  const projection = projectEntryStatuses({
    workflow: renamed,
    acceptanceStatus: 'accepted',
    paymentStatus: 'open',
    technicalStatus: 'pending',
    waiverStatus: 'f_pending',
    emailStatus: 'unverified',
    config: defaultEntryStatusDimensionConfig,
  });
  expect(projection.dimensions[0]).toMatchObject({
    value: 'accepted',
    meaning: 'done',
    label: { de: 'Angenommen' },
  });
});
it('validates ID uniqueness and resolves transition endpoints by ID, never by editable key', () => {
  const normalized = normalizeEntryWorkflow(defaultEntryWorkflow);
  const custom = {
    ...normalized,
    statuses: normalized.statuses.map((status) =>
      status.id === 'accepted' ? { ...status, id: 'status_admitted' } : status,
    ),
    transitions: normalized.transitions.map((edge) => ({
      ...edge,
      from: edge.from === 'accepted' ? 'status_admitted' : edge.from,
      to: edge.to === 'accepted' ? 'status_admitted' : edge.to,
    })),
  };
  expect(validateEntryWorkflow(custom)).toEqual([]);
  expect(
    validateEntryWorkflow({ ...custom, transitions: normalized.transitions }),
  ).toContain('Orphan transition: pending -> accepted');
  expect(
    validateEntryWorkflow({
      ...normalized,
      statuses: normalized.statuses.map((status) => ({
        ...status,
        id: 'duplicate',
      })),
    }),
  ).toContain('Invalid or duplicate status ID: duplicate');
});
