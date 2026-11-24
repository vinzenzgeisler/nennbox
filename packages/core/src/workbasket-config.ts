import { workbasketRuleIds } from './workbasket-model.js';
import type { WorkbasketRuleId } from './workbasket-model.js';

type RuleSettings<K extends WorkbasketRuleId> = {
  readonly enabled: boolean;
} & (K extends 'missingDocuments' | 'paymentOpen'
  ? { readonly days: number }
  : K extends 'capacityNear'
    ? { readonly percent: number }
    : object);

export type WorkbasketConfig = {
  readonly [K in WorkbasketRuleId]: RuleSettings<K>;
};
export type WorkbasketConfigOverrides = {
  readonly [K in WorkbasketRuleId]?: Partial<RuleSettings<K>>;
};

/** Reject unknown keys and non-finite/out-of-range thresholds; never coerce values. */
export function validateWorkbasketConfig(
  value: unknown,
): WorkbasketConfigOverrides {
  if (!isRecord(value))
    throw new Error('Arbeitskorb-Konfiguration muss ein Objekt sein.');
  const result: Record<string, object> = {};
  for (const [key, settings] of Object.entries(value)) {
    if (
      !(workbasketRuleIds as readonly string[]).includes(key) ||
      !isRecord(settings)
    )
      throw new Error(`Ungültige Arbeitskorb-Regel: ${key}`);
    const threshold =
      key === 'capacityNear'
        ? 'percent'
        : key === 'missingDocuments' || key === 'paymentOpen'
          ? 'days'
          : null;
    for (const [field, setting] of Object.entries(settings)) {
      if (field === 'enabled' && typeof setting === 'boolean') continue;
      if (
        field === threshold &&
        typeof setting === 'number' &&
        Number.isFinite(setting)
      ) {
        if (field === 'days' && Number.isSafeInteger(setting) && setting >= 0)
          continue;
        if (field === 'percent' && setting > 0 && setting <= 100) continue;
      }
      throw new Error(`Ungültige Arbeitskorb-Einstellung: ${key}.${field}`);
    }
    result[key] = { ...settings };
  }
  return result as WorkbasketConfigOverrides;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Merge per field: defaults < organization < event. Each call returns fresh objects. */
export function resolveWorkbasketConfig(
  org: WorkbasketConfigOverrides = {},
  event: WorkbasketConfigOverrides = {},
): WorkbasketConfig {
  const organization = validateWorkbasketConfig(org);
  const overrides = validateWorkbasketConfig(event);
  return Object.fromEntries(
    workbasketRuleIds.map((id) => [
      id,
      {
        enabled: true,
        ...(id === 'missingDocuments' || id === 'paymentOpen'
          ? { days: 7 }
          : {}),
        ...(id === 'capacityNear' ? { percent: 90 } : {}),
        ...organization[id],
        ...overrides[id],
      },
    ]),
  ) as WorkbasketConfig;
}
