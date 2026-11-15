import type { createDatabase } from '@racepilot/adapter-postgres';
import { createMessageRepository } from '@racepilot/adapter-postgres';

type Db = Awaited<ReturnType<typeof createDatabase>>['db'];
type Context = Parameters<
  ReturnType<typeof createMessageRepository>['send']
>[0];

/** Add one local, idempotent announcement campaign per demo event. */
export async function seedDemoMessages(
  db: Db,
  context: Context,
  eventId: string,
  eventSlug: string,
) {
  const result = await createMessageRepository(db).send(
    context,
    eventId,
    `community-demo:${eventSlug}:organizer-update`,
    {
      eventId,
      recipients: {
        classIds: [],
        statuses: [],
        payment: 'any',
        entryIds: [],
        additionalAddresses: [],
      },
      subject: 'Ablauf und letzte Hinweise zur Veranstaltung',
      text: 'Hallo {{firstName}},\n\nwir freuen uns auf deine Teilnahme an {{eventName}}. Bitte bringe deine Fahrzeugunterlagen zur Abnahme mit.\n\nViele Grüße\nDein Veranstalterteam',
      attachments: [],
    },
    'demo-seed',
  );
  if (!result.ok)
    throw new Error(`Demo message campaign: ${result.error.message}`);
  return result;
}
