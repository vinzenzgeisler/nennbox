import { eq, and } from 'drizzle-orm';
import type {
  OnlinePaymentMethod,
  OrganizationId,
  RefundPolicy,
} from '@nennbox/core';
import { disabledRefundPolicy } from '@nennbox/core';
import type { Database } from './database.js';
import { events, organizations } from './schema/organization.js';

export interface EffectivePaymentSettings {
  readonly onlineMethods: readonly OnlinePaymentMethod[];
  readonly bankTransfer: boolean;
  readonly checkoutLifetimeMinutes: number;
  readonly refundPolicy: RefundPolicy;
}

const onlineMethods = ['card', 'sepa_debit', 'paypal', 'klarna'] as const;

const percent = (value: unknown): value is number =>
  Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 100;

/** Stored policy JSON is validated by the contract on write; read defensively anyway. */
function readRefundPolicy(value: unknown): RefundPolicy {
  const policy = value as Partial<RefundPolicy> | null | undefined;
  if (
    !policy ||
    typeof policy.enabled !== 'boolean' ||
    !Array.isArray(policy.tiers) ||
    !percent(policy.rejectedPercent) ||
    policy.tiers.some(
      (tier) =>
        !percent(tier?.percent) ||
        !Number.isInteger(tier?.daysBefore) ||
        tier.daysBefore < 0,
    )
  )
    return disabledRefundPolicy;
  return {
    enabled: policy.enabled,
    tiers: policy.tiers.map(({ daysBefore, percent }) => ({
      daysBefore,
      percent,
    })),
    rejectedPercent: policy.rejectedPercent,
  };
}

/**
 * The payment options of one event: the organization default, overridden key by
 * key by the event. Mirrors mergeRegistrationFormConfig, but tolerates old or
 * partial stored JSON by falling back to "no online payment, no refund rule".
 */
export function mergePaymentSettings(
  organizationConfig: unknown,
  eventConfig: unknown,
): EffectivePaymentSettings {
  const read = (config: unknown) =>
    ((config as { payments?: Record<string, unknown> } | null)?.payments ??
      {}) as Record<string, unknown>;
  const merged = { ...read(organizationConfig), ...read(eventConfig) };
  const configured = merged.onlineMethods;
  const methods = Array.isArray(configured)
    ? onlineMethods.filter((method) => configured.includes(method))
    : [];
  return {
    onlineMethods: methods,
    bankTransfer: merged.bankTransfer !== false,
    checkoutLifetimeMinutes:
      Number.isInteger(merged.checkoutLifetimeMinutes) &&
      Number(merged.checkoutLifetimeMinutes) >= 30 &&
      Number(merged.checkoutLifetimeMinutes) <= 1440
        ? Number(merged.checkoutLifetimeMinutes)
        : 60,
    refundPolicy: readRefundPolicy(merged.refundPolicy),
  };
}

export async function loadPaymentSettings(
  db: Pick<Database, 'select'>,
  organizationId: OrganizationId | string,
  eventId: string,
): Promise<EffectivePaymentSettings | null> {
  const [row] = await db
    .select({
      eventConfig: events.registrationFormConfig,
      organizationConfig: organizations.registrationFormConfig,
    })
    .from(events)
    .innerJoin(organizations, eq(organizations.id, events.organizationId))
    .where(
      and(eq(events.organizationId, organizationId), eq(events.id, eventId)),
    )
    .limit(1);
  return row
    ? mergePaymentSettings(row.organizationConfig, row.eventConfig)
    : null;
}
