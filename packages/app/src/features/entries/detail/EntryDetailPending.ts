import type { AdminActionKind } from './EntryAdminActionDialog.js';
import type { StatusStep } from './EntryActionRail.js';
import type { DimensionAction } from './EntryDocumentsSection.js';

export type Pending =
  | { kind: 'status'; step: StatusStep }
  | { kind: 'verify' }
  | { kind: 'dimension'; action: DimensionAction }
  | { kind: 'payment' }
  | { kind: 'admin'; action: AdminActionKind }
  | { kind: 'passenger'; action: 'add' | 'link' };
