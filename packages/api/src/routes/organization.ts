import type { ApiRoutesContext } from './context.js';
import {
  getOrganization,
  membershipRoles,
  updateOrganization,
  type OrganizationPatch,
} from '@nennbox/core';
import {
  OrganizationResponse,
  UpdateOrganizationRequest,
} from '@nennbox/contracts';

export function registerOrganizationRoutes(context: ApiRoutesContext): void {
  const { app, deps, requireMember } = context;
  app.post('/auth/session', async (c) => {
    const guard = await requireMember(c.req.raw);
    if (!guard.ok) return c.json({ error: guard.error }, guard.status);
    const { subject, organizationId } = guard.context;
    if (!subject) return c.json({ error: 'Unauthorized' }, 401);
    if (!deps.memberships?.recordSignIn)
      return c.json({ error: 'Login recording unavailable' }, 503);
    const recorded = await deps.memberships.recordSignIn(
      subject,
      organizationId,
    );
    return recorded ? c.body(null, 204) : c.json({ error: 'Forbidden' }, 403);
  });
  app.get('/admin/session', async (c) => {
    const guard = await requireMember(c.req.raw);
    if (!guard.ok) return c.json({ error: guard.error }, guard.status);
    const member = guard.context;
    const role = member.permissions.has('role:admin')
      ? 'admin'
      : (membershipRoles.find((role) =>
          member.permissions.has(`role:${role}`),
        ) ?? (member.permissions.has('role:member') ? 'member' : null));
    return role ? c.json({ role }) : c.json({ error: 'Forbidden' }, 403);
  });
  app.get('/admin/organization', async (c) => {
    const guard = await requireMember(c.req.raw);
    if (!guard.ok) return c.json({ error: guard.error }, guard.status);
    const context = guard.context;
    try {
      const org = await getOrganization(context, {
        organizations: deps.organizations,
      });
      return org
        ? c.json(OrganizationResponse.parse(org))
        : c.json({ error: 'Not found' }, 404);
    } catch {
      return c.json({ error: 'Forbidden' }, 403);
    }
  });
  app.patch('/admin/organization', async (c) => {
    const guard = await requireMember(c.req.raw);
    if (!guard.ok) return c.json({ error: guard.error }, guard.status);
    const context = guard.context;
    const body = await c.req.json().catch(() => null);
    const parsed = UpdateOrganizationRequest.safeParse(body);
    if (!parsed.success) return c.json({ error: 'Invalid request' }, 400);
    try {
      const org = await updateOrganization(
        context,
        parsed.data as OrganizationPatch,
        { organizations: deps.organizations },
      );
      return org
        ? c.json(OrganizationResponse.parse(org))
        : c.json({ error: 'Not found' }, 404);
    } catch {
      return c.json({ error: 'Forbidden' }, 403);
    }
  });
}
