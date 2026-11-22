import { OnboardingSwitch, QuestionStep } from '@nennbox/ui';
import { formFieldRows, type FormFieldRow } from '../form-fields.js';
import type { StepProps } from './types.js';

/** Group names in the order of the reference; rows keep the order of the form. */
const groupOrder = [
  'Person',
  'Lizenz und Club',
  'Fahrzeug',
  'Klasse und Zahlung',
  'Unterlagen und Bestätigung',
];

export function FormStep({
  answers,
  resolved,
  proposal,
  patch,
  next,
  canContinue,
  eyebrow,
}: StepProps) {
  const { rows, documents } = formFieldRows(answers, resolved, proposal);
  const docRows: FormFieldRow[] = [
    ...documents.map((item) => ({
      id: `doc-${item.key}`,
      group: 'Unterlagen und Bestätigung',
      name: item.name,
      tag: item.required ? ('Datei' as const) : ('Freiwillig' as const),
      tone: item.required ? ('file' as const) : ('optional' as const),
      reason: item.hint ?? 'Wird beim Nennen hochgeladen',
      switchKey: null,
      on: true,
    })),
    {
      id: 'terms',
      group: 'Unterlagen und Bestätigung',
      name: 'Teilnahmebedingungen',
      tag: 'Pflicht',
      tone: 'required',
      reason: 'Mustertext, den ihr im Anschluss anpassen könnt',
      switchKey: null,
      on: true,
    },
  ];
  const all = [...rows, ...docRows];
  const active = all.filter((row) => row.on);
  const stats = [
    { value: active.length, label: 'Felder insgesamt' },
    {
      value: active.filter((row) => row.tone === 'required').length,
      label: 'davon Pflicht',
    },
    { value: documents.length, label: 'Unterlagen' },
    { value: resolved.classes.length, label: 'Klassen zur Wahl' },
  ];
  const toggle = (row: FormFieldRow, on: boolean) => {
    const keys = row.switchKey ?? [];
    patch({
      hiddenFields: on
        ? answers.hiddenFields.filter((key) => !keys.includes(key))
        : [...new Set([...answers.hiddenFields, ...keys])],
    });
  };
  return (
    <QuestionStep
      eyebrow={eyebrow}
      title="Das füllen eure Teilnehmer aus"
      lead="Alles davon ergibt sich aus euren Antworten. Freiwillige Felder könnt ihr hier abschalten, Pflichtfelder bleiben, weil ihr sie braucht."
      onSubmit={canContinue ? next : undefined}
      note="Ihr könnt später eigene Felder ergänzen, etwa eine Frage nach dem Hotel oder nach der Anzahl der Helfer. Für den Start reicht das hier."
    >
      <dl className="nb-onb-stats">
        {stats.map((stat) => (
          <div key={stat.label}>
            <dd>{stat.value}</dd>
            <dt>{stat.label}</dt>
          </div>
        ))}
      </dl>
      {groupOrder.map((group) => {
        const list = all.filter((row) => row.group === group);
        if (!list.length) return null;
        return (
          <section key={group} className="nb-onb-form-group">
            <div className="nb-onb-form-head">
              <h2>{group}</h2>
              <span>{list.length} Felder</span>
            </div>
            <ul>
              {list.map((row) => (
                <li
                  key={row.id}
                  className={`nb-onb-form-row${row.on ? '' : ' is-off'}`}
                >
                  <span className="nb-onb-form-name">
                    {row.name}
                    <span className={`nb-emerging-tag is-${row.tone}`}>
                      {row.tag}
                    </span>
                  </span>
                  <span className="nb-onb-form-reason">{row.reason}</span>
                  {row.switchKey && (
                    <OnboardingSwitch
                      label={`${row.name} im Formular anzeigen`}
                      hideLabel
                      checked={row.on}
                      onChange={(event) => toggle(row, event.target.checked)}
                    />
                  )}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </QuestionStep>
  );
}
