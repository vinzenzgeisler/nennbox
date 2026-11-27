import type { Context } from 'hono';
import { z } from 'zod';
import {
  participantMemoryConsentTerms,
  participantMemoryDriverFields,
  participantMemoryPassengerFields,
  participantMemoryVehicleFields,
  ProviderError,
  type RequestContext,
} from '@nennbox/core';
import type {
  ApiRoutesContext,
  PublicRegistrationRouteDeps,
} from './context.js';

const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const cookieName = 'participant_memory_session';
const emailRequest = z
  .object({
    email: z.string().max(320),
    locale: z.enum(['de', 'en']).default('de'),
  })
  .strict();
const takeSchema = z
  .object({
    eventSlug: z.string().min(1).max(120),
    driver: z.array(z.enum(participantMemoryDriverFields)).max(20).optional(),
    vehicles: z
      .array(
        z
          .object({
            id: z.string().uuid(),
            fields: z.array(z.enum(participantMemoryVehicleFields)).max(20),
          })
          .strict(),
      )
      .max(20)
      .optional(),
    passenger: z
      .array(z.enum(participantMemoryPassengerFields))
      .max(20)
      .optional(),
    documents: z
      .array(
        z
          .object({ id: z.string().uuid(), entryId: z.string().uuid() })
          .strict(),
      )
      .max(20)
      .optional(),
  })
  .strict();
const settingsSchema = z
  .object({
    enabled: z.boolean().optional(),
    retentionDays: z.number().int().nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0);
const noStore = (c: { header(name: string, value: string): void }) =>
  c.header('Cache-Control', 'private, no-store');
const sameOrigin = (request: Request) => {
  const origin = request.headers.get('origin');
  return !origin || origin === new URL(request.url).origin;
};
const cookieToken = (request: Request) => {
  const raw = request.headers
    .get('cookie')
    ?.split(';')
    .map((v) => v.trim())
    .find((v) => v.startsWith(`${cookieName}=`));
  const token = raw?.slice(cookieName.length + 1);
  return token && tokenSchema.safeParse(token).success ? token : null;
};

/**
 * Participant memory (#195). Participants have no account: they return through a
 * link mailed to a verified address. Everything is resolved against the request
 * tenant; answers never reveal whether another club knows an address.
 */
export function registerParticipantMemoryRoutes(
  routes: ApiRoutesContext,
  registration: PublicRegistrationRouteDeps,
): void {
  const { app, deps, resolvePublicContext } = routes;
  const memory = deps.participantMemory;
  if (!memory) return;
  const budget = async (
    c: Parameters<typeof registration.consumeRegistrationBudget>[0] &
      Parameters<typeof registration.setRetryAfter>[0],
    org: string,
    scope: string,
    limit: number,
  ) => {
    const result = await registration.consumeRegistrationBudget(c, [
      { key: `${scope}:${org}`, limit, windowMs: 60_000 },
    ]);
    if (result.unavailable) return 503;
    if (!result.allowed) {
      registration.setRetryAfter(c, result.retryAfterMs);
      return 429;
    }
    return null;
  };
  const access = async (request: Request) => {
    const context = await resolvePublicContext(request);
    const token = cookieToken(request);
    const identity =
      context && token ? await memory.session(context, token) : null;
    return context && token && identity ? { context, token, identity } : null;
  };
  const link = (purpose: 'access' | 'delete') => async (c: Context) => {
    noStore(c);
    if (!sameOrigin(c.req.raw)) return c.json({ error: 'Unavailable' }, 403);
    const context = await resolvePublicContext(c.req.raw);
    // Always the same answer, whatever this club knows.
    if (!context) return c.json({ accepted: true });
    const blocked = await budget(
      c,
      context.organizationId,
      `participant-memory-${purpose}`,
      6,
    );
    if (blocked) return c.json({ error: 'Unavailable' }, blocked);
    const parsed = emailRequest.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Invalid request' }, 400);
    const capabilities = await deps.organizationCapabilities?.(context);
    if (!capabilities || capabilities.includes('mail.delivery'))
      await memory.requestAccess(
        context,
        parsed.data.email,
        purpose,
        parsed.data.locale,
      );
    return c.json({ accepted: true });
  };
  app.post('/public/participant-memory/request', link('access'));
  app.post('/public/participant-memory/delete-request', link('delete'));
  const redeem = (purpose: 'access' | 'delete') => async (c: Context) => {
    noStore(c);
    if (!sameOrigin(c.req.raw))
      return c.json({ error: 'Link unavailable' }, 404);
    const context = await resolvePublicContext(c.req.raw);
    if (!context) return c.json({ error: 'Link unavailable' }, 404);
    const blocked = await budget(
      c,
      context.organizationId,
      `participant-memory-redeem-${purpose}`,
      20,
    );
    if (blocked) return c.json({ error: 'Link unavailable' }, blocked);
    const parsed = z
      .object({ token: tokenSchema })
      .strict()
      .safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Link unavailable' }, 404);
    if (purpose === 'delete') {
      const deleted = await memory.redeemDelete(context, parsed.data.token);
      return deleted
        ? c.json({ deleted: true })
        : c.json({ error: 'Link unavailable' }, 404);
    }
    const session = await memory.redeemAccess(context, parsed.data.token);
    if (!session) return c.json({ error: 'Link unavailable' }, 404);
    c.header(
      'Set-Cookie',
      `${cookieName}=${session}; HttpOnly; SameSite=Strict; Path=/public/participant-memory; Max-Age=3600${new URL(c.req.url).protocol === 'https:' ? '; Secure' : ''}`,
    );
    return c.json({ authenticated: true });
  };
  app.post('/public/participant-memory/redeem', redeem('access'));
  app.post('/public/participant-memory/delete', redeem('delete'));
  app.post('/public/participant-memory/logout', async (c) => {
    noStore(c);
    const current = await access(c.req.raw);
    if (current) await memory.endSession(current.context, current.token);
    c.header(
      'Set-Cookie',
      `${cookieName}=; HttpOnly; SameSite=Strict; Path=/public/participant-memory; Max-Age=0`,
    );
    return c.json({ done: true });
  });
  app.get('/public/participant-memory', async (c) => {
    noStore(c);
    const current = await access(c.req.raw);
    const eventSlug = z
      .string()
      .min(1)
      .max(120)
      .safeParse(c.req.query('eventSlug'));
    const view =
      current && eventSlug.success
        ? await memory.view(current.context, current.identity, eventSlug.data)
        : null;
    if (!view) return c.json({ error: 'Not available' }, 404);
    return c.json({
      ...view,
      consent: { ...view.consent, terms: participantMemoryConsentTerms.text },
    });
  });
  app.post('/public/participant-memory/take', async (c) => {
    noStore(c);
    if (!sameOrigin(c.req.raw)) return c.json({ error: 'Not available' }, 404);
    const current = await access(c.req.raw);
    const parsed = takeSchema.safeParse(await c.req.json().catch(() => null));
    if (!current) return c.json({ error: 'Not available' }, 404);
    if (!parsed.success) return c.json({ error: 'Invalid request' }, 400);
    const taken = await memory.take(
      current.context,
      current.identity,
      parsed.data,
    );
    return taken ? c.json(taken) : c.json({ error: 'Not available' }, 404);
  });
  app.post('/public/participant-memory/consent', async (c) => {
    noStore(c);
    if (!sameOrigin(c.req.raw)) return c.json({ error: 'Not available' }, 404);
    const current = await access(c.req.raw);
    const parsed = z
      .object({ wordingVersion: z.string().min(1).max(40) })
      .strict()
      .safeParse(await c.req.json().catch(() => null));
    if (!current) return c.json({ error: 'Not available' }, 404);
    if (!parsed.success) return c.json({ error: 'Invalid request' }, 400);
    const granted = await memory.grantConsent(
      current.context,
      current.identity,
      parsed.data.wordingVersion,
    );
    return granted
      ? c.json({ granted: true, wordingVersion: parsed.data.wordingVersion })
      : c.json(
          {
            error: 'Wording changed or not available',
            wordingVersion: participantMemoryConsentTerms.version,
          },
          409,
        );
  });
  app.post('/public/participant-memory/consent/revoke', async (c) => {
    noStore(c);
    if (!sameOrigin(c.req.raw)) return c.json({ error: 'Not available' }, 404);
    const current = await access(c.req.raw);
    if (!current) return c.json({ error: 'Not available' }, 404);
    await memory.revokeConsent(current.context, current.identity);
    return c.json({ revoked: true });
  });
}

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
}
