import { z } from 'zod';
import {
  membershipRoles,
  normalizeTeamEmail,
  ProviderError,
} from '@nennbox/core';
import type { ApiRoutesContext } from './context.js';
const id = z.string().uuid();
const invitation = z
  .object({
    email: z.string().max(1024),
    role: z.enum(membershipRoles),
    lifetimeSeconds: z.number().int().positive().optional(),
  })
  .strict();
const change = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('role'), role: z.enum(membershipRoles) }).strict(),
  z
    .object({
      kind: z.literal('status'),
      status: z.enum(['active', 'disabled']),
    })
    .strict(),
]);
export function registerTeamRoutes({
  app,
  deps,
  requireMember,
  resolvePublicContext,
}: ApiRoutesContext): void {
  const team = deps.team;
  if (!team) return;
  const errorStatus = (error: unknown): 400 | 403 | 404 | 409 | 503 | 500 => {
    if (!(error instanceof ProviderError)) return 500;
    return (
      (
        {
          invalid_input: 400,
          forbidden: 403,
          not_found: 404,
          conflict: 409,
          not_configured: 503,
        } as const
      )[error.code as 'forbidden'] ?? 500
    );
  };
  app.get('/admin/team', async (c) => {
    const guard = await requireMember(c.req.raw, 'role:admin');
    if (!guard.ok) return c.json({ error: guard.error }, guard.status);
    try {
      return c.json(await team.list(guard.context));
    } catch (error) {
      return c.json(
        {
          error:
            error instanceof ProviderError &&
            error.code === 'conflict' &&
            error.message !== 'conflict'
              ? error.message
              : 'Team request failed',
        },
        errorStatus(error),
      );
    }
  });
  app.post('/admin/team/invitations', async (c) => {
    const guard = await requireMember(c.req.raw, 'role:admin');
    if (!guard.ok) return c.json({ error: guard.error }, guard.status);
    const parsed = invitation.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Invalid request' }, 400);
    try {
      parsed.data.email = normalizeTeamEmail(parsed.data.email);
    } catch (error) {
      return c.json({ error: (error as Error).message }, 400);
    }
    try {
      return c.json({ id: await team.invite(guard.context, parsed.data) }, 201);
    } catch (error) {
      return c.json(
        {
          error:
            error instanceof ProviderError &&
            error.code === 'conflict' &&
            error.message !== 'conflict'
              ? error.message
              : 'Team request failed',
        },
        errorStatus(error),
      );
    }
  });
  for (const action of ['revoke', 'resend'] as const) {
    app.post(`/admin/team/invitations/:id/${action}`, async (c) => {
      const guard = await requireMember(c.req.raw, 'role:admin');
      if (!guard.ok) return c.json({ error: guard.error }, guard.status);
      if (!id.safeParse(c.req.param('id')).success)
        return c.json({ error: 'Invalid request' }, 400);
      try {
        await team[action](guard.context, c.req.param('id'));
        return c.body(null, 204);
      } catch (error) {
        return c.json(
          {
            error:
              error instanceof ProviderError &&
              error.code === 'conflict' &&
              error.message !== 'conflict'
                ? error.message
                : 'Team request failed',
          },
          errorStatus(error),
        );
      }
    });
  }
  app.patch('/admin/team/members/:id', async (c) => {
    const guard = await requireMember(c.req.raw, 'role:admin');
    if (!guard.ok) return c.json({ error: guard.error }, guard.status);
    const parsed = change.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success || !id.safeParse(c.req.param('id')).success)
      return c.json({ error: 'Invalid request' }, 400);
    try {
      await team.change(guard.context, c.req.param('id'), parsed.data);
      return c.body(null, 204);
    } catch (error) {
      return c.json(
        {
          error:
            error instanceof ProviderError &&
            error.code === 'conflict' &&
            error.message !== 'conflict'
              ? error.message
              : 'Team request failed',
        },
        errorStatus(error),
      );
    }
  });
  app.post('/auth/invitations/redeem', async (c) => {
    // Identity is verified by the configured OIDC authenticator, without requiring an existing membership.
    const identity = await deps.authenticator
      ?.authenticate(c.req.raw)
      .catch(() => null);
    const tenant = await resolvePublicContext(c.req.raw);
    if (!identity || !tenant) return c.json({ error: 'Unauthorized' }, 401);
    const parsed = z
      .object({ token: z.string().length(43) })
      .strict()
      .safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Invalid request' }, 400);
    let email = identity.email;
    try {
      if (email !== undefined) email = normalizeTeamEmail(email);
    } catch (error) {
      return c.json({ error: (error as Error).message }, 400);
    }
    try {
      await team.redeem(
        {
          ...tenant,
          subject: { issuer: identity.issuer, subject: identity.subject },
        },
        { ...identity, ...(email !== undefined ? { email } : {}) },
        parsed.data.token,
      );
      return c.body(null, 204);
    } catch (error) {
      return c.json({ error: 'Invitation rejected' }, errorStatus(error));
    }
  });
}
