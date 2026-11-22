import { OnboardingIcon, type EmergingGroup } from '@nennbox/ui';
import {
  formatEuro,
  type EventConfigProposal,
  type OnboardingAnswers,
  type OnboardingStepId,
  type ResolvedAnswers,
} from '@nennbox/contracts';
import { choiceSteps } from './choices.js';
import { formatRange } from './format.js';
import { icons } from './icons.js';
import { formFieldRows } from './form-fields.js';
import { languageSummary } from './languages.js';
import { formRows, type EmergingFieldInput } from './emerging-form.js';

export type EmergingInput = {
  answers: OnboardingAnswers;
  resolved: ResolvedAnswers;
  proposal: EventConfigProposal;
  steps: OnboardingStepId[];
  current: OnboardingStepId;
  /** Screens the member passed with "Überspringen": the suggestion counts as accepted. */
  skipped: OnboardingStepId[];
};

const open = 'noch offen';
export { open as emergingOpenLabel };

const title = (id: keyof typeof choiceSteps, value: string) =>
  choiceSteps[id].options.find((option) => option.value === value)?.title ??
  value;

/**
 * Rows of "Das entsteht". Every row exists from the start; it shows its value as soon
 * as the answer that decides it is given, was skipped, or lies behind the current
 * screen. Everything else says "noch offen" so the member sees what is still to come.
 */
export function buildEmerging(input: EmergingInput): {
  groups: EmergingGroup[];
  known: number;
  total: number;
} {
  const { answers, resolved, proposal, steps, current, skipped } = input;
  const here = steps.indexOf(current);
  const answered: Partial<Record<OnboardingStepId, boolean>> = {
    club: answers.clubName.trim().length > 1,
    brand: answers.logoName !== null || answers.primaryColor !== null,
    kind: answers.kind !== null,
    starters: answers.starters !== null,
    'vehicle-era': answers.vehicleEra !== null,
    'vehicle-type': answers.vehicleType !== null,
    languages: answers.languages !== null,
    numbers: answers.numberMode !== null,
    expected: answers.expectedStarters !== null,
    payment: answers.paymentMode !== null,
    codriver: answers.coDriver !== null,
    'double-start': answers.doubleStart !== null,
    classes: answers.classes !== null,
    when: answers.startDate !== null,
    terms: answers.terms !== null,
  };
  const decided = (id: OnboardingStepId) =>
    steps.includes(id) &&
    (Boolean(answered[id]) || skipped.includes(id) || steps.indexOf(id) < here);
  const known = (id: OnboardingStepId, value: string | null | undefined) =>
    decided(id) && value ? value : null;

  const cheapest = proposal.classes.length
    ? Math.min(...proposal.classes.map((item) => item.feeCents))
    : 0;
  const classCount = proposal.classes.length;
  const range = proposal.startNumbers.range;
  const payment = [
    proposal.payment.online && 'Online',
    proposal.payment.bankTransfer && 'Überweisung',
  ]
    .filter(Boolean)
    .join(' und ');

  type Fact = {
    id: string;
    label: string;
    value: string | null;
    derived?: boolean;
  };
  const facts: Fact[] = [
    {
      id: 'club',
      label: 'Verein',
      value: known('club', answers.clubName.trim()),
    },
    {
      id: 'address',
      label: 'Adresse',
      value: known(
        'club',
        resolved.subdomain && `${resolved.subdomain}.nennbox.com`,
      ),
    },
    {
      id: 'brand',
      label: 'Farben',
      value: known('brand', answers.logoName ? 'Aus dem Logo' : 'NENNBOX-Grün'),
    },
    {
      id: 'kind',
      label: 'Art',
      value: known('kind', title('kind', resolved.kind)),
    },
    {
      id: 'classes',
      label: 'Klassen',
      value: known(
        'kind',
        `${classCount} ${answers.classes ? 'Klassen' : 'vorgeschlagen'}, ab ${formatEuro(cheapest)}`,
      ),
      derived: answers.classes === null,
    },
    {
      id: 'numbers',
      label: 'Nummern',
      value: known('kind', `${range.from} bis ${range.to}`),
      derived: true,
    },
    {
      id: 'starters',
      label: 'Starter',
      value: known('starters', title('starters', resolved.starters)),
    },
    ...(steps.includes('vehicle-era')
      ? [
          {
            id: 'era',
            label: 'Fahrzeuge',
            value: known(
              'vehicle-era',
              resolved.vehicleEra === 'historic'
                ? `Historisch bis ${resolved.historicCutoffYear}`
                : resolved.vehicleEra === 'mixed'
                  ? `Gemischt, Grenze ${resolved.historicCutoffYear}`
                  : 'Modern',
            ),
          },
        ]
      : []),
    {
      id: 'languages',
      label: 'Sprachen',
      value: known('languages', languageSummary(resolved.languages)),
    },
    {
      id: 'capacity',
      label: 'Plätze',
      value: known(
        'expected',
        `${proposal.event.capacity}${proposal.event.waitlist ? ', mit Warteliste' : ''}`,
      ),
    },
    { id: 'payment', label: 'Zahlung', value: known('payment', payment) },
    {
      id: 'when',
      label: 'Termin',
      value: known(
        'when',
        resolved.startDate && formatRange(resolved.startDate, resolved.endDate),
      ),
    },
    {
      id: 'place',
      label: 'Ort',
      value: known('when', resolved.location),
    },
  ];

  const { fields, documents } = formRows(proposal, resolved, steps, decided);
  const row = (item: Fact) => ({
    kind: 'fact' as const,
    id: item.id,
    label: item.label,
    value: item.value,
    derived: item.derived,
    derivedLabel: 'abgeleitet',
    signature: `${item.value ?? ''}`,
  });
  const fieldRow = (item: EmergingFieldInput) => ({
    kind: 'field' as const,
    id: item.id,
    name: item.name,
    tag: item.tag,
    tone: item.tone,
    reason: item.reason,
    signature: `${item.tag}|${item.reason}`,
  });

  // Fields the member turned off stay in the list, pale, so they can be found again.
  const switchedOff = formFieldRows(answers, resolved, proposal)
    .rows.filter((item) => item.tone === 'off')
    .map((item) => ({
      id: item.id,
      name: item.name,
      tag: item.tag,
      tone: 'off' as const,
      reason: item.reason,
    }));
  const extraLanguages = resolved.languages.length - 1;
  const translations: EmergingFieldInput[] =
    decided('languages') && extraLanguages > 0
      ? [
          {
            id: 'tr-classes',
            name: 'Klassennamen',
            tag: `${extraLanguages} ${extraLanguages === 1 ? 'Sprache' : 'Sprachen'}`,
            tone: 'file',
            reason: answers.classes
              ? `${proposal.classes.length} Klassen`
              : `${proposal.classes.length || 'Eure'} Klassen aus eurer Vorlage`,
          },
          {
            id: 'tr-terms',
            name: 'Teilnahmebedingungen',
            tag: `${extraLanguages} ${extraLanguages === 1 ? 'Sprache' : 'Sprachen'}`,
            tone: 'file',
            reason: 'Der Mustertext kommt nur auf Deutsch',
          },
          {
            id: 'tr-title',
            name: 'Name der Veranstaltung',
            tag: 'Freiwillig',
            tone: 'optional',
            reason: 'Ohne Übersetzung steht überall der deutsche Name',
          },
        ]
      : [];
  const groups: EmergingGroup[] = [
    {
      id: 'event',
      title: 'Eure Veranstaltung',
      icon: <OnboardingIcon path={icons.stats} />,
      rows: facts.map(row),
    },
    {
      id: 'form',
      title: 'Das fragt das Nennformular',
      icon: <OnboardingIcon path={icons.form} />,
      rows: [...fields.map(fieldRow), ...switchedOff.map(fieldRow)],
    },
  ];
  if (documents.length)
    groups.push({
      id: 'documents',
      title: 'Diese Unterlagen verlangt ihr',
      icon: <OnboardingIcon path={icons.docs} />,
      rows: documents.map(fieldRow),
    });
  if (translations.length)
    groups.push({
      id: 'translations',
      title: `Das übersetzt ihr selbst · ${(proposal.classes.length + 2) * extraLanguages} offen`,
      icon: <OnboardingIcon path={icons.translate} />,
      rows: translations.map(fieldRow),
    });
  return {
    groups,
    known: facts.filter((item) => item.value !== null).length,
    total: facts.length,
  };
}
