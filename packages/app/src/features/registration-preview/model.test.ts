import { describe, expect, it } from 'vitest';
import {
  ageOnEvent,
  createDraft,
  createEntry,
  defaultConfig,
  emptyVehicle,
  entryPrice,
  initialDraft,
  isWaitlisted,
  maxUploadBytes,
  payableNow,
  stepsFor,
  totalPrice,
  uploadError,
  validateStep,
  type Draft,
  type PreviewConfig,
  type Upload,
} from './model.js';

const minimal: PreviewConfig = {
  ...defaultConfig,
  questions: false,
  uploads: false,
};
function readyDraft(): Draft {
  const draft = createDraft();
  draft.entries[0]!.passenger.pending = true;
  draft.answers.electricity = '230 V';
  const document: Upload = {
    name: 'license.pdf',
    size: 1_000,
    type: 'application/pdf',
    status: 'ready',
  };
  draft.uploads.license = { ...document };
  draft.uploads.vehiclePass = {
    ...document,
    name: 'pass.jpg',
    type: 'image/jpeg',
  };
  return draft;
}

describe('registration preview pricing and steps', () => {
  it('keeps each new draft independent with all consents unchecked', () => {
    const draft = createDraft();
    draft.person.firstName = 'Changed';
    draft.entries[0]!.vehicle.model = 'Changed';
    expect(initialDraft.person.firstName).toBe('Tom');
    expect(createDraft().entries[0]!.vehicle.model).toBe('911 SC');
    expect(Object.values(createDraft().consents)).toEqual([
      false,
      false,
      false,
    ]);
  });
  it('prices independent entries but never charges for a replacement', () => {
    const draft = createDraft();
    expect(entryPrice(draft.entries[0]!)).toBe(110);
    draft.entries[0]!.replacement = {
      ...emptyVehicle,
      manufacturer: 'Porsche',
      model: '911 Carrera',
      year: '1984',
    };
    expect(totalPrice(draft)).toBe(110);
    draft.entries.push({ ...createEntry('entry-2'), classId: 'motorcycle' });
    expect(totalPrice(draft)).toBe(190);
    draft.entries[1]!.classId = 'racing';
    expect(totalPrice(draft)).toBe(240);
    expect(entryPrice(createEntry())).toBe(0);
  });
  it('omits empty steps and adds payment only for immediately payable entries', () => {
    const draft = createDraft();
    expect(stepsFor(draft)).toEqual([
      'person',
      'vehicle',
      'passenger',
      'documents',
      'review',
    ]);
    draft.entries[0]!.classId = 'motorcycle';
    expect(stepsFor(draft, minimal)).toEqual(['person', 'vehicle', 'review']);
    expect(stepsFor(draft, { ...minimal, uploads: true })).toContain(
      'documents',
    );
    const instant = { ...minimal, instantPayment: true };
    expect(stepsFor(draft, instant).at(-1)).toBe('payment');
    expect(payableNow(draft, instant)).toBe(80);
    expect(payableNow(draft, minimal)).toBe(0);
    draft.entries[0]!.classId = 'racing';
    draft.entries[0]!.waitlist = true;
    expect(isWaitlisted(draft.entries[0]!)).toBe(true);
    expect(totalPrice(draft)).toBe(130);
    expect(payableNow(draft, instant)).toBe(0);
    expect(stepsFor(draft, instant)).not.toContain('payment');
  });
});

describe('calendar age and personal validation', () => {
  it('uses event-date birthdays and rejects invalid and future dates', () => {
    expect(ageOnEvent('2009-04-26')).toBe(18);
    expect(ageOnEvent('2009-04-27')).toBe(17);
    expect(ageOnEvent('2015-04-26')).toBe(12);
    expect(ageOnEvent('2008-02-29')).toBe(19);
    for (const value of [
      '',
      '2009-02-29',
      '2028-01-01',
      '1994-2-1',
      'nonsense',
    ])
      expect(ageOnEvent(value)).toBeNull();
  });
  it('blocks under minimum age and asks minors for guardian details', () => {
    const draft = createDraft();
    expect(validateStep('person', draft)).toEqual({});
    draft.person.birthDate = '2016-03-14';
    expect(validateStep('person', draft)['person.birthDate']).toContain('12');
    draft.person.birthDate = '2011-03-14';
    const errors = validateStep('person', draft);
    expect(errors['person.guardianName']).toBeTruthy();
    expect(errors['person.guardianEmail']).toBeTruthy();
    draft.person.guardianName = 'Sabine Probe';
    draft.person.guardianEmail = 'sabine@example.org';
    expect(validateStep('person', draft)).toEqual({});
  });
  it('returns actionable localized messages and respects hidden optional configuration', () => {
    const draft = createDraft();
    draft.person.email = 'tom@beispiel';
    draft.person.street = '';
    expect(validateStep('person', draft, 'en')['person.email']).toBe(
      'Please enter a valid email address.',
    );
    expect(validateStep('person', draft)['person.street']).toBeTruthy();
    expect(
      validateStep('person', draft, 'de', {
        ...defaultConfig,
        personFields: { street: false },
      })['person.street'],
    ).toBeUndefined();
  });
});

describe('vehicle and passenger decisions', () => {
  it('requires an explicit waitlist decision and retains normal class pricing', () => {
    const draft = createDraft();
    draft.entries[0]!.classId = 'racing';
    expect(validateStep('vehicle', draft)['entries.0.waitlist']).toBeTruthy();
    draft.entries[0]!.waitlist = true;
    expect(validateStep('vehicle', draft)).toEqual({});
    expect(entryPrice(draft.entries[0]!)).toBe(130);
  });
  it('validates each entry and nested replacement separately', () => {
    const draft = createDraft();
    draft.entries.push(createEntry('entry-2'));
    draft.entries[0]!.replacement = { ...emptyVehicle };
    const errors = validateStep('vehicle', draft);
    expect(errors['entries.1.classId']).toBeTruthy();
    expect(errors['entries.1.vehicle.manufacturer']).toBeTruthy();
    expect(errors['entries.0.replacement.model']).toBeTruthy();
    draft.entries = [];
    expect(validateStep('vehicle', draft).entries).toBeTruthy();
  });
  it('requires a complete passenger or explicit deferral, and allows an empty optional passenger', () => {
    const draft = createDraft();
    expect(
      validateStep('passenger', draft)['entries.0.passenger.email'],
    ).toBeTruthy();
    draft.entries[0]!.passenger.pending = true;
    expect(validateStep('passenger', draft)).toEqual({});
    draft.entries[0]!.passenger.pending = false;
    draft.entries[0]!.classId = 'touring-small';
    expect(stepsFor(draft)).toContain('passenger');
    expect(validateStep('passenger', draft)).toEqual({});
    draft.entries[0]!.passenger.firstName = 'Lena';
    expect(
      validateStep('passenger', draft)['entries.0.passenger.lastName'],
    ).toBeTruthy();
    draft.entries[0]!.passenger = {
      firstName: 'Lena',
      lastName: 'Muster',
      email: 'lena@example.org',
      pending: false,
    };
    expect(validateStep('passenger', draft)).toEqual({});
  });
});

describe('documents, review and payment', () => {
  it('rejects oversized, unsupported, empty and unfinished uploads', () => {
    const file: Upload = {
      name: 'pass.pdf',
      size: maxUploadBytes,
      type: 'application/pdf',
      status: 'ready',
    };
    expect(uploadError(file)).toBeNull();
    expect(uploadError({ ...file, size: maxUploadBytes + 1 })).toContain(
      '10 MB',
    );
    expect(uploadError({ ...file, type: 'image/heic' }, 'en')).toContain(
      'PDF, JPG or PNG',
    );
    expect(uploadError({ ...file, size: 0 })).toBeTruthy();
    expect(uploadError({ ...file, status: 'uploading' })).toBeTruthy();
    expect(uploadError({ ...file, status: 'error' })).toBeTruthy();
  });
  it('validates required questions and documents but skips disabled sections', () => {
    const draft = createDraft();
    const errors = validateStep('documents', draft);
    expect(Object.keys(errors)).toEqual([
      'answers.electricity',
      'uploads.license',
      'uploads.vehiclePass',
    ]);
    expect(validateStep('documents', draft, 'de', minimal)).toEqual({});
    draft.answers.electricity = 'not-an-option';
    expect(
      validateStep('documents', draft)['answers.electricity'],
    ).toBeTruthy();
    expect(validateStep('documents', readyDraft())).toEqual({});
  });
  it('requires three separate consents and revalidates prior steps at submission', () => {
    const draft = readyDraft();
    expect(Object.keys(validateStep('review', draft))).toEqual([
      'consents.terms',
      'consents.privacy',
      'consents.organizer',
    ]);
    draft.consents.terms = true;
    expect(validateStep('review', draft)['consents.privacy']).toBeTruthy();
    draft.consents.privacy = true;
    draft.consents.organizer = true;
    expect(validateStep('review', draft)).toEqual({});
    draft.person.email = '';
    expect(validateStep('review', draft)['person.email']).toBeTruthy();
  });
  it('requires a payment method only in the configured immediate-payment branch', () => {
    const draft = readyDraft();
    expect(validateStep('payment', draft)).toEqual({});
    const instant = { ...defaultConfig, instantPayment: true };
    expect(validateStep('payment', draft, 'en', instant).paymentMethod).toBe(
      'Please select a payment method.',
    );
    draft.paymentMethod = 'transfer';
    expect(validateStep('payment', draft, 'en', instant)).toEqual({});
  });
});
