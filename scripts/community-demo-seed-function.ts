import {
  rows,
  classes,
  gradientImage,
  demoCreatedAt,
} from './community-demo-data.js';
import { demoEmail, demoProfile } from './community-demo-profiles.js';
import {
  seedDemoConversation,
  enrichPassenger,
  updateExistingDemoEntry,
  ensureDemoVerificationTemplate,
} from './community-demo-seed-enrichment.js';
import { ensureDemoEvent } from './community-demo-setup.js';
import { seedDemoDocuments } from './community-demo-documents.js';
import { seedDemoMessages } from './community-demo-messages.js';
import { createDemoStateHelpers } from './community-demo-states.js';
import { and, eq, sql } from 'drizzle-orm';
import { calculatePrice, organizationId, transitionEntry } from '@nennbox/core';
import {
  createDatabase,
  createPersonRepository,
  createVehicleRepository,
  createEntryRepository,
  createEntryWorkflowRepository,
  createEntryStatusDimensionRepository,
  createInvoiceRepository,
  createInvoicePaymentRepository,
  organizations,
  people,
  entries,
  registrationGroups,
} from '@nennbox/adapter-postgres';

type Db = Awaited<ReturnType<typeof createDatabase>>['db'];

/** Seed the complete realistic community fixture into one explicitly selected organization. */
export async function seedCommunityDemo(
  db: Db,
  options: SeedCommunityDemoOptions,
) {
  if (!options.organizationSlug)
    throw new Error('organizationSlug is required');
  const orgRows = await db
    .select()
    .from(organizations)
    .where(eq(organizations.slug, options.organizationSlug));
  if (orgRows.length !== 1) throw new Error('Community organization mismatch');
  const org = orgRows[0]!;
  await ensureDemoVerificationTemplate(db, org.id);
  const ctx = {
    deploymentMode: options.deploymentMode ?? 'community',
    organizationId: organizationId(org.id),
    permissions: new Set(['entry:write', 'role:admin']),
    capabilities: new Set<string>(),
    correlationId: 'community-demo-seed',
  };
  const { event, byCode } = await ensureDemoEvent(db, ctx, {
    organizationName: options.organizationName,
    eventSlug: options.eventSlug,
    eventName: options.eventName,
  });
  const entryRepo = createEntryRepository(db);
  const statusRepo = createEntryStatusDimensionRepository(db);
  const invoiceRepo = createInvoiceRepository(db);
  const paymentRepo = createInvoicePaymentRepository(db);
  let created = 0;
  const { cancelInvoice, markNotRelevant } = createDemoStateHelpers(
    db,
    org.id,
    ctx,
    statusRepo,
    invoiceRepo,
  );
  for (const [index, row] of rows.entries()) {
    const [
      fullName,
      make,
      model,
      classCode,
      number,
      acceptance,
      payment,
      technical,
      waiver,
      registration,
    ] = row;
    const [firstName, ...lastParts] = fullName.split(' ');
    const lastName = lastParts.join(' ');
    const email = demoEmail(index);
    const profile = demoProfile(index, classCode, fullName);
    const existing = await db
      .select({
        id: entries.id,
        vehicleId: entries.vehicleId,
        registrationGroupId: entries.registrationGroupId,
        driverPersonId: entries.driverPersonId,
      })
      .from(entries)
      .innerJoin(
        people,
        and(
          eq(people.organizationId, entries.organizationId),
          eq(people.id, entries.driverPersonId),
        ),
      )
      .where(
        and(
          eq(entries.organizationId, org.id),
          eq(entries.eventId, event.id),
          sql`${people.emailNormalized} in (${email}, ${`demo-${String(index + 1).padStart(3, '0')}@example.invalid`})`,
        ),
      )
      .limit(1);
    const eventClass = byCode.get(classCode)!;
    const fee = classes.find((c) => c.code === classCode)!.fee;
    const snapshot =
      payment === 'none'
        ? null
        : calculatePrice({
            currency: 'EUR',
            submittedAt: new Date().toISOString(),
            lines: [
              {
                classId: eventClass.id,
                quantity: 1,
                rule: {
                  classId: eventClass.id,
                  baseCents: fee,
                  additionalEntryAdjustmentCents: 0,
                  earlyBirdDeadline: null,
                  earlyBirdDiscountCents: 0,
                },
              },
            ],
          });
    if (existing.length) {
      await updateExistingDemoEntry(
        db,
        org.id,
        event.id,
        existing[0]!,
        index,
        email,
        profile,
      );
      await enrichPassenger(
        db,
        org.id,
        event.id,
        existing[0]!.id,
        index,
        fullName,
      );
      await seedDemoConversation(db, org.id, existing[0]!.id, index, fullName);
      await markNotRelevant({
        entryId: existing[0]!.id,
        registrationGroupId: existing[0]!.registrationGroupId,
        eventId: event.id,
        snapshot,
        payment,
        technical,
        waiver,
      });
      continue;
    }
    const person = await createPersonRepository(db).create(ctx, {
      firstName: firstName!,
      lastName,
      email,
      dateOfBirth: `${1970 + (index % 28)}-04-12`,
      country: 'DE',
    });
    const vehicle = await createVehicleRepository(db).create(ctx, {
      make,
      model,
      year: 1970 + (index % 30),
      registration,
      imageUrl: gradientImage(index),
    });
    const [group] = await db
      .insert(registrationGroups)
      .values({
        organizationId: org.id,
        eventId: event.id,
        personId: person.id,
        contactEmail: email,
        phone: profile.phone,
        street: profile.street,
        postalCode: profile.postalCode,
        city: profile.city,
        emergencyContactName: profile.emergencyContactName,
        emergencyContactPhone: profile.emergencyContactPhone,
        publicationPreference: profile.publicationPreference,
        bloodGroup: profile.bloodGroup,
        licenseNumber: profile.licenseNumber,
      })
      .returning();
    const entry = await entryRepo.create!(ctx, {
      eventId: event.id,
      classId: eventClass.id,
      registrationGroupId: group!.id,
      driverPersonId: person.id,
      vehicleId: vehicle.id,
      requestedStartNumber: number,
      priceSnapshotVersion: snapshot?.version ?? null,
      priceSnapshot: snapshot,
      formSnapshotVersion: 'demo-1',
    });
    await db
      .update(entries)
      .set({ createdAt: demoCreatedAt(index) })
      .where(
        and(
          eq(entries.organizationId, org.id),
          eq(entries.eventId, event.id),
          eq(entries.id, entry.id),
        ),
      );
    await enrichPassenger(db, org.id, event.id, entry.id, index, fullName);
    await seedDemoConversation(db, org.id, entry.id, index, fullName);
    await transitionEntry(
      ctx,
      entry.id,
      'verification',
      'verified',
      'demo-seed',
      'Beispielprüfung',
      { entries: entryRepo, workflows: createEntryWorkflowRepository(db) },
    );
    if (acceptance !== 'pending')
      await transitionEntry(
        ctx,
        entry.id,
        'acceptance',
        acceptance,
        'demo-seed',
        'Beispielstatus',
        { entries: entryRepo, workflows: createEntryWorkflowRepository(db) },
      );
    if (technical !== 'pending')
      await statusRepo.transition(
        ctx,
        entry.id,
        'technical_inspection',
        technical,
        'demo-seed',
        'Beispielabnahme',
      );
    if (waiver !== 'f_pending')
      await statusRepo.transition(
        ctx,
        entry.id,
        'waiver',
        waiver,
        'demo-seed',
        'Beispielhaftverzicht',
      );
    if (snapshot) {
      const invoice = await invoiceRepo.issue(
        ctx,
        event.id,
        group!.id,
        snapshot,
      );
      if (payment === 'cancelled') await cancelInvoice(invoice.id);
      if (payment === 'paid')
        await paymentRepo.record(
          ctx,
          invoice.id,
          snapshot.totalCents,
          'demo-seed',
          'Beispielzahlung',
        );
    }
    created++;
  }
  await seedDemoDocuments(db, ctx, event.id, rows);
  await seedDemoMessages(db, ctx, event.id, event.slug);
  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(entries)
    .where(
      and(eq(entries.organizationId, org.id), eq(entries.eventId, event.id)),
    );
  console.log(`${event.name}: ${total} Nennungen (${created} neu)`);
  return { eventId: event.id, eventName: event.name, total, created };
}
