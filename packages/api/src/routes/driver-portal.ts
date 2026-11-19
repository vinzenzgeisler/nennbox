import { z } from 'zod';
import { uploadEntryDocument, ENTRY_DOCUMENT_MAX_BYTES } from '@racepilot/core';
import type { RequestContext } from '@racepilot/core';
import { registerDriverPortalPaymentRoute } from './driver-portal-payment.js';
import { onlinePaymentConfigured } from './invoice-checkout.js';
import type {
  ApiRoutesContext,
  PublicRegistrationRouteDeps,
} from './context.js';

const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{40,64}$/);
const fields = [
  'phone',
  'street',
  'postalCode',
  'city',
  'emergencyContactName',
  'emergencyContactPhone',
  'licenseNumber',
] as const;
const fieldSchema = z.enum(fields);
const requestSchema = z
  .object({
    eventSlug: z.string().min(1).max(120),
    email: z.email().max(254),
    locale: z.enum(['de', 'en']).default('de'),
  })
  .strict();
const updateSchema = z
  .object({ fields: z.partialRecord(fieldSchema, z.string().trim().max(200)) })
  .strict();
const cookieName = 'driver_portal_session';
const cookieToken = (request: Request) => {
  const raw = request.headers
    .get('cookie')
    ?.split(';')
    .map((v) => v.trim())
    .find((v) => v.startsWith(`${cookieName}=`));
  const token = raw?.slice(cookieName.length + 1);
  return token && tokenSchema.safeParse(token).success ? token : null;
};
const noStore = (c: { header(name: string, value: string): void }) =>
  c.header('Cache-Control', 'private, no-store');
const sameOrigin = (request: Request) => {
  const origin = request.headers.get('origin');
  return !origin || origin === new URL(request.url).origin;
};

/** Accountless access, always resolved against the verified request tenant. */
export function registerDriverPortalRoutes(
  routes: ApiRoutesContext,
  registration: PublicRegistrationRouteDeps,
): void {
  const { app, deps, resolvePublicContext, requireMember } = routes;
  const portal = deps.driverPortal;
  if (!portal) return;
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
  const access = async (
    request: Request,
  ): Promise<{ context: RequestContext; token: string } | null> => {
    const context = await resolvePublicContext(request);
    const token = cookieToken(request);
    if (!context || !token || !(await portal.session(context, token)))
      return null;
    return { context, token };
  };
  app.post('/public/driver-portal/request', async (c) => {
    noStore(c);
    if (!sameOrigin(c.req.raw)) return c.json({ error: 'Unavailable' }, 403);
    const context = await resolvePublicContext(c.req.raw);
    if (!context) return c.json({ accepted: true });
    const blocked = await budget(
      c,
      context.organizationId,
      'driver-portal-request',
      6,
    );
    if (blocked) return c.json({ error: 'Unavailable' }, blocked);
    const parsed = requestSchema.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!parsed.success) return c.json({ error: 'Invalid request' }, 400);
    const capabilities = await deps.organizationCapabilities?.(context);
    if (!capabilities || capabilities.includes('mail.delivery'))
      await portal.request(
        context,
        parsed.data.eventSlug,
        parsed.data.email,
        parsed.data.locale,
      );
    return c.json({ accepted: true });
  });
  app.post('/public/driver-portal/redeem', async (c) => {
    noStore(c);
    if (!sameOrigin(c.req.raw))
      return c.json({ error: 'Link unavailable' }, 404);
    const context = await resolvePublicContext(c.req.raw);
    if (!context) return c.json({ error: 'Link unavailable' }, 404);
    const blocked = await budget(
      c,
      context.organizationId,
      'driver-portal-redeem',
      20,
    );
    if (blocked) return c.json({ error: 'Link unavailable' }, blocked);
    const parsed = z
      .object({ token: tokenSchema })
      .strict()
      .safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Link unavailable' }, 404);
    const token = await portal.redeem(context, parsed.data.token);
    if (!token) return c.json({ error: 'Link unavailable' }, 404);
    c.header(
      'Set-Cookie',
      `${cookieName}=${token}; HttpOnly; SameSite=Strict; Path=/public/driver-portal; Max-Age=3600${new URL(c.req.url).protocol === 'https:' ? '; Secure' : ''}`,
    );
    return c.json({ authenticated: true });
  });
  app.get('/public/driver-portal', async (c) => {
    noStore(c);
    const current = await access(c.req.raw);
    const view = current
      ? await portal.view(current.context, current.token)
      : null;
    if (!view) return c.json({ error: 'Link unavailable' }, 404);
    return c.json({
      ...view,
      payment: view.payment && {
        ...view.payment,
        onlinePayable:
          onlinePaymentConfigured(deps) &&
          view.payment.status !== 'paid' &&
          view.payment.status !== 'cancelled' &&
          view.payment.totalCents > view.payment.paidCents,
      },
    });
  });
  registerDriverPortalPaymentRoute(routes, portal, access, sameOrigin);
  app.post('/public/driver-portal/logout', async (c) => {
    noStore(c);
    c.header(
      'Set-Cookie',
      `${cookieName}=; HttpOnly; SameSite=Strict; Path=/public/driver-portal; Max-Age=0`,
    );
    return c.json({ done: true });
  });
  app.patch('/public/driver-portal/entries/:entryId', async (c) => {
    noStore(c);
    if (!sameOrigin(c.req.raw)) return c.json({ error: 'Not found' }, 404);
    const current = await access(c.req.raw);
    const entryId = z.string().uuid().safeParse(c.req.param('entryId'));
    const parsed = updateSchema.safeParse(await c.req.json().catch(() => null));
    if (!current || !entryId.success)
      return c.json({ error: 'Not found' }, 404);
    if (!parsed.success) return c.json({ error: 'Invalid request' }, 400);
    const updated = await portal.update(
      current.context,
      current.token,
      entryId.data,
      parsed.data.fields,
    );
    return updated
      ? c.json({ updated: true })
      : c.json({ error: 'Not found' }, 404);
  });
  app.post('/public/driver-portal/entries/:entryId/withdraw', async (c) => {
    noStore(c);
    if (!sameOrigin(c.req.raw)) return c.json({ error: 'Not found' }, 404);
    const current = await access(c.req.raw);
    const entryId = z.string().uuid().safeParse(c.req.param('entryId'));
    if (!current || !entryId.success)
      return c.json({ error: 'Not found' }, 404);
    const parsed = z
      .object({ confirmed: z.literal(true) })
      .strict()
      .safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Confirmation required' }, 400);
    const updated = await portal.withdraw(
      current.context,
      current.token,
      entryId.data,
    );
    return updated
      ? c.json({ withdrawn: true })
      : c.json({ error: 'Not found' }, 404);
  });
  if (deps.objectStorage)
    app.post('/public/driver-portal/entries/:entryId/documents', async (c) => {
      noStore(c);
      if (!sameOrigin(c.req.raw)) return c.json({ error: 'Not found' }, 404);
      const current = await access(c.req.raw);
      const entryId = z.string().uuid().safeParse(c.req.param('entryId'));
      if (!current || !entryId.success)
        return c.json({ error: 'Not found' }, 404);
      const owned = await portal.ownsEntry(
        current.context,
        current.token,
        entryId.data,
      );
      if (!owned || owned.status === 'withdrawn')
        return c.json({ error: 'Not found' }, 404);
      const blocked = await budget(
        c,
        current.context.organizationId,
        'driver-portal-upload',
        12,
      );
      if (blocked) return c.json({ error: 'Unavailable' }, blocked);
      const form = await c.req.formData().catch(() => null);
      const file = form?.get('file');
      const typeKey = form?.get('typeKey');
      if (
        !(file instanceof File) ||
        typeof typeKey !== 'string' ||
        file.size > ENTRY_DOCUMENT_MAX_BYTES
      )
        return c.json({ error: 'Invalid upload' }, 422);
      const result = await uploadEntryDocument(
        { ...current.context, permissions: new Set(['entry:write']) },
        {
          entryId: entryId.data,
          typeKey,
          fileName: file.name,
          contentType: file.type,
          body: new Uint8Array(await file.arrayBuffer()),
          actor: 'driver-portal',
        },
        { documents: deps.entryDocuments, storage: deps.objectStorage! },
      );
      return result.ok
        ? c.json({ uploaded: true }, 201)
        : c.json(
            { error: result.reason },
            result.error === 'not_found' ? 404 : 422,
          );
    });
  app.get('/admin/events/:eventId/driver-portal-fields', async (c) => {
    const guard = await requireMember(c.req.raw, 'event:read');
    if (!guard.ok) return c.json({ error: guard.error }, guard.status);
    const id = z.string().uuid().safeParse(c.req.param('eventId'));
    return id.success
      ? c.json({ fields: await portal.fields(guard.context, id.data) })
      : c.json({ error: 'Not found' }, 404);
  });
  app.put('/admin/events/:eventId/driver-portal-fields', async (c) => {
    const guard = await requireMember(c.req.raw, 'event:write');
    if (!guard.ok) return c.json({ error: guard.error }, guard.status);
    const id = z.string().uuid().safeParse(c.req.param('eventId'));
    const parsed = z
      .object({ fields: z.array(fieldSchema).max(fields.length) })
      .strict()
      .safeParse(await c.req.json().catch(() => null));
    if (
      !id.success ||
      !parsed.success ||
      new Set(parsed.data.fields).size !== parsed.data.fields.length
    )
      return c.json({ error: 'Invalid request' }, 400);
    return (await portal.setFields(guard.context, id.data, parsed.data.fields))
      ? c.json({ fields: parsed.data.fields })
      : c.json({ error: 'Not found' }, 404);
  });
}
