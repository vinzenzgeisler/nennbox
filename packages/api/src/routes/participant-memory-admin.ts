import { z } from 'zod';
import { ProviderError, type RequestContext } from '@nennbox/core';
import type { ApiRoutesContext } from './context.js';

const settingsSchema = z
  .object({
    enabled: z.boolean().optional(),
    retentionDays: z.number().int().nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0);
const eraseSchema = z.object({ email: z.string().min(3).max(320) }).strict();
/** Organization switch and retention; same permission as other organization settings. */
export function registerParticipantMemoryAdminRoutes({
  app,
  deps,
  requireMember,
}: ApiRoutesContext): void {
  const memory = deps.participantMemory;
  if (!memory) return;
  const failure = (error: unknown) =>
    error instanceof ProviderError && error.code === 'invalid_input'
      ? 400
      : error instanceof ProviderError && error.code === 'forbidden'
        ? 403
        : 500;
  const guarded = async (
    request: Request,
    run: (context: RequestContext) => Promise<unknown>,
  ) => {
    const guard = await requireMember(request, 'organization:update');
    if (!guard.ok)
      return { status: guard.status, body: { error: guard.error } };
    try {
      return { status: 200 as const, body: await run(guard.context) };
    } catch (error) {
      const status = failure(error);
      return {
        status,
        body: { error: status === 500 ? 'Request failed' : 'Rejected' },
      };
    }
  };
  app.get('/admin/participant-memory', async (c) => {
    const result = await guarded(c.req.raw, (ctx) => memory.settings(ctx));
    return c.json(result.body as never, result.status as never);
  });
  app.put('/admin/participant-memory', async (c) => {
    const parsed = settingsSchema.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!parsed.success) return c.json({ error: 'Invalid request' }, 400);
    const result = await guarded(c.req.raw, (ctx) =>
      memory.configure(ctx, parsed.data),
    );
    return c.json(result.body as never, result.status as never);
  });
  // POST with the address in the body: an address in a URL ends up in access logs.
  app.post('/admin/participant-memory/erase', async (c) => {
    const parsed = eraseSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Invalid request' }, 400);
    const result = await guarded(c.req.raw, (ctx) =>
      memory.eraseParticipant(ctx, parsed.data.email),
    );
    return c.json(result.body as never, result.status as never);
  });
}
