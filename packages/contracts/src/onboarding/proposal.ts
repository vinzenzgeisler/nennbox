import type { RegistrationFormConfigPatch } from '../registration-config.js';
import { checkSubdomain, slugifyTitle } from './helpers.js';
import { resolveAnswers, type ResolvedAnswers } from './answers.js';
import { eventTemplate } from './templates.js';
import type {
  DocumentKey,
  EventKind,
  NumberMode,
  OnboardingAnswers,
  OnboardingClass,
  ProposedSetting,
  RegistrationFieldChoice,
} from './types.js';

export interface ProposedDocument {
  key: DocumentKey;
  name: string;
  required: boolean;
  hint: string | null;
}

export type FieldStates = Partial<Record<string, RegistrationFieldChoice>>;

export interface EventConfigProposal {
  organization: {
    name: string;
    subdomain: string;
    primaryColor: string;
    accentColor: string;
    logoName: string | null;
  };
  event: {
    title: string;
    slug: string;
    kind: EventKind;
    startDate: string | null;
    endDate: string | null;
    location: string;
    entryDeadline: string | null;
    capacity: number;
    waitlist: boolean;
  };
  classes: OnboardingClass[];
  /** Merges into the event's registration form configuration (#21). */
  formConfig: RegistrationFormConfigPatch;
  documents: ProposedDocument[];
  startNumbers: {
    mode: NumberMode;
    range: { from: number; to: number };
    driversMayWish: boolean;
  };
  payment: {
    online: boolean;
    bankTransfer: boolean;
    stripe: 'now' | 'later' | 'unused';
  };
  terms: string;
  registrationUrl: string;
  reasons: ProposedSetting[];
  /** Answers that cannot be suggested; the flow does not let the member finish without them. */
  missing: Array<'clubName' | 'subdomain' | 'kind' | 'startDate' | 'location'>;
}

const doc = (
  key: DocumentKey,
  name: string,
  required: boolean,
  hint: string | null = null,
): ProposedDocument => ({ key, name, required, hint });

function proposeDocuments(r: ResolvedAnswers): ProposedDocument[] {
  const documents = [
    doc('vehicle-registration', 'Fahrzeugschein', true, 'Foto oder PDF'),
  ];
  if (r.starters === 'licensed') documents.push(doc('license', 'Lizenz', true));
  if (r.starters === 'clubsport')
    documents.push(
      doc(
        'club-membership',
        'Clubausweis',
        r.kind === 'kart',
        'Aktuelle Saison',
      ),
    );
  if (r.vehicleEra !== 'modern')
    documents.push(
      doc(
        'vehicle-pass',
        'Fahrzeugpass',
        r.vehicleEra === 'historic',
        r.vehicleEra === 'mixed'
          ? `Nur für Fahrzeuge bis Baujahr ${r.historicCutoffYear}`
          : null,
      ),
    );
  return documents;
}

const eventSlugFor = (title: string, subdomain: string) =>
  slugifyTitle(title) || `${subdomain || 'event'}-nennung`;

export function suggestEventConfig(
  answers: OnboardingAnswers,
): EventConfigProposal {
  const r = resolveAnswers(answers);
  const template = eventTemplate(r.kind);
  const reasons: ProposedSetting[] = [];
  const reason = (setting: string, code: ProposedSetting['reason']) =>
    reasons.push({ setting, reason: code });

  const fields: FieldStates = {};
  fields.licenseNumber =
    r.starters === 'licensed'
      ? 'required'
      : r.starters === 'clubsport'
        ? 'optional'
        : 'hidden';
  reason(
    'licenseNumber',
    r.starters === 'licensed'
      ? 'license-required'
      : r.starters === 'clubsport'
        ? 'license-optional'
        : 'license-hidden',
  );
  if (r.vehicleEra === 'historic') {
    fields.vehiclePassNumber = 'required';
    fields.year = 'required';
    reason('vehiclePassNumber', 'vehicle-pass-historic');
  } else if (r.vehicleEra === 'mixed') {
    fields.vehiclePassNumber = 'optional';
    reason('vehiclePassNumber', 'vehicle-pass-mixed');
  }
  fields.requestedStartNumber =
    r.numberMode === 'requested' ? 'optional' : 'hidden';
  reason(
    'startNumbers',
    r.numberMode === 'requested'
      ? 'start-number-wish'
      : r.numberMode === 'assigned'
        ? 'start-number-assigned'
        : 'start-number-automatic',
  );
  if (template.displacementClasses) {
    fields.displacement = 'required';
    reason('displacement', 'displacement-classes');
  }
  if (template.timing) {
    fields.transponderNumber = 'optional';
    reason('transponderNumber', 'timing-transponder');
  }
  if (r.kind === 'kart' || r.kind === 'circuit') {
    fields.emergencyContact = 'required';
    reason('emergencyContact', 'safety-emergency-contact');
  }

  const capacity = Math.ceil(r.expectedStarters / 10) * 10;
  reason('capacity', 'capacity-from-expected');
  reason('waitlist', r.waitlist ? 'waitlist-on' : 'waitlist-off');
  reason('coDriver', r.coDriver ? 'co-driver-on' : 'co-driver-off');
  reason('doubleStart', r.doubleStart ? 'double-start-on' : 'double-start-off');
  reason(
    'payment',
    r.paymentMode === 'online'
      ? 'payment-online'
      : r.paymentMode === 'transfer'
        ? 'payment-transfer'
        : 'payment-both',
  );
  if (!answers.entryDeadline && r.entryDeadline)
    reason('entryDeadline', 'deadline-14-days');
  if (!answers.classes) reason('classes', 'template-classes');
  if (answers.terms === null) reason('terms', 'template-terms');
  reason('brand', answers.logoName ? 'brand-from-logo' : 'brand-default');

  const online = r.paymentMode !== 'transfer';
  const subdomainOk =
    checkSubdomain(r.subdomain).status === 'available' ? r.subdomain : '';
  const missing: EventConfigProposal['missing'] = [];
  if (!r.clubName) missing.push('clubName');
  if (!subdomainOk) missing.push('subdomain');
  if (!answers.kind) missing.push('kind');
  if (!r.startDate) missing.push('startDate');
  if (!r.location) missing.push('location');

  const slug = eventSlugFor(r.eventTitle, r.subdomain);
  return {
    organization: {
      name: r.clubName,
      subdomain: r.subdomain,
      primaryColor: r.primaryColor,
      accentColor: r.accentColor,
      logoName: answers.logoName,
    },
    event: {
      title: r.eventTitle,
      slug,
      kind: r.kind,
      startDate: r.startDate,
      endDate: r.endDate,
      location: r.location,
      entryDeadline: r.entryDeadline,
      capacity,
      waitlist: r.waitlist,
    },
    classes: r.classes,
    formConfig: {
      branding: {
        logoLightObjectId: null,
        logoDarkObjectId: null,
        headerImageObjectId: null,
        primaryColor: r.primaryColor,
        accentColor: r.accentColor,
        headingFont: 'archivo',
        corners: 'square',
      },
      fields: Object.fromEntries(
        Object.entries(fields).map(([key, state]) => [key, { state }]),
      ) as RegistrationFormConfigPatch['fields'],
      features: {
        passenger: r.coDriver,
        spareVehicle: false,
        multipleEntries: r.doubleStart,
      },
    },
    documents: proposeDocuments(r),
    startNumbers: {
      mode: r.numberMode,
      range: template.startNumberRange,
      driversMayWish: r.numberMode === 'requested',
    },
    payment: {
      online,
      bankTransfer: r.paymentMode !== 'online',
      stripe: online ? r.stripeTiming : 'unused',
    },
    terms: r.terms,
    registrationUrl: `https://${r.subdomain || 'verein'}.nennbox.com/events/${slug}/register`,
    reasons,
    missing,
  };
}
