import { retryManualRefundReservations } from './refund-reservation-retry.js';
import { and, eq } from 'drizzle-orm';
import {
  checkoutSessions,
  createCheckoutRepository,
  createPaymentRefundRepository,
  createRefundIntentRepository,
  organizations,
  type Database,
} from '@nennbox/adapter-postgres';
import {
  createRequestContext,
  organizationId,
  settleCancellationRefund,
  type DeploymentMode,
  type Logger,
  type PaymentProvider,
} from '@nennbox/core';

/**
 * Picks up automatic refunds that a request started but never finished (crash,
 * timeout, provider outage right after the cancellation). Runs per organization
 * with a context of that organization only; the provider idempotency keys derive
 * from the intent, and the refund share is computed from what was already
 * refunded, so repeating a half-finished run cannot refund twice.
 */
export function createRefundRetryTask(deps: {
  db: Database;
  provider: PaymentProvider;
  deploymentMode: DeploymentMode;
  communityOrganizationId?: string;
  retryAfterMs?: number;
  logger?: Logger;
}) {
  const intents = createRefundIntentRepository(deps.db, {
    ...(deps.retryAfterMs ? { retryAfterMs: deps.retryAfterMs } : {}),
  });
  const checkouts = createCheckoutRepository(deps.db);
  const refunds = createPaymentRefundRepository(deps.db);
  return async () => {
    const tenantIds = deps.communityOrganizationId
      ? [deps.communityOrganizationId]
      : (
          await deps.db
            .select({ id: organizations.id })
            .from(organizations)
            .where(eq(organizations.status, 'active'))
        ).map((organization) => organization.id);
    for (const tenantId of tenantIds) {
      const ctx = createRequestContext({
        deploymentMode: deps.deploymentMode,
        organizationId: organizationId(tenantId),
        permissions: new Set(),
        capabilities: new Set(),
        correlationId: `refund-retry:${tenantId}`,
      });
      await retryManualRefundReservations(
        deps.db,
        ctx,
        deps.provider,
        deps.retryAfterMs ?? 10 * 60_000,
      );
      // Pending session rows themselves are the durable checkout-closure queue,
      // including unpaid invoices that never had a refundable payment/intent.
      const pending = await deps.db
        .selectDistinct({ invoiceId: checkoutSessions.invoiceId })
        .from(checkoutSessions)
        .where(
          and(
            eq(checkoutSessions.organizationId, tenantId),
            eq(checkoutSessions.status, 'checkout_pending'),
          ),
        );
      const invoiceIds = new Set(await intents.staleInvoiceIds(ctx));
      for (const row of pending) {
        if ((await checkouts.get(ctx, row.invoiceId))?.allEntriesCancelled)
          invoiceIds.add(row.invoiceId);
      }
      for (const invoiceId of invoiceIds) {
        try {
          // Unpaid cancellations are discovered from pending checkout rows,
          // independently of whether a refund intent exists.
          const invoice = await checkouts.get(ctx, invoiceId);
          if (invoice?.allEntriesCancelled) {
            for (const session of await checkouts.pendingSessions(
              ctx,
              invoiceId,
            )) {
              const outcome = await deps.provider.expireCheckoutSession({
                organizationId: ctx.organizationId,
                sessionId: session.id,
              });
              if (outcome === 'expired')
                await checkouts.markSessionsExpired(ctx, invoiceId, [
                  session.id,
                ]);
            }
          }
          const result = await settleCancellationRefund(ctx, invoiceId, {
            intents,
            refunds,
            provider: deps.provider,
          });
          if (result?.status === 'failed')
            deps.logger?.warn('Automatic refund retry failed', {
              failure: result.failure ?? 'unknown',
            });
        } catch (error) {
          deps.logger?.warn('Automatic refund retry could not run', {
            errorName: error instanceof Error ? error.name : 'unknown',
          });
        }
      }
    }
  };
}
