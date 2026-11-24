import { z } from 'zod';
import { validateWorkbasketConfig } from '@nennbox/core';
import type { ApiRoutesContext } from './context.js';

export function registerWorkbasketRoutes({
  app,
  deps,
  requireMember,
}: ApiRoutesContext) {
  app.get('/admin/events/:eventId/workbasket', async (c) => {
    const guard = await requireMember(c.req.raw, 'entry:read');
    if (!guard.ok) return c.json({ error: guard.error }, guard.status);
    if (!deps.workbasket) return c.json({ error: 'Unavailable' }, 404);
    const eventId = z.string().uuid().safeParse(c.req.param('eventId'));
    if (!eventId.success) return c.json({ error: 'Invalid event' }, 400);
    const result = await deps.workbasket.tasks(guard.context, eventId.data);
    return result ? c.json(result) : c.json({ error: 'Not found' }, 404);
  });
  app.get('/admin/events/:eventId/entries/:entryId/warnings', async (c) => {
    const guard = await requireMember(c.req.raw, 'entry:read');
    if (!guard.ok) return c.json({ error: guard.error }, guard.status);
    if (!deps.workbasket) return c.json({ error: 'Unavailable' }, 404);
    const eventId = z.string().uuid().safeParse(c.req.param('eventId'));
    const entryId = z.string().uuid().safeParse(c.req.param('entryId'));
    if (!eventId.success || !entryId.success)
      return c.json({ error: 'Invalid IDs' }, 400);
    const warnings = await deps.workbasket.warnings(
      guard.context,
      eventId.data,
      entryId.data,
    );
    return warnings
      ? c.json({ warnings })
      : c.json({ error: 'Not found' }, 404);
  });
  for (const scope of ['organization', 'event'] as const) {
    const path =
      scope === 'event'
        ? '/admin/events/:eventId/workbasket/configuration'
        : '/admin/organization/workbasket/configuration';
    app.get(path, async (c) => {
      const guard = await requireMember(
        c.req.raw,
        scope === 'event' ? 'event:read' : 'organization:read',
      );
      if (!guard.ok) return c.json({ error: guard.error }, guard.status);
      if (!deps.workbasket) return c.json({ error: 'Unavailable' }, 404);
      const id = scope === 'event' ? c.req.param('eventId') : null;
      if (id !== null && !z.string().uuid().safeParse(id).success)
        return c.json({ error: 'Invalid event' }, 400);
      const result = await deps.workbasket.getConfiguration(guard.context, id);
      return result ? c.json(result) : c.json({ error: 'Not found' }, 404);
    });
    app.put(path, async (c) => {
      const guard = await requireMember(
        c.req.raw,
        scope === 'event' ? 'event:write' : 'organization:update',
      );
      if (!guard.ok) return c.json({ error: guard.error }, guard.status);
      if (!deps.workbasket) return c.json({ error: 'Unavailable' }, 404);
      const id = scope === 'event' ? c.req.param('eventId') : null;
      if (id !== null && !z.string().uuid().safeParse(id).success)
        return c.json({ error: 'Invalid event' }, 400);
      let config;
      try {
        config = validateWorkbasketConfig(await c.req.json());
      } catch {
        return c.json({ error: 'Invalid configuration' }, 400);
      }
      const result = await deps.workbasket.configure(guard.context, id, config);
      return result ? c.json(result) : c.json({ error: 'Not found' }, 404);
    });
  }
}
