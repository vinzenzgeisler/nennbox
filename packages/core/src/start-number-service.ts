import type { RequestContext } from './context.js';
import type { StartNumberMode } from './start-numbers.js';

export interface StartNumberRangeConfig {
  readonly id?: string;
  readonly classId: string | null;
  readonly from: number;
  readonly to: number;
  readonly reserved: readonly number[];
  readonly mode: StartNumberMode;
}

export interface StartNumberService {
  list(
    ctx: RequestContext,
    eventId: string,
  ): Promise<{
    ranges: Array<StartNumberRangeConfig & { id: string }>;
    settings: { automaticPromotion: boolean; confirmationHours: number };
  }>;
  configure(
    ctx: RequestContext,
    eventId: string,
    ranges: readonly StartNumberRangeConfig[],
    settings: { automaticPromotion: boolean; confirmationHours: number },
  ): Promise<void>;
  /** `dryRun` plans the assignment without writing, so the UI can name the count. */
  assignAll(
    ctx: RequestContext,
    eventId: string,
    options?: { dryRun?: boolean },
  ): Promise<Array<{ entryId: string; startNumber: string }>>;
  promoteNext(
    ctx: RequestContext,
    eventId: string,
    classId: string,
    automatic?: boolean,
  ): Promise<{ entryId: string; position: number; deadline: string } | null>;
  assign(
    ctx: RequestContext,
    eventId: string,
    entryId: string,
    startNumber: string | null,
  ): Promise<boolean>;
}
