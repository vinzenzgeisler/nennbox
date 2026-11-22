import { describe, expect, it } from 'vitest';
import { RegistrationFormConfigPatchSchema } from '../registration-config.js';
import { EntryDocumentTypeSchema } from '../documents.js';
import {
  addDays,
  canContinue,
  checkSubdomain,
  createOnboardingAnswers,
  eventKinds,
  eventTemplate,
  nextOnboardingStep,
  onboardingProgress,
  onboardingSteps,
  previousOnboardingStep,
  resolveAnswers,
  slugifyClubName,
  suggestBrandColors,
  suggestEntryDeadline,
  suggestEventConfig,
  type OnboardingAnswers,
} from './index.js';

const answers = (patch: Partial<OnboardingAnswers>): OnboardingAnswers => ({
  ...createOnboardingAnswers(),
  ...patch,
});
const complete = (patch: Partial<OnboardingAnswers> = {}) =>
  answers({
    authMethod: 'google',
    clubName: 'MSC Beispielstadt e. V.',
    kind: 'hillclimb',
    startDate: '2027-06-12',
    location: 'Bergstrecke Beispielstadt',
    ...patch,
  });

describe('club address', () => {
  it('proposes a readable address without legal form and umlauts', () => {
    expect(slugifyClubName('MSC Beispielstadt e. V.')).toBe(
      'msc-beispielstadt',
    );
    expect(slugifyClubName('Motorsportclub Süd-Müller e.V.')).toBe(
      'motorsportclub-sued-mueller',
    );
    expect(slugifyClubName('  ÄÖÜ ß!! ')).toBe('aeoeue-ss');
    expect(slugifyClubName('x'.repeat(60))).toHaveLength(30);
  });
  it('rejects reserved and invalid names and offers a free alternative', () => {
    expect(checkSubdomain('')).toEqual({ status: 'empty' });
    expect(checkSubdomain('www')).toEqual({ status: 'reserved' });
    expect(checkSubdomain('-abc')).toEqual({ status: 'invalid' });
    expect(checkSubdomain('a')).toEqual({ status: 'invalid' });
    expect(checkSubdomain('msc-test', ['msc-test', 'msc-test-2'])).toEqual({
      status: 'taken',
      alternative: 'msc-test-3',
    });
    expect(checkSubdomain('msc-test', ['other'])).toEqual({
      status: 'available',
    });
  });
});

describe('brand colours from a logo', () => {
  it('ignores white and grey and keeps text readable on the primary colour', () => {
    const [first, ...rest] = suggestBrandColors([
      '#FFFFFF',
      '#808080',
      '#FFD400',
      '#1B4DB3',
      '#D62828',
    ]);
    expect(first!.primary).toMatch(/^#[0-9A-F]{6}$/);
    expect(rest.length).toBeGreaterThan(0);
    expect(first!.adjusted).toBe(true);
  });
  it('falls back to the NENNBOX palette when nothing usable was sampled', () => {
    expect(suggestBrandColors(['#FFFFFF', '#CCCCCC'])).toEqual([
      { primary: '#193B30', accent: '#B5E0CA', adjusted: false },
    ]);
  });
});

describe('dates', () => {
  it('proposes the entry deadline 14 days before the event', () => {
    expect(suggestEntryDeadline('2027-06-12')).toBe('2027-05-29');
    expect(addDays('2027-03-05', -14)).toBe('2027-02-19');
  });
});

describe('flow', () => {
  it('adapts the follow-up questions to the event type', () => {
    const steps = (kind: OnboardingAnswers['kind']) =>
      onboardingSteps(answers({ kind }));
    expect(steps('kart')).not.toContain('vehicle-era');
    expect(steps('kart')).not.toContain('vehicle-type');
    expect(steps('rally')).toContain('codriver');
    expect(steps('rally')).not.toContain('double-start');
    expect(steps('hillclimb')).toContain('double-start');
    expect(steps('hillclimb')).not.toContain('codriver');
    for (const kind of eventKinds) {
      const list = steps(kind);
      expect(list[0]).toBe('account');
      expect(list.at(-2)).toBe('summary');
      expect(list.at(-1)).toBe('success');
    }
  });
  it('walks forwards and backwards over the same screens', () => {
    const a = answers({ kind: 'kart' });
    expect(nextOnboardingStep('kind', a)).toBe('starters');
    expect(nextOnboardingStep('starters', a)).toBe('double-start');
    expect(previousOnboardingStep('double-start', a)).toBe('starters');
    expect(previousOnboardingStep('account', a)).toBeNull();
    expect(nextOnboardingStep('success', a)).toBeNull();
  });
  it('reports progress per section', () => {
    const a = answers({ kind: 'hillclimb' });
    expect(onboardingProgress('account', a)).toMatchObject({
      index: 0,
      phase: 'account',
      phaseIndex: 0,
      ratio: 0,
    });
    expect(onboardingProgress('summary', a).ratio).toBe(1);
    expect(onboardingProgress('payment', a).phase).toBe('entry');
    expect(onboardingProgress('numbers', a).phase).toBe('participants');
    expect(onboardingProgress('success', a).phase).toBe('draft');
  });
  it('blocks only screens that have no sensible suggestion', () => {
    const empty = createOnboardingAnswers();
    expect(canContinue('account', empty)).toBe(false);
    expect(canContinue('account', answers({ authMethod: 'passkey' }))).toBe(
      true,
    );
    expect(canContinue('kind', empty)).toBe(false);
    expect(canContinue('starters', empty)).toBe(true);
    expect(canContinue('club', answers({ clubName: 'MSC Test' }))).toBe(true);
    expect(
      canContinue('club', answers({ clubName: 'MSC Test' }), ['msc-test']),
    ).toBe(false);
    expect(canContinue('club', answers({ clubName: '' }))).toBe(false);
    expect(canContinue('when', complete())).toBe(true);
    expect(canContinue('when', complete({ location: '  ' }))).toBe(false);
    expect(canContinue('when', complete({ entryDeadline: '2027-07-01' }))).toBe(
      false,
    );
    expect(canContinue('when', complete({ endDate: '2027-06-01' }))).toBe(
      false,
    );
    expect(
      canContinue(
        'classes',
        complete({ classes: [{ id: 'a', name: ' ', feeCents: 0 }] }),
      ),
    ).toBe(false);
    expect(
      canContinue(
        'classes',
        complete({
          classes: [
            { id: 'a', name: 'A', feeCents: 0 },
            { id: 'b', name: 'a', feeCents: 0 },
          ],
        }),
      ),
    ).toBe(false);
  });
});

describe('suggested event configuration', () => {
  it('takes every undecided answer from the template', () => {
    const resolved = resolveAnswers(complete());
    const template = eventTemplate('hillclimb');
    expect(resolved.numberMode).toBe(template.defaults.numberMode);
    expect(resolved.classes.map((item) => item.name)).toEqual(
      template.classes.map((item) => item.name),
    );
    expect(resolved.entryDeadline).toBe('2027-05-29');
    expect(resolved.endDate).toBe('2027-06-13');
    expect(resolved.eventTitle).toBe('Bergrennen 2027');
  });
  it('makes the licence field and document depend on who starts', () => {
    const licensed = suggestEventConfig(complete({ starters: 'licensed' }));
    expect(licensed.formConfig.fields?.licenseNumber?.state).toBe('required');
    expect(licensed.documents.find((d) => d.key === 'license')?.required).toBe(
      true,
    );
    const guests = suggestEventConfig(complete({ starters: 'guests' }));
    expect(guests.formConfig.fields?.licenseNumber?.state).toBe('hidden');
    expect(guests.documents.some((d) => d.key === 'license')).toBe(false);
    const club = suggestEventConfig(complete({ starters: 'clubsport' }));
    expect(club.formConfig.fields?.licenseNumber?.state).toBe('optional');
  });
  it('requires a vehicle pass for historic vehicles only', () => {
    const historic = suggestEventConfig(complete({ vehicleEra: 'historic' }));
    expect(historic.formConfig.fields?.vehiclePassNumber?.state).toBe(
      'required',
    );
    expect(
      historic.documents.find((d) => d.key === 'vehicle-pass')?.required,
    ).toBe(true);
    const mixed = suggestEventConfig(
      complete({ vehicleEra: 'mixed', historicCutoffYear: 1985 }),
    );
    expect(mixed.documents.find((d) => d.key === 'vehicle-pass')).toMatchObject(
      { required: false, hint: expect.stringContaining('1985') },
    );
    const modern = suggestEventConfig(complete({ vehicleEra: 'modern' }));
    expect(modern.documents.some((d) => d.key === 'vehicle-pass')).toBe(false);
  });
  it('derives capacity and waitlist from the expected field size', () => {
    const small = suggestEventConfig(complete({ expectedStarters: 24 }));
    expect(small.event).toMatchObject({ capacity: 30, waitlist: false });
    const large = suggestEventConfig(complete({ expectedStarters: 118 }));
    expect(large.event).toMatchObject({ capacity: 120, waitlist: true });
    const override = suggestEventConfig(
      complete({ expectedStarters: 118, waitlist: false }),
    );
    expect(override.event.waitlist).toBe(false);
  });
  it('maps number, co-driver and double-start answers to form features', () => {
    const wish = suggestEventConfig(complete({ numberMode: 'requested' }));
    expect(wish.formConfig.fields?.requestedStartNumber?.state).toBe(
      'optional',
    );
    expect(wish.startNumbers.driversMayWish).toBe(true);
    const assigned = suggestEventConfig(
      complete({ numberMode: 'assigned', coDriver: true, doubleStart: false }),
    );
    expect(assigned.formConfig.fields?.requestedStartNumber?.state).toBe(
      'hidden',
    );
    expect(assigned.formConfig.features).toMatchObject({
      passenger: true,
      multipleEntries: false,
    });
  });
  it('maps the payment choice to online and bank transfer', () => {
    expect(
      suggestEventConfig(complete({ paymentMode: 'transfer' })).payment,
    ).toEqual({ online: false, bankTransfer: true, stripe: 'unused' });
    expect(
      suggestEventConfig(complete({ paymentMode: 'both', stripeTiming: 'now' }))
        .payment,
    ).toEqual({ online: true, bankTransfer: true, stripe: 'now' });
    expect(
      suggestEventConfig(complete({ paymentMode: 'online' })).payment.stripe,
    ).toBe('later');
  });
  it('lists what is missing and builds the registration address', () => {
    const empty = suggestEventConfig(createOnboardingAnswers());
    expect(empty.missing).toEqual([
      'clubName',
      'subdomain',
      'kind',
      'startDate',
      'location',
    ]);
    const proposal = suggestEventConfig(complete());
    expect(proposal.missing).toEqual([]);
    expect(proposal.registrationUrl).toBe(
      'https://msc-beispielstadt.nennbox.com/events/bergrennen-2027/register',
    );
  });
  it('explains presets and drops the explanation once the member decided', () => {
    const proposal = suggestEventConfig(complete());
    const codes = proposal.reasons.map((r) => `${r.setting}:${r.reason}`);
    expect(codes).toContain('classes:template-classes');
    expect(codes).toContain('entryDeadline:deadline-14-days');
    const decided = suggestEventConfig(
      complete({ entryDeadline: '2027-06-01', terms: 'Eigene Bedingungen' }),
    );
    const settings = decided.reasons.map((r) => r.setting);
    expect(settings).not.toContain('entryDeadline');
    expect(settings).not.toContain('terms');
  });
  it('produces values the real APIs accept, for every event type', () => {
    for (const kind of eventKinds) {
      const proposal = suggestEventConfig(complete({ kind }));
      expect(
        RegistrationFormConfigPatchSchema.safeParse(proposal.formConfig)
          .success,
      ).toBe(true);
      for (const document of proposal.documents)
        expect(
          EntryDocumentTypeSchema.safeParse({
            ...document,
            hint: document.hint,
          }).success,
        ).toBe(true);
      expect(proposal.classes.length).toBeGreaterThan(0);
      expect(proposal.event.slug).toMatch(/^[a-z0-9-]+$/);
      expect(proposal.terms.length).toBeGreaterThan(80);
    }
  });
});
