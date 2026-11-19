import { and, asc, eq, isNull, ne, sql } from 'drizzle-orm';
import {
  allocateNextStartNumbers,
  availableStartNumbers,
  type StartNumberService,
  type StartNumberMode,
} from '@racepilot/core';
import { entries } from './schema/entries.js';
import { offerWaitlistSeat } from './waitlist-offer.js';
import {
  startNumberRanges,
  eventWaitlistSettings,
} from './schema/start-numbers.js';
import { eventClasses } from './schema/organization.js';
import type { Database } from './database.js';

export function createStartNumberService(db: Database): StartNumberService {
  return {
    list: async (ctx, eventId) => {
      const [rangeRows, settingsRows] = await Promise.all([
        db
          .select()
          .from(startNumberRanges)
          .where(
            and(
              eq(startNumberRanges.organizationId, ctx.organizationId),
              eq(startNumberRanges.eventId, eventId),
            ),
          )
          .orderBy(asc(startNumberRanges.rangeFrom)),
        db
          .select()
          .from(eventWaitlistSettings)
          .where(
            and(
              eq(eventWaitlistSettings.organizationId, ctx.organizationId),
              eq(eventWaitlistSettings.eventId, eventId),
            ),
          )
          .limit(1),
      ]);
      const settings = settingsRows[0];
      return {
        ranges: rangeRows.map((row) => ({
          id: row.id,
          classId: row.classId,
          from: row.rangeFrom,
          to: row.rangeTo,
          reserved: row.reservedNumbers,
          mode: row.assignmentMode as StartNumberMode,
        })),
        settings: {
          automaticPromotion: settings?.automaticPromotion ?? false,
          confirmationHours: settings?.confirmationHours ?? 48,
        },
      };
    },
    configure: async (ctx, eventId, ranges, settings) =>
      db.transaction(async (tx) => {
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${`${ctx.organizationId}:number-config:${eventId}`}, 0))`,
        );
        const classes = await tx
          .select({ id: eventClasses.id })
          .from(eventClasses)
          .where(
            and(
              eq(eventClasses.organizationId, ctx.organizationId),
              eq(eventClasses.eventId, eventId),
            ),
          );
        const classIds = new Set(classes.map((item) => item.id));
        for (const range of ranges) {
          if (
            !Number.isSafeInteger(range.from) ||
            !Number.isSafeInteger(range.to) ||
            range.from < 0 ||
            range.to < range.from ||
            (range.classId && !classIds.has(range.classId)) ||
            range.reserved.some(
              (n) => !Number.isInteger(n) || n < range.from || n > range.to,
            )
          )
            throw new Error('invalid-range');
        }
        for (let index = 0; index < ranges.length; index += 1) {
          const left = ranges[index]!;
          for (const right of ranges.slice(index + 1)) {
            if (left.classId !== right.classId) continue;
            if (
              left.mode !== right.mode ||
              (left.from <= right.to && right.from <= left.to)
            )
              throw new Error('overlapping-range');
          }
        }
        await tx
          .delete(startNumberRanges)
          .where(
            and(
              eq(startNumberRanges.organizationId, ctx.organizationId),
              eq(startNumberRanges.eventId, eventId),
            ),
          );
        if (ranges.length)
          await tx.insert(startNumberRanges).values(
            ranges.map((range) => ({
              organizationId: ctx.organizationId,
              eventId,
              classId: range.classId,
              rangeFrom: range.from,
              rangeTo: range.to,
              reservedNumbers: [...new Set(range.reserved)],
              assignmentMode: range.mode,
            })),
          );
        await tx
          .insert(eventWaitlistSettings)
          .values({ organizationId: ctx.organizationId, eventId, ...settings })
          .onConflictDoUpdate({
            target: [
              eventWaitlistSettings.organizationId,
              eventWaitlistSettings.eventId,
            ],
            set: settings,
          });
      }),
    assignAll: async (ctx, eventId, options) =>
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
          .select({ id: entries.id, classId: entries.classId })
          .from(entries)
          .where(
            and(
              eq(entries.organizationId, ctx.organizationId),
              eq(entries.eventId, eventId),
              isNull(entries.requestedStartNumber),
              isNull(entries.deletedAt),
              eq(entries.acceptanceStatus, 'accepted'),
            ),
          )
          .orderBy(asc(entries.createdAt), asc(entries.id))
          .for('update');
        const assignedRows = await tx
          .select({ number: entries.requestedStartNumber })
          .from(entries)
          .where(
            and(
              eq(entries.organizationId, ctx.organizationId),
              eq(entries.eventId, eventId),
              isNull(entries.deletedAt),
              ne(entries.acceptanceStatus, 'withdrawn'),
            ),
          );
        const assigned = assignedRows.flatMap((row) =>
          row.number ? [row.number] : [],
        );
        const result: Array<{ entryId: string; startNumber: string }> = [];
        for (const range of configured) {
          const candidates = unnumbered.filter(
            (entry) =>
              entry.classId === range.classId ||
              (range.classId === null &&
                !configured.some(
                  (specific) => specific.classId === entry.classId,
                )),
          );
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
                .set({ requestedStartNumber: item.startNumber })
                .where(
                  and(
                    eq(entries.organizationId, ctx.organizationId),
                    eq(entries.id, item.entryId),
                    isNull(entries.requestedStartNumber),
                  ),
                );
            assigned.push(item.startNumber);
            result.push(item);
          }
        }
        return result;
      }),
    promoteNext: async (ctx, eventId, classId, automatic = true) =>
      db.transaction(async (tx) => {
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${`${ctx.organizationId}:waitlist:${eventId}:${classId}`}, 0))`,
        );
        const offer = await offerWaitlistSeat({
          tx,
          ctx,
          eventId,
          classId,
          automatic,
        });
        return offer
          ? {
              entryId: offer.entryId,
              position: offer.position,
              deadline: offer.deadline.toISOString(),
            }
          : null;
      }),
    assign: async (ctx, eventId, entryId, startNumber) =>
      db.transaction(async (tx) => {
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${`${ctx.organizationId}:start-numbers:${eventId}`}, 0))`,
        );
        if (startNumber !== null) {
          const [entry] = await tx
            .select({ classId: entries.classId })
            .from(entries)
            .where(
              and(
                eq(entries.organizationId, ctx.organizationId),
                eq(entries.eventId, eventId),
                eq(entries.id, entryId),
                isNull(entries.deletedAt),
              ),
            )
            .limit(1);
          if (!entry) return false;
          const ranges = await tx
            .select()
            .from(startNumberRanges)
            .where(
              and(
                eq(startNumberRanges.organizationId, ctx.organizationId),
                eq(startNumberRanges.eventId, eventId),
                sql`(${startNumberRanges.classId} = ${entry.classId} or ${startNumberRanges.classId} is null)`,
              ),
            );
          const classRanges = ranges.filter(
            (range) => range.classId === entry.classId,
          );
          const applicable = classRanges.length
            ? classRanges
            : ranges.filter((range) => range.classId === null);
          if (
            applicable.length &&
            (!/^\d+$/.test(startNumber) ||
              !applicable.some(
                (range) =>
                  Number(startNumber) >= range.rangeFrom &&
                  Number(startNumber) <= range.rangeTo &&
                  !range.reservedNumbers.includes(Number(startNumber)),
              ))
          )
            throw new Error('number-out-of-range');
        }
        const updated = await tx
          .update(entries)
          .set({ requestedStartNumber: startNumber })
          .where(
            and(
              eq(entries.organizationId, ctx.organizationId),
              eq(entries.eventId, eventId),
              eq(entries.id, entryId),
              isNull(entries.deletedAt),
            ),
          )
          .returning({ id: entries.id });
        return updated.length > 0;
      }),
  };
}
