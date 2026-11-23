import {
  AppButton,
  ChoiceCard,
  ChoiceGroup,
  OnboardingIcon,
  QuestionStep,
} from '@nennbox/ui';
import { formatEuro, type OnboardingStepId } from '@nennbox/contracts';
import { choiceSteps } from '../choices.js';
import { formFieldRows } from '../form-fields.js';
import { formatDay, formatRange } from '../../../format.js';
import { icons } from '../icons.js';
import { languageName, languageSummary } from '../languages.js';
import type { Outcome } from '../state.js';
import type { StepProps } from './types.js';

const label = (id: keyof typeof choiceSteps, value: string) =>
  choiceSteps[id].options.find((option) => option.value === value)?.title ??
  value;

type Row = {
  label: string;
  value: string;
  note?: string | undefined;
  step: OnboardingStepId;
};

export function SummaryStep({
  proposal,
  resolved,
  answers,
  go,
  way,
  onWay,
  next,
  canContinue,
  eyebrow,
}: StepProps & {
  go: (step: OnboardingStepId) => void;
  way: Outcome;
  onWay: (way: Outcome) => void;
}) {
  const { organization, event, classes, payment } = proposal;
  const fees = classes.map((item) => item.feeCents);
  const form = formFieldRows(answers, resolved, proposal);
  const fieldCount =
    form.rows.filter((row) => row.on).length + form.documents.length + 1;
  const switchedOff = form.rows.filter((row) => !row.on).length;
  const extra = resolved.languages.length - 1;
  const days =
    event.startDate && event.endDate && event.endDate !== event.startDate
      ? 'Mehrtägig'
      : 'Eintägig';
  const rows: Row[] = [
    {
      label: 'Verein',
      value: organization.name,
      note: `${organization.subdomain}.nennbox.com`,
      step: 'club',
    },
    {
      label: 'Veranstaltung',
      value: event.title,
      note: label('kind', resolved.kind),
      step: 'kind',
    },
    {
      label: 'Termin',
      value: formatRange(event.startDate, event.endDate),
      note: days,
      step: 'when',
    },
    { label: 'Ort', value: event.location, step: 'when' },
    {
      label: 'Nennschluss',
      value: formatDay(event.entryDeadline),
      note: answers.entryDeadline ? undefined : '14 Tage vorher',
      step: 'when',
    },
    {
      label: 'Klassen',
      value: classes.length
        ? `${classes.length} Klassen, ${formatEuro(Math.min(...fees))} bis ${formatEuro(Math.max(...fees))}`
        : 'Keine Klassen',
      note: answers.classes
        ? 'Angepasst'
        : `Aus der Vorlage ${label('kind', resolved.kind)}`,
      step: 'classes',
    },
    {
      label: 'Starter',
      value: label('starters', resolved.starters),
      note:
        resolved.vehicleEra === 'modern'
          ? 'Moderne Fahrzeuge'
          : `${label('vehicle-era', resolved.vehicleEra)} bis Baujahr ${resolved.historicCutoffYear}`,
      step: 'starters',
    },
    {
      label: 'Plätze',
      value: `${event.capacity} Starter`,
      note: event.waitlist ? 'Mit Warteliste' : 'Ohne Warteliste',
      step: 'expected',
    },
    {
      label: 'Startnummern',
      value: label('numbers', resolved.numberMode),
      note: `Bereich ${proposal.startNumbers.range.from} bis ${proposal.startNumbers.range.to}`,
      step: 'numbers',
    },
    {
      label: 'Zahlung',
      value: [payment.online && 'Online', payment.bankTransfer && 'Überweisung']
        .filter(Boolean)
        .join(' und '),
      note:
        payment.stripe === 'later'
          ? 'Online-Zahlung wird später aktiviert'
          : payment.stripe === 'now'
            ? 'Online-Zahlung wird jetzt aktiviert'
            : undefined,
      step: 'payment',
    },
    {
      label: 'Sprachen',
      value: languageSummary(resolved.languages),
      note:
        extra > 0
          ? `Klassennamen und Teilnahmebedingungen in ${resolved.languages
              .slice(1)
              .map(languageName)
              .join(', ')} offen`
          : undefined,
      step: 'languages',
    },
    {
      label: 'Nennformular',
      value: `${fieldCount} Felder, ${form.documents.length} Unterlagen`,
      note: switchedOff
        ? `${switchedOff} ${switchedOff === 1 ? 'Feld' : 'Felder'} abgeschaltet`
        : undefined,
      step: 'form',
    },
    {
      label: 'Teilnahmebedingungen',
      value:
        answers.terms === null ? 'Mustertext übernommen' : 'Angepasster Text',
      note: 'Noch nicht rechtlich geprüft',
      step: 'terms',
    },
  ];
  const ways: Array<{
    id: Outcome;
    title: string;
    description: string;
    consequence: string;
    icon: string;
    badge?: string;
  }> = [
    {
      id: 'draft',
      title: 'Erst als Entwurf',
      description:
        'Nur ihr seht die Veranstaltung. Ihr könnt alles ansehen und öffnen, wann ihr wollt.',
      consequence:
        'Nichts wird öffentlich, der Vorschau-Link gilt nur für euch',
      icon: icons.licensed,
      badge: 'Empfohlen',
    },
    {
      id: 'open',
      title: 'Jetzt öffnen',
      description:
        'Der Link ist sofort öffentlich. Teilnehmer können ab dieser Minute nennen und bezahlen.',
      consequence:
        'Veranstaltungsseite geht online, die ersten Nennungen laufen ein',
      icon: icons.globe,
    },
  ];
  return (
    <QuestionStep
      eyebrow={eyebrow}
      title="Alles bereit zum Öffnen?"
      lead="Rechts seht ihr, was eure Teilnehmer sehen werden. Jede Zeile lässt sich einzeln ändern, auch wenn die Nennung schon offen ist."
      onSubmit={canContinue ? next : undefined}
    >
      <dl className="nb-onb-summary">
        {rows.map((row) => (
          <div key={row.label} className="nb-onb-summary-row">
            <dt>{row.label}</dt>
            <dd>
              <span className="nb-onb-summary-value">{row.value || '–'}</span>
              {row.note && (
                <span className="nb-onb-summary-note">{row.note}</span>
              )}
            </dd>
            <AppButton
              tone="ghost"
              aria-label={`${row.label} ändern`}
              onClick={() => go(row.step)}
            >
              Ändern
            </AppButton>
          </div>
        ))}
      </dl>
      <div className="nb-onb-way">
        <h2 className="nb-onb-followup-title">Wie wollt ihr starten?</h2>
        <p className="nb-onb-note">
          Öffnen könnt ihr jederzeit mit einem Klick. Zurücknehmen ist
          schwieriger, sobald die erste Nennung da ist.
        </p>
        <ChoiceGroup columns={2} aria-label="Wie wollt ihr starten?">
          {ways.map((item) => (
            <ChoiceCard
              key={item.id}
              value={item.id}
              checked={way === item.id}
              onChange={() => onWay(item.id)}
              title={item.title}
              description={item.description}
              consequence={item.consequence}
              illustration={<OnboardingIcon path={item.icon} />}
              badge={item.badge}
            />
          ))}
        </ChoiceGroup>
      </div>
    </QuestionStep>
  );
}
