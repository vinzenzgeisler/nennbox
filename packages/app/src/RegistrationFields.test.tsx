// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  defaultRegistrationFormConfig,
  standardRegistrationForm,
  type RegistrationDraft,
} from '@nennbox/contracts';
import { Registration } from './Registration.js';
import './styles.css';

const classId = '30000000-0000-4000-8000-000000000001';
const term = {
  key: 'terms',
  version: 'v1',
  language: 'de' as const,
  text: 'Bedingungen',
  hash: 'b'.repeat(64),
};
const form = (fields: Record<string, { state: string }>, legacy = false) => ({
  organization: { name: 'Club', contactEmail: 'club@example.test' },
  form: standardRegistrationForm,
  event: {
    id: '20000000-0000-4000-8000-000000000001',
    slug: 'demo',
    name: 'Demo Event',
    startsOn: '2030-01-01',
    registrationClosesAt: null,
  },
  currency: 'EUR',
  pricing: [],
  registrationFormConfig: {
    ...defaultRegistrationFormConfig,
    fields: legacy
      ? Object.fromEntries(
          Object.entries(defaultRegistrationFormConfig.fields).filter(
            ([key]) => key !== 'publicationPreference',
          ),
        )
      : { ...defaultRegistrationFormConfig.fields, ...fields },
  },
  classes: [
    {
      id: classId,
      name: 'Touring',
      code: 'T',
      vehicleType: 'car',
      closed: false,
    },
  ],
  consents: [term, { ...term, language: 'en' as const, text: 'Terms' }],
  registrationSettings: {
    sharedContactEmail: 'allowed',
    minimumAge: null,
    guardianRequiredBelowAge: 18,
    maximumClassesPerGroup: 8,
  },
});

let root: ReturnType<typeof createRoot> | undefined;
let container: HTMLDivElement;
afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  root = undefined;
  vi.unstubAllGlobals();
});

async function mount(
  payload: ReturnType<typeof form>,
  initialDraft?: RegistrationDraft,
  locale: 'de' | 'en' = 'de',
  submissionResult: object = { accepted: true },
) {
  const submissions: unknown[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init?: RequestInit) => {
      if (String(input).endsWith('/registration/submissions')) {
        submissions.push(JSON.parse(String(init?.body)));
        return { ok: true, json: async () => submissionResult };
      }
      return { ok: true, json: async () => payload };
    }),
  );
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () =>
    root!.render(
      <Registration
        organizationId="10000000-0000-4000-8000-000000000001"
        eventSlug="demo"
        defaultLocale={locale}
        {...(initialDraft ? { initialDraft } : {})}
      />,
    ),
  );
  return submissions;
}
const control = (label: string) => {
  const labelledControl = [...container.querySelectorAll('label')]
    .find((item) => item.textContent?.trim().startsWith(label))
    ?.querySelector('input,select,textarea');
  const ariaLabelledControl = container.querySelector(
    `[aria-label="${label}"]`,
  );
  return (labelledControl ?? ariaLabelledControl ?? undefined) as
    HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | undefined;
};
async function fill(label: string, value: string) {
  const element = control(label)!;
  const prototype =
    element instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : element instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(
      element,
      value,
    );
    element.dispatchEvent(
      new Event(element instanceof HTMLSelectElement ? 'change' : 'input', {
        bubbles: true,
      }),
    );
  });
}
async function press(text: string) {
  const button = [...container.querySelectorAll('button')].find(
    (item) => item.textContent?.trim() === text,
  );
  if (!button)
    throw new Error(
      `no "${text}" button; page: ${container.textContent?.slice(0, 300)}`,
    );
  await act(async () => button.click());
}
const draftWith = (
  patch: Partial<RegistrationDraft> = {},
): RegistrationDraft => ({
  firstName: 'Anna',
  lastName: 'Rennfahrerin',
  email: 'anna@example.test',
  dateOfBirth: '1990-05-05',
  guardianName: '',
  guardianEmail: '',
  phone: '',
  bloodGroup: '',
  licenseNumber: '',
  street: '',
  postalCode: '',
  city: '',
  emergencyContactName: '',
  emergencyContactPhone: '',
  publicationPreference: '',
  vehicles: [
    {
      classId,
      make: 'NSU',
      model: 'TT',
      year: '1969',
      registration: '',
      requestedStartNumber: '',
      displacementCc: '',
      cylinders: '',
      transponderNumber: '',
      vehiclePassNumber: '',
      ownerName: '',
      history: '',
      passengerEnabled: false,
      passengerFirstName: '',
      passengerLastName: '',
      passengerEmail: '',
      spareVehicleEnabled: false,
      spareVehicleMake: '',
      spareVehicleModel: '',
      spareVehicleYear: '',
      spareVehicleRegistration: '',
    },
  ],
  accepted: { 'terms:v1:de': true },
  customAnswers: {},
  ...patch,
});

describe('public registration contact and vehicle fields', () => {
  it('asks for each field according to its configured state, in both languages', async () => {
    await mount(
      form({
        phone: { state: 'required' },
        city: { state: 'hidden' },
        owner: { state: 'hidden' },
        cylinders: { state: 'required' },
      }),
      draftWith(),
    );
    expect(control('Telefon')?.required).toBe(true);
    expect(control('Straße und Hausnummer')?.required).toBe(false);
    expect(control('Ort')).toBeUndefined();
    expect(control('Veröffentlichung')).toBeTruthy();
    // Driver step first; the vehicle details follow on the next step.
    await fill('Telefon', '+49 351 123456');
    await press('Weiter zu Startmeldungen');
    expect(control('Zylinder')?.required).toBe(true);
    expect(control('Besitzer')).toBeUndefined();
    expect(control('Hubraum (cm³)')).toBeTruthy();
    expect(control('Fahrzeughistorie')?.tagName).toBe('TEXTAREA');
  });

  it.each(['required', 'optional', 'hidden'])(
    'shows phone independently of a hidden birth date: %s',
    async (state) => {
      await mount(
        form({
          dateOfBirth: { state: 'hidden' },
          phone: { state },
          emergencyContact: { state: 'hidden' },
        }),
        draftWith({ dateOfBirth: '' }),
      );
      expect(control('Geburtsdatum')).toBeUndefined();
      if (state === 'hidden') expect(control('Telefon')).toBeUndefined();
      else {
        expect(control('Telefon')).toBeDefined();
        expect(control('Telefon')?.required).toBe(state === 'required');
      }
    },
  );

  it('confirms mixed incoming and waitlisted entries without claiming acceptance', async () => {
    await mount(form({}), draftWith(), 'de', {
      accepted: true,
      entries: [
        { entryId: 'entry-a', status: 'pending', waitlistPosition: null },
        { entryId: 'entry-b', status: 'waitlisted', waitlistPosition: 3 },
      ],
    });
    await press('Weiter zu Startmeldungen');
    await press('Weiter zur Prüfung');
    await press('Nennung absenden');
    expect(container.textContent).toContain('Nennung eingegangen');
    expect(container.textContent).toContain('Auf der Warteliste, Platz 3');
    expect(container.textContent).not.toContain('angenommen');
  });

  it('confirms receipt before checkout finishes and retries only payment with the same invoice', async () => {
    const payload = {
      ...form({}),
      pricing: [
        {
          classId,
          baseCents: 1000,
          additionalEntryAdjustmentCents: 0,
          earlyBirdDeadline: null,
          earlyBirdDiscountCents: 0,
        },
      ],
      onlinePaymentAvailable: true,
      registrationFormConfig: {
        ...form({}).registrationFormConfig,
        payments: {
          ...defaultRegistrationFormConfig.payments,
          onlineMethods: ['card'],
        },
      },
    };
    const submissions = await mount(
      payload,
      draftWith({ phone: '+49 351 12345' }),
      'de',
      { accepted: true, invoiceId: 'invoice-a' },
    );
    const fetchMock = vi.mocked(fetch);
    const original = fetchMock.getMockImplementation()!;
    let rejectCheckout: (reason: Error) => void = () => {};
    fetchMock.mockImplementation((input, init) =>
      String(input).endsWith('/checkout')
        ? new Promise((_resolve, reject) => {
            rejectCheckout = reject;
          })
        : original(input, init),
    );
    await press('Weiter zu Startmeldungen');
    await press('Weiter zur Prüfung');
    await press('Weiter zur Zahlung');
    const online = container.querySelector(
      'input[value="online"]',
    ) as HTMLInputElement;
    await act(async () => online.click());
    // Do not await the pending checkout; receipt must already be visible.
    await act(async () => {
      const submit = [...container.querySelectorAll('button')].find(
        (b) => b.type === 'submit',
      );
      submit!.click();
    });
    expect(container.textContent).toContain('Nennung eingegangen');
    await act(async () => rejectCheckout(new Error('network')));
    expect(container.textContent).toContain('Zahlung nicht gestartet');
    expect(submissions).toHaveLength(1);
    fetchMock.mockImplementation((input, init) =>
      String(input).endsWith('/checkout')
        ? Promise.resolve({ ok: false, json: async () => ({}) } as Response)
        : original(input, init),
    );
    await press('Erneut versuchen');
    expect(submissions).toHaveLength(1);
    const checkouts = fetchMock.mock.calls.filter(([url]) =>
      String(url).endsWith('/checkout'),
    );
    expect(checkouts).toHaveLength(2);
    expect(
      checkouts.every(([url]) => String(url).includes('/invoices/invoice-a/')),
    ).toBe(true);
    expect(container.textContent).toContain('Zahlung nicht gestartet');
  });

  it('speaks English and keeps an emergency contact together', async () => {
    await mount(
      form({ emergencyContact: { state: 'optional' } }),
      undefined,
      'en',
    );
    expect(control('Phone')).toBeTruthy();
    expect(control('Emergency contact · Phone')?.required).toBe(false);
    await fill('Emergency contact · Phone', '+49 351 999');
    expect(control('Emergency contact · Name')?.required).toBe(true);
    await fill('Emergency contact · Phone', '');
    await fill('Emergency contact · Name', 'Bernd');
    expect(control('Emergency contact · Phone')?.required).toBe(true);
    expect(control('Publication')?.tagName).toBe('SELECT');
  });

  it('still loads a form whose stored configuration predates the newer fields', async () => {
    await mount(form({}, true));
    expect(control('Veröffentlichung')).toBeTruthy();
    expect(control('Vorname')).toBeTruthy();
  });

  it('sends what was entered and never a field the event no longer asks for', async () => {
    const submissions = await mount(
      form({ city: { state: 'hidden' }, history: { state: 'hidden' } }),
      draftWith({
        // An older draft still holds values for fields that are hidden now.
        city: 'Dresden',
        phone: '+49 351 123456',
        street: 'Musterweg 1',
        postalCode: '01067',
        emergencyContactName: 'Bernd',
        emergencyContactPhone: '+49 351 999',
        publicationPreference: 'initials',
        vehicles: [
          {
            ...draftWith().vehicles[0]!,
            displacementCc: '1177',
            cylinders: '4',
            ownerName: 'Anna',
            history: 'Neuaufbau 2019',
          },
        ],
      }),
    );
    await press('Weiter zu Startmeldungen');
    await press('Weiter zur Prüfung');
    await press('Nennung absenden');
    expect(submissions).toHaveLength(1);
    const body = submissions[0] as {
      person: Record<string, unknown>;
      entries: Array<{ vehicle: Record<string, unknown> }>;
    };
    expect(body.person).toMatchObject({
      phone: '+49 351 123456',
      street: 'Musterweg 1',
      postalCode: '01067',
      city: null,
      emergencyContactName: 'Bernd',
      emergencyContactPhone: '+49 351 999',
      publicationPreference: 'initials',
    });
    expect(body.entries[0]!.vehicle).toMatchObject({
      displacementCc: 1177,
      cylinders: 4,
      ownerName: 'Anna',
      history: null,
    });
  });

  it('keeps collapsed startmeldungen editable and does not hide an incomplete entry from validation', async () => {
    await mount(form({}), draftWith());
    await press('Weiter zu Startmeldungen');
    await press('Startmeldung übernehmen');
    await press('Weiteres Fahrzeug hinzufügen');
    await press('Startmeldung übernehmen');
    expect(control('Klasse')).toBeTruthy();
    await fill('Klasse', classId);
    await fill('Hersteller', 'Kawasaki');
    await fill('Modell', 'ZXR 750');
    await press('Startmeldung übernehmen');
    expect(
      container.querySelectorAll('.registration-vehicle-summary'),
    ).toHaveLength(2);
    await press('Bearbeiten');
    expect(control('Hersteller')?.value).toBe('NSU');
    await press('Weiter zur Prüfung');
    expect(container.textContent).toContain('Kawasaki');
  });

  it('keeps the newer standard fields hidden on a form that never configured them', async () => {
    await mount(form({}), draftWith());
    expect(control('Blutgruppe')).toBeUndefined();
    expect(control('Lizenznummer')).toBeUndefined();
    expect(control('Geburtsdatum')?.required).toBe(true);
    await press('Weiter zu Startmeldungen');
    expect(control('Transponder-Nr.')).toBeUndefined();
    expect(control('Fahrzeugpass-Nr.')).toBeUndefined();
  });

  it('asks blood group, licence, transponder and vehicle pass as configured, in German and English', async () => {
    await mount(
      form({
        bloodGroup: { state: 'required' },
        licenseNumber: { state: 'optional' },
        transponderNumber: { state: 'required' },
        vehiclePassNumber: { state: 'optional' },
      }),
      draftWith(),
    );
    const blood = control('Blutgruppe') as HTMLSelectElement;
    expect(blood.required).toBe(true);
    expect([...blood.options].map((option) => option.value)).toEqual([
      '',
      'A+',
      'A-',
      'B+',
      'B-',
      'AB+',
      'AB-',
      '0+',
      '0-',
    ]);
    expect(control('Lizenznummer')?.required).toBe(false);
    await fill('Blutgruppe', '0-');
    await press('Weiter zu Startmeldungen');
    expect(control('Transponder-Nr.')?.required).toBe(true);
    expect(control('Fahrzeugpass-Nr.')?.required).toBe(false);
    act(() => root?.unmount());
    container.remove();
    await mount(
      form({
        bloodGroup: { state: 'optional' },
        licenseNumber: { state: 'required' },
        transponderNumber: { state: 'optional' },
      }),
      undefined,
      'en',
    );
    expect(control('Blood group')?.required).toBe(false);
    expect(control('Licence number')?.required).toBe(true);
  });

  it('sends the new fields as entered and never when the event hides them', async () => {
    const asked = await mount(
      form({
        bloodGroup: { state: 'required' },
        licenseNumber: { state: 'required' },
        transponderNumber: { state: 'required' },
        vehiclePassNumber: { state: 'required' },
      }),
      draftWith({
        bloodGroup: 'AB-',
        licenseNumber: 'DMSB-4711',
        vehicles: [
          {
            ...draftWith().vehicles[0]!,
            transponderNumber: 'T-9',
            vehiclePassNumber: 'FP-123',
          },
        ],
      }),
    );
    await press('Weiter zu Startmeldungen');
    await press('Weiter zur Prüfung');
    await press('Nennung absenden');
    const sent = asked[0] as {
      person: Record<string, unknown>;
      entries: Array<{ vehicle: Record<string, unknown> }>;
    };
    expect(sent.person).toMatchObject({
      bloodGroup: 'AB-',
      licenseNumber: 'DMSB-4711',
    });
    expect(sent.entries[0]!.vehicle).toMatchObject({
      transponderNumber: 'T-9',
      vehiclePassNumber: 'FP-123',
    });
    act(() => root?.unmount());
    container.remove();
    // An old draft still holds values for fields that this event does not ask for.
    const hidden = await mount(
      form({}),
      draftWith({
        bloodGroup: 'A+',
        licenseNumber: 'old',
        vehicles: [
          {
            ...draftWith().vehicles[0]!,
            transponderNumber: 'old',
            vehiclePassNumber: 'old',
          },
        ],
      }),
    );
    await press('Weiter zu Startmeldungen');
    await press('Weiter zur Prüfung');
    await press('Nennung absenden');
    const sentHidden = hidden[0] as {
      person: Record<string, unknown>;
      entries: Array<{ vehicle: Record<string, unknown> }>;
    };
    expect(sentHidden.person).toMatchObject({
      bloodGroup: null,
      licenseNumber: null,
    });
    expect(sentHidden.entries[0]!.vehicle).toMatchObject({
      transponderNumber: null,
      vehiclePassNumber: null,
    });
  });

  it('follows country and requested start number states in the public form', async () => {
    await mount(
      form({
        country: { state: 'required' },
        requestedStartNumber: { state: 'required' },
      }),
      draftWith({ country: '' }),
      'en',
    );
    expect(control('Country')?.required).toBe(true);
    await press('Continue to entries');
    expect(control('Country')).toBeDefined();
    await fill('Country', 'DE');
    await press('Continue to entries');
    expect(control('Requested number')?.required).toBe(true);
    act(() => root?.unmount());
    container.remove();
    const submissions = await mount(
      form({
        country: { state: 'hidden' },
        requestedStartNumber: { state: 'hidden' },
      }),
      draftWith({
        country: 'DE',
        vehicles: [{ ...draftWith().vehicles[0]!, requestedStartNumber: '42' }],
      }),
    );
    expect(control('Land')).toBeUndefined();
    await press('Weiter zu Startmeldungen');
    expect(control('Wunsch-Startnummer')).toBeUndefined();
    await press('Weiter zur Prüfung');
    await press('Nennung absenden');
    const sent = submissions[0] as {
      person: Record<string, unknown>;
      entries: Array<Record<string, unknown>>;
    };
    expect(sent.person.country).toBeUndefined();
    expect(sent.entries[0]!.requestedStartNumber).toBeNull();
  });

  it('follows the birth date state: optional is not required, hidden is not asked or sent', async () => {
    await mount(form({ dateOfBirth: { state: 'optional' } }), draftWith());
    expect(control('Geburtsdatum')?.required).toBe(false);
    act(() => root?.unmount());
    container.remove();
    const submissions = await mount(
      form({ dateOfBirth: { state: 'hidden' } }),
      draftWith({ dateOfBirth: '' }),
    );
    expect(control('Geburtsdatum')).toBeUndefined();
    await press('Weiter zu Startmeldungen');
    await press('Weiter zur Prüfung');
    await press('Nennung absenden');
    expect(
      (submissions[0] as { person: Record<string, unknown> }).person
        .dateOfBirth,
    ).toBeNull();
  });
});
