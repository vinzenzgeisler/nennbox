import type { Database, TransactionDatabase } from './database.js';
import { enqueueMailOutbox } from './mail-outbox.js';
import type { PublicRegistrationPayload } from './registration-settings.js';

export async function queueRegistrationVerificationMail(args: {
  db: Database;
  tx: TransactionDatabase;
  organizationId: string;
  eventId: string;
  groupId: string;
  canonicalOrigin: string;
  payload: PublicRegistrationPayload;
  token: string;
  templateVersion: number;
  templateVersionId: string | null;
  orgaCodes: readonly string[];
}): Promise<void> {
  const {
    db,
    tx,
    organizationId,
    eventId,
    groupId,
    canonicalOrigin,
    payload,
    token,
    templateVersion,
    templateVersionId,
    orgaCodes,
  } = args;
  const verificationUrl = new URL(
    `/registration/verify?token=${encodeURIComponent(token)}`,
    canonicalOrigin,
  ).toString();
  await enqueueMailOutbox(
    db,
    organizationId,
    {
      eventId,
      registrationGroupId: groupId,
      templateKey: 'verification',
      templateVersion,
      templateVersionId,
      locale: payload.language,
      recipient: payload.person.email,
      idempotencyKey: `registration-verification:${payload.submissionId}`,
      variables: {
        verificationUrl,
        recipientName: `${payload.person.firstName.trim()} ${payload.person.lastName.trim()}`,
        orgaCode: orgaCodes.join(', '),
        orgaCodes: orgaCodes.join(', '),
      },
      correlationId: payload.submissionId,
    },
    tx,
  );
}
