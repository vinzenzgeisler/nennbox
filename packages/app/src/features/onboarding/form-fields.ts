import {
  proposedFieldState,
  suggestEventConfig,
  type EventConfigProposal,
  type OnboardingAnswers,
  type ProposedDocument,
  type ResolvedAnswers,
} from '@nennbox/contracts';
import { registrationFieldLabels } from '../registration/registrationFieldLabels.js';
import { shortReasons } from './short-reasons.js';

export type FormFieldRow = {
  id: string;
  group: string;
  name: string;
  tag: 'Pflicht' | 'Freiwillig' | 'Datei' | 'Abgeschaltet';
  tone: 'required' | 'optional' | 'file' | 'off';
  reason: string;
  /** Only optional fields can be turned off; `null` for rows that always stay. */
  switchKey: string[] | null;
  on: boolean;
};

type Spec = {
  id: string;
  group: string;
  name: string;
  /** Registration form fields behind this row; none for fields that are always there. */
  keys?: string[];
  reason: string;
  /** Setting whose short reason explains the row, when the proposal gives one. */
  setting?: string;
};

const person = 'Person';
const vehicle = 'Fahrzeug';
const specs = (resolved: ResolvedAnswers): Spec[] => [
  {
    id: 'name',
    group: person,
    name: 'Vorname und Nachname',
    reason: 'Immer dabei',
  },
  {
    id: 'email',
    group: person,
    name: 'E-Mail-Adresse',
    reason: 'Für Bestätigung und Rückfragen',
  },
  {
    id: 'dob',
    group: person,
    name: registrationFieldLabels.dateOfBirth!,
    keys: ['dateOfBirth'],
    reason: 'Für Altersgrenzen und Jugendschutz',
  },
  {
    id: 'address',
    group: person,
    name: 'Anschrift',
    keys: ['street', 'postalCode', 'city', 'country'],
    reason: 'Für Bestätigung und Unterlagen',
  },
  {
    id: 'phone',
    group: person,
    name: registrationFieldLabels.phone!,
    keys: ['phone'],
    reason: 'Für Rückfragen am Veranstaltungstag',
  },
  {
    id: 'emergency',
    group: person,
    name: registrationFieldLabels.emergencyContact!,
    keys: ['emergencyContact'],
    reason: 'Aus Sicherheitsgründen',
    setting: 'emergencyContact',
  },
  {
    id: 'blood',
    group: person,
    name: registrationFieldLabels.bloodGroup!,
    keys: ['bloodGroup'],
    reason: 'Für den Notfall',
  },
  {
    id: 'publication',
    group: person,
    name: registrationFieldLabels.publicationPreference!,
    keys: ['publicationPreference'],
    reason: 'Ob der Name in Listen erscheinen darf',
  },
  {
    id: 'biography',
    group: person,
    name: registrationFieldLabels.biography!,
    keys: ['biography'],
    reason: 'Freier Text der Teilnehmer',
  },
  {
    id: 'notes',
    group: person,
    name: registrationFieldLabels.organizerNotes!,
    keys: ['organizerNotes'],
    reason: 'Platz für Wünsche und Rückfragen',
  },
  {
    id: 'license',
    group: 'Lizenz und Club',
    name: registrationFieldLabels.licenseNumber!,
    keys: ['licenseNumber'],
    reason: 'Lizenzfragen stehen beim Starterkreis',
    setting: 'licenseNumber',
  },
  {
    id: 'vehicle',
    group: vehicle,
    name: 'Hersteller und Modell',
    keys: ['make', 'model'],
    reason: 'Steht später in der Startliste',
  },
  {
    id: 'year',
    group: vehicle,
    name: registrationFieldLabels.year!,
    keys: ['year'],
    reason: `Historisch bis Baujahr ${resolved.historicCutoffYear}`,
  },
  {
    id: 'displacement',
    group: vehicle,
    name: registrationFieldLabels.displacement!,
    keys: ['displacement'],
    reason: 'Eure Klassen richten sich nach dem Hubraum',
    setting: 'displacement',
  },
  {
    id: 'cylinders',
    group: vehicle,
    name: registrationFieldLabels.cylinders!,
    keys: ['cylinders'],
    reason: 'Technische Angabe zum Fahrzeug',
  },
  {
    id: 'wish',
    group: vehicle,
    name: registrationFieldLabels.requestedStartNumber!,
    keys: ['requestedStartNumber'],
    reason: 'Ihr gebt sie frei',
    setting: 'startNumbers',
  },
  {
    id: 'transponder',
    group: vehicle,
    name: registrationFieldLabels.transponderNumber!,
    keys: ['transponderNumber'],
    reason: 'Nur bei elektronischer Zeitnahme',
    setting: 'transponderNumber',
  },
  {
    id: 'pass',
    group: vehicle,
    name: registrationFieldLabels.vehiclePassNumber!,
    keys: ['vehiclePassNumber'],
    reason: 'Für historische Fahrzeuge',
    setting: 'vehiclePassNumber',
  },
  {
    id: 'owner',
    group: vehicle,
    name: registrationFieldLabels.owner!,
    keys: ['owner'],
    reason: 'Wenn das Fahrzeug nicht dem Fahrer gehört',
  },
  {
    id: 'history',
    group: vehicle,
    name: registrationFieldLabels.history!,
    keys: ['history'],
    reason: 'Freier Text zur Geschichte des Fahrzeugs',
  },
  {
    id: 'image',
    group: vehicle,
    name: registrationFieldLabels.vehicleImage!,
    keys: ['vehicleImage'],
    reason: 'Seht ihr später in eurer Nennungsliste',
  },
];

const tagOf = (state: string) =>
  state === 'required' ? ('Pflicht' as const) : ('Freiwillig' as const);

/**
 * Every field of the registration form as the member will see it, in groups. A field
 * whose state is "hidden" in the proposal is left out; one the member turned off stays
 * in the list as "Abgeschaltet" so it can be found and turned on again.
 */
export function formFieldRows(
  answers: OnboardingAnswers,
  resolved: ResolvedAnswers,
  proposal: EventConfigProposal,
): { rows: FormFieldRow[]; documents: ProposedDocument[] } {
  // The proposal without the member's switches tells which fields can be turned off at all.
  const base = suggestEventConfig({ ...answers, hiddenFields: [] });
  const rows: FormFieldRow[] = [];
  for (const spec of specs(resolved)) {
    if (!spec.keys) {
      rows.push({
        id: spec.id,
        group: spec.group,
        name: spec.name,
        tag: 'Pflicht',
        tone: 'required',
        reason: spec.reason,
        switchKey: null,
        on: true,
      });
      continue;
    }
    const baseState = proposedFieldState(base, spec.keys[0]!);
    const off = answers.hiddenFields.includes(spec.keys[0]!);
    if (baseState === 'hidden' && !off) continue;
    const reasonCode = spec.setting
      ? proposal.reasons.find((item) => item.setting === spec.setting)?.reason
      : undefined;
    const reason = reasonCode ? shortReasons[reasonCode] : spec.reason;
    if (off && baseState !== 'required')
      rows.push({
        id: spec.id,
        group: spec.group,
        name: spec.name,
        tag: 'Abgeschaltet',
        tone: 'off',
        reason,
        switchKey: spec.keys,
        on: false,
      });
    else
      rows.push({
        id: spec.id,
        group: spec.group,
        name: spec.name,
        tag: tagOf(baseState),
        tone: baseState === 'required' ? 'required' : 'optional',
        reason,
        switchKey: baseState === 'required' ? null : spec.keys,
        on: true,
      });
  }
  rows.push(
    {
      id: 'class',
      group: 'Klasse und Zahlung',
      name: 'Klasse',
      tag: 'Pflicht',
      tone: 'required',
      reason: `Zur Auswahl stehen eure ${resolved.classes.length} Klassen`,
      switchKey: null,
      on: true,
    },
    {
      id: 'payment',
      group: 'Klasse und Zahlung',
      name: 'Zahlungsart',
      tag: 'Pflicht',
      tone: 'required',
      reason:
        proposal.payment.online && proposal.payment.bankTransfer
          ? 'Online oder Überweisung'
          : proposal.payment.online
            ? 'Online'
            : 'Überweisung',
      switchKey: null,
      on: true,
    },
  );
  return { rows, documents: proposal.documents };
}
