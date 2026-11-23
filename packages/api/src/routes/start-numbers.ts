import { z } from 'zod';
import type { ApiRoutesContext } from './context.js';

const configSchema = z
  .object({
    ranges: z
      .array(
        z
          .object({
            classId: z.string().uuid().nullable(),
            from: z.number().int().min(0),
            to: z.number().int().min(0),
            reserved: z.array(z.number().int().min(0)).max(500),
            mode: z.enum(['driver_choice', 'organizer_assigned', 'automatic']),
          })
          .strict(),
      )
      .max(100),
    classCapacities: z
      .array(
        z
          .object({
            classId: z.string().uuid(),
            maxParticipants: z
              .number()
              .int()
              .positive()
              .max(2147483647)
              .nullable(),
          })
          .strict(),
      )
      .max(1000)
      .refine(
        (items) =>
          new Set(items.map((item) => item.classId)).size === items.length,
      )
      .optional(),
    settings: z
      .object({
        automaticPromotion: z.boolean(),
        confirmationHours: z.number().int().min(1).max(720),
      })
      .strict(),
  })
  .strict();

export function registerStartNumberRoutes({
  app,
  deps,
  requireMember,
}: ApiRoutesContext): void {
  app.get('/admin/events/:eventId/start-numbers', async (c) => {
    const guard = await requireMember(c.req.raw, 'event:read');
    if (!guard.ok) return c.json({ error: guard.error }, guard.status);
    if (!deps.startNumbers) return c.json({ error: 'Unavailable' }, 404);
    if (!z.string().uuid().safeParse(c.req.param('eventId')).success)
      return c.json({ error: 'Invalid event' }, 400);
    return c.json(
      await deps.startNumbers.list(guard.context, c.req.param('eventId')),
    );
  });
  app.put('/admin/events/:eventId/start-numbers', async (c) => {
    const guard = await requireMember(c.req.raw, 'event:write');
    if (!guard.ok) return c.json({ error: guard.error }, guard.status);
    if (!deps.startNumbers) return c.json({ error: 'Unavailable' }, 404);
    const eventId = z.string().uuid().safeParse(c.req.param('eventId'));
    const parsed = configSchema.safeParse(await c.req.json().catch(() => null));
    if (!eventId.success || !parsed.success)
      return c.json({ error: 'Invalid configuration' }, 400);
    if (
      parsed.data.classCapacities?.length &&
      !guard.context.permissions.has('class:write')
    )
      return c.json({ error: 'Forbidden' }, 403);
    try {
      await deps.startNumbers.configure(
        guard.context,
        eventId.data,
        parsed.data.ranges,
        parsed.data.settings,
        parsed.data.classCapacities,
      );
      return c.json(await deps.startNumbers.list(guard.context, eventId.data));
    } catch {
      return c.json({ error: 'Invalid configuration' }, 422);
    }
  });
  app.post('/admin/events/:eventId/start-numbers/assign-all', async (c) => {
    const guard = await requireMember(c.req.raw, 'entry:write');
    if (!guard.ok) return c.json({ error: guard.error }, guard.status);
    if (!deps.startNumbers) return c.json({ error: 'Unavailable' }, 404);
    const eventId = z.string().uuid().safeParse(c.req.param('eventId'));
    if (!eventId.success) return c.json({ error: 'Invalid event' }, 400);
    try {
      return c.json({
        assigned: await deps.startNumbers.assignAll(
          guard.context,
          eventId.data,
          { dryRun: c.req.query('dryRun') === '1' },
        ),
      });
    } catch {
      return c.json({ error: 'Number conflict or invalid range' }, 409);
    }
  });
  app.put('/admin/events/:eventId/entries/:entryId/start-number', async (c) => {
    const guard = await requireMember(c.req.raw, 'entry:write');
    if (!guard.ok) return c.json({ error: guard.error }, guard.status);
    if (!deps.startNumbers) return c.json({ error: 'Unavailable' }, 404);
    const ids = z
      .object({ eventId: z.string().uuid(), entryId: z.string().uuid() })
      .safeParse({
        eventId: c.req.param('eventId'),
        entryId: c.req.param('entryId'),
      });
    const body = z
      .object({ startNumber: z.string().trim().max(16).nullable() })
      .strict()
      .safeParse(await c.req.json().catch(() => null));
    if (!ids.success || !body.success)
      return c.json({ error: 'Invalid request' }, 400);
    try {
      const updated = await deps.startNumbers.assign(
        guard.context,
        ids.data.eventId,
        ids.data.entryId,
        body.data.startNumber,
      );
      return updated
        ? c.json({ ok: true })
        : c.json({ error: 'Not found' }, 404);
    } catch {
      return c.json(
        { error: 'Number conflict or outside configured range' },
        409,
      );
    }
  });

  app.post(
    '/admin/events/:eventId/classes/:classId/waitlist/next',
    async (c) => {
      const guard = await requireMember(c.req.raw, 'entry:write');
      if (!guard.ok) return c.json({ error: guard.error }, guard.status);
      if (!deps.startNumbers) return c.json({ error: 'Unavailable' }, 404);
      const ids = z
        .object({ eventId: z.string().uuid(), classId: z.string().uuid() })
        .safeParse({
          eventId: c.req.param('eventId'),
          classId: c.req.param('classId'),
        });
      if (!ids.success) return c.json({ error: 'Invalid event or class' }, 400);
      try {
        const offer = await deps.startNumbers.promoteNext(
          guard.context,
          ids.data.eventId,
          ids.data.classId,
          false,
        );
        return offer
          ? c.json(offer)
          : c.json({ error: 'No place or no waitlist entry' }, 409);
      } catch {
        return c.json({ error: 'Unable to promote waitlist entry' }, 409);
      }
    },
  );
}
