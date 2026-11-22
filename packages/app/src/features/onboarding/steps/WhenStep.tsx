import { OnboardingField, OnboardingSwitch, QuestionStep } from '@nennbox/ui';
import { addDays, suggestEntryDeadline } from '@nennbox/contracts';
import { formatDay } from '../format.js';
import type { StepProps } from './types.js';

export function WhenStep({
  answers,
  resolved,
  patch,
  next,
  canContinue,
  eyebrow,
}: StepProps) {
  const multiDay =
    !!resolved.endDate && resolved.endDate !== resolved.startDate;
  const deadlineError =
    resolved.startDate &&
    resolved.entryDeadline &&
    resolved.entryDeadline > resolved.startDate
      ? 'Der Nennschluss muss vor der Veranstaltung liegen.'
      : undefined;
  const endError =
    resolved.startDate &&
    resolved.endDate &&
    resolved.endDate < resolved.startDate
      ? 'Das Ende liegt vor dem Beginn.'
      : undefined;
  return (
    <QuestionStep
      eyebrow={eyebrow}
      title="Wann und wo findet es statt?"
      lead="Titel, Termin, Ort und Nennschluss erscheinen auf der Veranstaltungsseite und im Nennformular."
      onSubmit={canContinue ? next : undefined}
    >
      <div className="nb-onb-fields">
        <OnboardingField
          label="Name der Veranstaltung"
          value={answers.eventTitle ?? resolved.eventTitle}
          onChange={(event) => patch({ eventTitle: event.target.value })}
          hint="Er erscheint als Überschrift im Nennformular."
        />
        <OnboardingField
          type="date"
          label={multiDay ? 'Erster Veranstaltungstag' : 'Datum'}
          value={resolved.startDate ?? ''}
          onChange={(event) => patch({ startDate: event.target.value || null })}
        />
        <OnboardingSwitch
          label="Mehrtägig"
          checked={multiDay}
          onChange={(event) =>
            patch({
              endDate:
                event.target.checked && resolved.startDate
                  ? addDays(resolved.startDate, 1)
                  : resolved.startDate,
            })
          }
        />
        {multiDay && (
          <OnboardingField
            type="date"
            label="Letzter Veranstaltungstag"
            value={resolved.endDate ?? ''}
            error={endError}
            onChange={(event) => patch({ endDate: event.target.value || null })}
          />
        )}
        <OnboardingField
          label="Ort"
          value={answers.location}
          onChange={(event) => patch({ location: event.target.value })}
          placeholder="z. B. Bergstrecke Hohenstein"
          autoComplete="off"
        />
        <OnboardingField
          type="date"
          label="Nennschluss"
          value={resolved.entryDeadline ?? ''}
          error={deadlineError}
          hint={
            resolved.startDate
              ? `Vorschlag: ${formatDay(suggestEntryDeadline(resolved.startDate))}, 14 Tage vorher.`
              : 'Wird nach dem Datum vorgeschlagen (14 Tage vorher).'
          }
          onChange={(event) =>
            patch({ entryDeadline: event.target.value || null })
          }
        />
      </div>
    </QuestionStep>
  );
}
