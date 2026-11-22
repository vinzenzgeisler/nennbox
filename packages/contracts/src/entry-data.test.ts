import { describe, expect, it } from 'vitest';
import { EntryResponse } from './entries.js';

const id = '00000000-0000-4000-8000-000000000001';
const legacy = {
  id,
  organizationId: id,
  eventId: id,
  classId: id,
  registrationGroupId: id,
  driverPersonId: id,
  vehicleId: id,
  verificationStatus: 'unverified',
  acceptanceStatus: 'pending',
  requestedStartNumber: '42',
  priceSnapshotVersion: null,
  formSnapshotVersion: null,
  createdAt: '2030-01-01T00:00:00Z',
  deletedAt: null,
  deletionReason: null,
};
const invoiceSchema = EntryResponse.shape.adminDetails
  .unwrap()
  .shape.invoice.unwrap()
  .unwrap();

describe('optional entry data contract', () => {
  it('still accepts responses without the new fields', () => {
    expect(EntryResponse.safeParse(legacy).success).toBe(true);
  });
  it('retains distinct requested and assigned numbers and their status', () => {
    const response = {
      ...legacy,
      assignedStartNumber: '18',
      startNumberStatus: 'assigned',
    };
    expect(EntryResponse.parse(response)).toEqual(response);
    expect(
      EntryResponse.safeParse({ ...response, startNumberStatus: 'invented' })
        .success,
    ).toBe(false);
  });
  it('accepts dated, undated and legacy invoices without losing payment timestamps', () => {
    const invoice = {
      id,
      paymentReference: 'REF',
      currency: 'EUR',
      totalCents: 100,
      paidCents: 100,
      status: 'paid',
    };
    expect(invoiceSchema.safeParse(invoice).success).toBe(true);
    expect(invoiceSchema.parse({ ...invoice, paidAt: null }).paidAt).toBeNull();
    expect(
      invoiceSchema.parse({ ...invoice, paidAt: '2030-01-01T12:00:00Z' })
        .paidAt,
    ).toBe('2030-01-01T12:00:00Z');
    expect(
      invoiceSchema.safeParse({ ...invoice, paidAt: 'not-a-date' }).success,
    ).toBe(false);
  });
  it('keeps boolean hints compatible and validates optional related entries', () => {
    const schema = EntryResponse.shape.statusProjection.unwrap().shape.hints;
    expect(schema.parse([{ key: 'double_starter', present: true }])).toEqual([
      { key: 'double_starter', present: true },
    ]);
    const hints = [
      {
        key: 'double_starter',
        present: true,
        relatedEntries: [
          { entryId: id, startNumber: '18' },
          { entryId: id, startNumber: null },
        ],
      },
    ];
    expect(schema.parse(hints)).toEqual(hints);
    expect(
      schema.safeParse([
        {
          ...hints[0],
          relatedEntries: [{ entryId: 'bad', startNumber: '18' }],
        },
      ]).success,
    ).toBe(false);
  });
});
