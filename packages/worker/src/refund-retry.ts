import { eq } from 'drizzle-orm';
import {
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
      for (const invoiceId of await intents.staleInvoiceIds(ctx)) {
        try {
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
