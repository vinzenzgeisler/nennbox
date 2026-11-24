/**
 * Stable public rule IDs, also used as configuration keys. Tasks are advisory:
 * ready = admission; missingDocuments/paymentOpen = reminders; displacement/year,
 * expiredLicense/expiredDocument/minorGuardian = plausibility; duplicateStartNumber,
 * duplicatePerson/duplicateVehicle = conflicts; capacityNear/waitlistPromotion = capacity.
 */
export const workbasketRuleIds = [
  'ready',
  'missingDocuments',
  'paymentOpen',
  'displacement',
  'year',
  'expiredLicense',
  'expiredDocument',
  'minorGuardian',
  'duplicateStartNumber',
  'duplicatePerson',
  'duplicateVehicle',
  'capacityNear',
  'waitlistPromotion',
] as const;
export type WorkbasketRuleId = (typeof workbasketRuleIds)[number];

export interface WorkbasketEntry {
  readonly id: string;
  readonly classId: string;
  readonly createdAt: string;
  /** Workflow category, not a custom display label. Inactive categories are ignored. */
  readonly status: string;
  readonly paid: boolean;
  readonly documentsComplete: boolean;
  readonly firstName: string;
  readonly lastName: string;
  readonly dateOfBirth: string | null;
  readonly email: string | null;
  readonly vehicleId?: string | null;
  readonly vin?: string | null;
  readonly registration?: string | null;
  readonly displacementCc?: number | null;
  readonly year?: number | null;
  readonly licenseValidUntil?: string | null;
  readonly documentValidUntil?: readonly string[] | null;
  readonly guardianName?: string | null;
  readonly startNumber?: string | null;
  readonly waitlistOfferSentAt?: string | null;
  readonly waitlistPosition?: number | null;
  readonly waitlistOfferedUntil?: string | null;
}

export interface WorkbasketClass {
  readonly id: string;
  /** Null or absent means unlimited; zero is a closed class. */
  readonly maxParticipants?: number | null;
  readonly allowsMultipleStarts?: boolean;
  readonly minDisplacementCc?: number | null;
  readonly maxDisplacementCc?: number | null;
  readonly minYear?: number | null;
  readonly maxYear?: number | null;
}

export interface WorkbasketSnapshot {
  /** ISO date or timestamp. Calendar rules use the literal ISO calendar day. */
  readonly today: string;
  /** Exact instant, separate from the organization-local calendar day. */
  readonly now?: string;
  readonly eventDate: string | null;
  readonly closingDate: string | null;
  readonly entries: readonly WorkbasketEntry[];
  readonly classes: readonly WorkbasketClass[];
}

export interface WorkbasketTask {
  readonly ruleId: WorkbasketRuleId;
  readonly entryId: string | null;
  readonly classId: string;
  readonly reason: string;
  readonly fields: readonly string[];
  readonly severity: 'warning' | 'task';
}
