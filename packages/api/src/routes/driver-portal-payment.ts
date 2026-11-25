import type { ApiRoutesContext } from './context.js';
import {
  cancelInvoiceCheckout,
  createInvoiceCheckout,
  onlinePaymentConfigured,
} from './invoice-checkout.js';
import type { DriverPortalRepository } from '@nennbox/adapter-postgres';
import type { RequestContext } from '@nennbox/core';

type PortalAccess = { context: RequestContext; token: string } | null;

/** Pay-now for the signed-in driver; the invoice is resolved from the portal session, never the request. */
export function registerDriverPortalPaymentRoute(
  routes: ApiRoutesContext,
  portal: DriverPortalRepository,
  access: (request: Request) => Promise<PortalAccess>,
  guard: (request: Request) => boolean,
): void {
  const { app, deps } = routes;
  app.post('/public/driver-portal/payment/checkout', async (c) => {
    c.header('Cache-Control', 'private, no-store');
    if (!guard(c.req.raw)) return c.json({ error: 'Not found' }, 404);
    const current = await access(c.req.raw);
    if (!current) return c.json({ error: 'Not found' }, 404);
    if (!onlinePaymentConfigured(deps))
      return c.json({ error: 'Unavailable' }, 503);
    const view = await portal.view(current.context, current.token);
    if (!view?.payment) return c.json({ error: 'Not found' }, 404);
    const result = await createInvoiceCheckout(
      deps,
      current.context,
      view.payment.invoiceId,
      (slug) => `/events/${encodeURIComponent(slug)}/my-entry`,
    );
    if (result.status === 201) return c.json({ url: result.url }, 201);
    if (result.status === 409) return c.json({ error: 'Payment pending' }, 409);
    return result.status === 404
      ? c.json({ error: 'Not found' }, 404)
      : c.json({ error: 'Unavailable' }, 503);
  });
  app.post('/public/driver-portal/payment/cancel', async (c) => {
    c.header('Cache-Control', 'private, no-store');
    if (!guard(c.req.raw)) return c.json({ error: 'Not found' }, 404);
    const current = await access(c.req.raw);
    if (!current) return c.json({ error: 'Not found' }, 404);
    if (!onlinePaymentConfigured(deps))
      return c.json({ error: 'Unavailable' }, 503);
    const view = await portal.view(current.context, current.token);
    if (!view?.payment) return c.json({ error: 'Not found' }, 404);
    const result = await cancelInvoiceCheckout(
      deps,
      current.context,
      view.payment.invoiceId,
    );
    if (result === 'cancelled') return c.json({ cancelled: true });
    if (result === 'completed')
      return c.json({ error: 'Payment pending' }, 409);
    return result === 'nothing_pending'
      ? c.json({ error: 'Not found' }, 404)
      : c.json({ error: 'Unavailable' }, 503);
  });
}
