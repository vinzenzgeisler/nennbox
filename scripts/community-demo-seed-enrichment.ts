import { and, eq, sql } from 'drizzle-orm';
import {
  createDatabase,
  entryPassengers,
  entryNotes,
  entries,
  people,
  registrationGroups,
  vehicles,
  emailTemplateVersions,
  saveMailTemplateVersion,
} from '@nennbox/adapter-postgres';
import { demoCreatedAt, gradientImage } from './community-demo-data.js';
import { demoPassenger } from './community-demo-profiles.js';

type Db = Awaited<ReturnType<typeof createDatabase>>['db'];

export async function enrichPassenger(
  db: Db,
  orgId: string,
  eventId: string,
  entryId: string,
  index: number,
  fullName: string,
) {
  const passenger = demoPassenger(index, fullName);
  if (!passenger) return;
  await db
    .insert(entryPassengers)
    .values({
      organizationId: orgId,
      eventId,
      entryId,
      ...passenger,
      emailNormalized: passenger.email,
      dateOfBirth: `${1980 + (index % 18)}-08-16`,
      country: 'DE',
      language: 'de',
      source: 'registration',
      createdBy: 'demo-seed',
      completedAt: new Date(Date.UTC(2026, 9, 20 + (index % 8), 10, 0)),
    })
    .onConflictDoNothing();
}

export async function seedDemoConversation(
  db: Db,
  orgId: string,
  entryId: string,
  index: number,
  fullName: string,
) {
  if (index % 6 !== 1 && index % 8 !== 3) return;
  const marker = `[community-demo:${index + 1}]`;
  const [existing] = await db
    .select({ id: entryNotes.id })
    .from(entryNotes)
    .where(
      and(
        eq(entryNotes.organizationId, orgId),
        eq(entryNotes.entryId, entryId),
        sql`${entryNotes.body} like ${`${marker}%`}`,
      ),
    )
    .limit(1);
  if (existing) return;
  const date = demoCreatedAt(index);
  await db.insert(entryNotes).values([
    {
      organizationId: orgId,
      entryId,
      visibility: 'driver',
      actor: 'Veranstalterteam',
      body: `${marker} Hallo ${fullName.split(' ')[0]}, kannst du zur Abnahme bitte auch den aktuellen Fahrzeugpass mitbringen?`,
      createdAt: date,
    },
    {
      organizationId: orgId,
      entryId,
      visibility: 'driver',
      actor: fullName,
      body: `${marker} Ja, der Pass liegt bereit. Ich komme am Samstagvormittag zur technischen Abnahme.`,
      createdAt: new Date(date.getTime() + 45 * 60_000),
    },
  ]);
}

export async function updateExistingDemoEntry(
  db: Db,
  orgId: string,
  eventId: string,
  entry: {
    id: string;
    vehicleId: string;
    registrationGroupId: string;
    driverPersonId: string;
  },
  index: number,
  email: string,
  profile: ReturnType<
    typeof import('./community-demo-profiles.js').demoProfile
  >,
) {
  await db
    .update(entries)
    .set({ createdAt: demoCreatedAt(index) })
    .where(
      and(
        eq(entries.organizationId, orgId),
        eq(entries.eventId, eventId),
        eq(entries.id, entry.id),
      ),
    );
  await db
    .update(registrationGroups)
    .set({
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
    .where(
      and(
        eq(registrationGroups.organizationId, orgId),
        eq(registrationGroups.id, entry.registrationGroupId),
      ),
    );
  await db
    .update(people)
    .set({ email, emailNormalized: email })
    .where(
      and(
        eq(people.organizationId, orgId),
        eq(people.id, entry.driverPersonId),
      ),
    );
  await db
    .update(vehicles)
    .set({
      imageUrl: sql`coalesce(${vehicles.imageUrl}, ${gradientImage(index)})`,
      displacementCc: profile.displacementCc,
      cylinders: profile.cylinders,
      transponderNumber: profile.transponderNumber,
      vehiclePassNumber: profile.vehiclePassNumber,
      ownerName: profile.ownerName,
      history: profile.history,
    })
    .where(
      and(eq(vehicles.organizationId, orgId), eq(vehicles.id, entry.vehicleId)),
    );
}

export async function ensureDemoVerificationTemplate(db: Db, orgId: string) {
  const [template] = await db
    .select({ id: emailTemplateVersions.id })
    .from(emailTemplateVersions)
    .where(
      and(
        eq(emailTemplateVersions.organizationId, orgId),
        eq(emailTemplateVersions.templateKey, 'verification'),
        eq(emailTemplateVersions.locale, 'de'),
      ),
    )
    .limit(1);
  if (!template)
    await saveMailTemplateVersion(db, orgId, {
      templateKey: 'verification',
      version: 1,
      locale: 'de',
      subject: 'Bitte bestätige deine Nennung, {{recipientName}}',
      text: 'Hallo {{recipientName}}, bestätige deine E-Mail-Adresse: {{verificationUrl}}',
      html: '<p>Hallo {{recipientName}},</p><p><a href="{{verificationUrl}}">E-Mail-Adresse bestätigen</a></p>',
    });
}
