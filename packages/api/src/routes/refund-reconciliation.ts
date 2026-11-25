import { z } from 'zod';
import type { ApiRoutesContext } from './context.js';

/** A permission-checked, audited office escape from a stuck review. No financial
 * override: confirmation uses the existing provider key and keeps the fence. */
export function registerRefundReconciliationRoute(context: ApiRoutesContext) {
  const { app, deps } = context;
  app.post(
    '/admin/invoices/:invoiceId/refund-reservations/:key/reconcile',
    async (c) => {
      if (!deps.paymentRefunds?.requestReconciliation)
        return c.json({ error: 'Unavailable' }, 503);
      const guard = await context.requireMember(c.req.raw, 'payment:write');
      if (!guard.ok) return c.json({ error: guard.error }, guard.status);
      const parsed = z
        .object({ reason: z.string().trim().min(1).max(1000) })
        .strict()
        .safeParse(await c.req.json().catch(() => null));
      if (!parsed.success) return c.json({ error: 'Invalid request' }, 400);
      const result = await deps.paymentRefunds.requestReconciliation(
        guard.context,
        {
          invoiceId: c.req.param('invoiceId'),
          key: c.req.param('key'),
          actor: guard.context.subject
            ? `${guard.context.subject.issuer}#${guard.context.subject.subject}`
            : guard.context.correlationId,
          reason: parsed.data.reason,
        },
      );
      if (result === 'not_found') return c.json({ error: 'Not found' }, 404);
      if (result === 'not_reviewable')
        return c.json(
          { error: 'Refund is running or no longer waiting for review' },
          409,
        );
      return c.json(
        {
          scheduled: true,
          message:
            'Provider outcome is unconfirmed. The same operation will be checked again; funds remain reserved until provider confirmation.',
        },
        202,
      );
    },
  );
}
