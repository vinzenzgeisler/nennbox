import type { RequestContext } from './context.js';
import type { WorkbasketTask } from './workbasket-model.js';
import type { WorkbasketConfig } from './workbasket-config.js';

export interface WorkbasketResult {
  tasks: readonly WorkbasketTask[];
  counts: Record<string, number>;
  generation: number;
}
export interface WorkbasketConfiguration {
  organization: unknown;
  event: unknown;
  effective: WorkbasketConfig;
}
export interface WorkbasketRepository {
  tasks(ctx: RequestContext, eventId: string): Promise<WorkbasketResult | null>;
  warnings(
    ctx: RequestContext,
    eventId: string,
    entryId: string,
  ): Promise<readonly WorkbasketTask[] | null>;
  getConfiguration(
    ctx: RequestContext,
    eventId: string | null,
  ): Promise<WorkbasketConfiguration | null>;
  configure(
    ctx: RequestContext,
    eventId: string | null,
    input: unknown,
  ): Promise<WorkbasketConfiguration | null>;
}
