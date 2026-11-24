import { settleCancellationRefund } from '@nennbox/core';
import type { RefundIntentResult, RequestContext } from '@nennbox/core';
import type { ApiDeps } from '../types.js';

/**
 * Runs the automatic refund that the cancellation of an entry may have queued.
 * The database transaction of the cancellation only records the intent; the
 * provider is called here, after it committed. A failure never undoes the
 * cancellation: it is stored on the intent (visible in the admin detail) and logged.
 */
export async function settleRefundAfterCancellation(
  deps: ApiDeps,
  ctx: RequestContext,
  entryId: string,
): Promise<RefundIntentResult | null> {
  if (!deps.refundIntents || !deps.paymentProvider || !deps.paymentRefunds)
    return null;
  try {
    const invoiceId = await deps.refundIntents.openInvoiceForEntry(
      ctx,
      entryId,
    );
    if (!invoiceId) return null;
    const result = await settleCancellationRefund(ctx, invoiceId, {
      intents: deps.refundIntents,
      refunds: deps.paymentRefunds,
      provider: deps.paymentProvider,
    });
    if (result?.status === 'failed')
      deps.logger.warn('Automatic refund failed', {
        failure: result.failure ?? 'unknown',
      });
    return result;
  } catch (error) {
    deps.logger.warn('Automatic refund could not be settled', {
      errorName: error instanceof Error ? error.name : 'unknown',
    });
    return null;
  }
}
