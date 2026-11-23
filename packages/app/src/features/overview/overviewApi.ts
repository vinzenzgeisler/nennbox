import { z } from 'zod';
import { EventOverviewSchema } from '@nennbox/contracts';
import { apiRequest } from '../remote/apiRequest.js';

const WorkflowSchema = z.object({
  workflow: z.object({
    statuses: z.array(
      z.object({
        key: z.string(),
        labels: z.object({ de: z.string(), en: z.string() }),
        category: z.string(),
        color: z.string(),
      }),
    ),
  }),
});
const CountsSchema = z.object({
  statuses: z.record(z.string(), z.number().int().nonnegative()),
});

export const overviewApi = {
  async load(eventId: string, signal: AbortSignal) {
    const base = `/admin/events/${encodeURIComponent(eventId)}`;
    const [overview, revision, counts] = await Promise.all([
      apiRequest(`${base}/overview`, EventOverviewSchema, { signal }),
      apiRequest(`${base}/registration-workflow`, WorkflowSchema, { signal }),
      apiRequest(`${base}/entry-counts`, CountsSchema, { signal }),
    ]);
    // Overview groups by category; entry-counts preserves actual status keys.
    return {
      ...overview,
      statuses: counts.statuses,
      workflowStatuses: revision.workflow.statuses,
    };
  },
};
