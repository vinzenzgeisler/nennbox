import { createHmac } from 'node:crypto';
import { staticCanonicalOrigin } from '@nennbox/core';
import { describe, expect, it, vi } from 'vitest';
import {
  createMailOutboxTask,
  type MailOutboxRecord,
  type MailOutboxRepository,
} from './mail.js';
import { parseParticipantMemoryRetention } from './participant-memory-cleanup.js';

const key = 'c'.repeat(64);
const nonce = 'n'.repeat(43);
const tenant = '11111111-1111-4111-8111-111111111111';
const mac = (input: string) =>
  createHmac('sha256', Buffer.from(key, 'hex'))
    .update(input)
    .digest('base64url');

async function deliver(
  templateKey: string,
  tokenKey: string | null = key,
  origin = 'https://club.example.test',
) {
  const row: MailOutboxRecord = {
    id: 'mail-1',
    organizationId: tenant,
    eventId: null,
    templateKey: templateKey as MailOutboxRecord['templateKey'],
    templateVersion: 1,
    locale: 'de',
    recipient: 'person@example.test',
    idempotencyKey: 'k',
    variables: { accessNonce: nonce, linkUrl: 'https://evil.test/#token=x' },
    status: 'pending',
    attempts: 0,
  };
  const repo: MailOutboxRepository = {
    get: async () => row,
    claim: async () => ({ ...row, status: 'sending' }),
    template: async () => null,
    organizationMailConfig: async () => ({
      from: 'org@example.test',
      replyTo: null,
    }),
    finish: async () => {},
  };
  const mail = { send: vi.fn(async () => {}) };
  await createMailOutboxTask({
    ...(tokenKey ? { invitationTokenKey: tokenKey } : {}),
    deploymentMode: 'cloud',
    getOrganization: async () => ({ status: 'active' }),
    repository: repo,
    mail,
    canonicalOrigin: staticCanonicalOrigin(origin),
  })(
    {
      type: 'mail.outbox',
      schemaVersion: 1,
      organizationId: tenant,
      correlationId: 'c',
      payload: { outboxId: 'mail-1' },
    },
    { job: { id: 'j' } },
  );
  return mail.send;
}

describe('participant memory mails', () => {
  it('derives the access link in worker memory, bound to the canonical origin and purpose', async () => {
    const send = await deliver('participant-memory-link');
    const token = mac(`participant-memory:access:${nonce}`);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining(
          `https://club.example.test/participant-memory#token=${token}`,
        ),
      }),
    );
    expect(JSON.stringify(send.mock.calls)).not.toContain('evil.test');
  });
  it('derives a different bearer for the delete link and never the team token', async () => {
    const send = await deliver('participant-memory-delete');
    const deleteToken = mac(`participant-memory:delete:${nonce}`);
    const text = (send.mock.calls[0] as unknown as [{ text: string }])[0].text;
    expect(text).toContain(
      `https://club.example.test/participant-memory/delete#token=${deleteToken}`,
    );
    expect(deleteToken).not.toBe(mac(`participant-memory:access:${nonce}`));
    expect(text).not.toContain(mac(nonce));
  });
  it('fails closed without the token key and never sends a link', async () => {
    await expect(deliver('participant-memory-link', null)).rejects.toThrow(
      /token key/,
    );
  });
});

describe('participant memory retention configuration', () => {
  it('uses documented defaults and validates ordering', () => {
    expect(parseParticipantMemoryRetention({})).toEqual({
      defaultDays: 365,
      minimumDays: 30,
      maximumDays: 1095,
    });
    expect(
      parseParticipantMemoryRetention({
        PARTICIPANT_MEMORY_RETENTION_DEFAULT_DAYS: '90',
        PARTICIPANT_MEMORY_RETENTION_MAXIMUM_DAYS: '180',
      }),
    ).toMatchObject({ defaultDays: 90, maximumDays: 180 });
    expect(() =>
      parseParticipantMemoryRetention({
        PARTICIPANT_MEMORY_RETENTION_DEFAULT_DAYS: '10',
      }),
    ).toThrow();
    expect(() =>
      parseParticipantMemoryRetention({
        PARTICIPANT_MEMORY_RETENTION_MINIMUM_DAYS: 'abc',
      }),
    ).toThrow(/positive integer/);
  });
});
