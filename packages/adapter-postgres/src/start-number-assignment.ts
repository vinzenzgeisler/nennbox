import { entryStatusCategory } from './entry-status-category.js';
import { and, asc, eq, isNull, ne, sql } from 'drizzle-orm';
import {
  allocateNextStartNumbers,
  availableStartNumbers,
  type StartNumberService,
} from '@nennbox/core';
import { entries } from './schema/entries.js';
import { startNumberRanges } from './schema/start-numbers.js';
import type { Database } from './database.js';

export const assignAllStartNumbers =
  (db: Database): StartNumberService['assignAll'] =>
  async (ctx, eventId, options) =>
    db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`${ctx.organizationId}:start-numbers:${eventId}`}, 0))`,
      );
      const configured = await tx
        .select()
        .from(startNumberRanges)
        .where(
          and(
            eq(startNumberRanges.organizationId, ctx.organizationId),
            eq(startNumberRanges.eventId, eventId),
          ),
        )
        .orderBy(asc(startNumberRanges.rangeFrom));
      const unnumbered = await tx
        .select({
          id: entries.id,
          classId: entries.classId,
          wish: entries.requestedStartNumber,
        })
        .from(entries)
        .where(
          and(
            eq(entries.organizationId, ctx.organizationId),
            eq(entries.eventId, eventId),
            isNull(entries.assignedStartNumber),
            isNull(entries.deletedAt),
            eq(entryStatusCategory(), 'accepted'),
          ),
        )
        .orderBy(asc(entries.createdAt), asc(entries.id))
        .for('update');
      const assignedRows = await tx
        .select({
          wish: entries.requestedStartNumber,
          number: entries.assignedStartNumber,
        })
        .from(entries)
        .where(
          and(
            eq(entries.organizationId, ctx.organizationId),
            eq(entries.eventId, eventId),
            isNull(entries.deletedAt),
            ne(entryStatusCategory(), 'withdrawn'),
          ),
        );
      const assigned = assignedRows.flatMap((row) =>
        [row.wish, row.number].filter(
          (number): number is string => number !== null,
        ),
      );
      const result: Array<{ entryId: string; startNumber: string }> = [];
      for (const confirmWishes of [true, false]) {
        for (const range of configured) {
          const candidates = unnumbered.filter(
            (entry) =>
              entry.classId === range.classId ||
              (range.classId === null &&
                !configured.some(
                  (specific) => specific.classId === entry.classId,
                )),
          );
          // Confirm valid wishes before allocating; all wishes remain reserved.
          if (confirmWishes) {
            for (const entry of candidates) {
              if (
                result.some((item) => item.entryId === entry.id) ||
                !entry.wish ||
                !/^\d+$/.test(entry.wish) ||
                Number(entry.wish) < range.rangeFrom ||
                Number(entry.wish) > range.rangeTo ||
                range.reservedNumbers.includes(Number(entry.wish))
              )
                continue;
              const item = { entryId: entry.id, startNumber: entry.wish };
              if (!options?.dryRun)
                await tx
                  .update(entries)
                  .set({ assignedStartNumber: entry.wish })
                  .where(eq(entries.id, entry.id));
              result.push(item);
            }
            continue;
          }
          const numbers = availableStartNumbers(
            {
              from: range.rangeFrom,
              to: range.rangeTo,
              reserved: range.reservedNumbers,
              classId: range.classId,
            },
            assigned,
          );
          const planned = allocateNextStartNumbers(
            candidates.filter(
              (entry) => !result.some((item) => item.entryId === entry.id),
            ),
            numbers,
          );
          for (const item of planned) {
            if (!options?.dryRun)
              await tx
                .update(entries)
                .set({ assignedStartNumber: item.startNumber })
                .where(
                  and(
                    eq(entries.organizationId, ctx.organizationId),
                    eq(entries.id, item.entryId),
                    isNull(entries.assignedStartNumber),
                  ),
                );
            assigned.push(item.startNumber);
            result.push(item);
          }
        }
      }
      return result;
    });
