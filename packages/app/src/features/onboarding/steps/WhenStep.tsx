import { DateInput, QuestionStep, Stack, Switch, TextInput } from '@nennbox/ui';
import { addDays, suggestEntryDeadline } from '@nennbox/contracts';
import { formatDay } from '../format.js';
import { reasonFor } from '../reasons.js';
import type { StepProps } from './types.js';

export function WhenStep({
  answers,
  resolved,
  proposal,
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
      eyebrow={`${eyebrow} · Termin und Ort`}
      title="Wann und wo findet es statt?"
      lead="Titel, Termin, Ort und Nennschluss erscheinen auf der Veranstaltungsseite und im Nennformular."
      onSubmit={canContinue ? next : undefined}
      why={
        answers.entryDeadline
          ? undefined
          : {
              label: 'Warum dieser Vorschlag',
              text: reasonFor(proposal.reasons, 'entryDeadline') ?? '',
            }
      }
    >
      <Stack gap={6} className="nb-onb-fields">
        <TextInput
          label="Name der Veranstaltung"
          value={answers.eventTitle ?? resolved.eventTitle}
          onChange={(event) => patch({ eventTitle: event.target.value })}
          hint="Er erscheint als Überschrift im Nennformular."
        />
        <DateInput
          label={multiDay ? 'Erster Veranstaltungstag' : 'Datum'}
          value={resolved.startDate ?? ''}
          onChange={(event) => patch({ startDate: event.target.value || null })}
        />
        <Switch
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
          <DateInput
            label="Letzter Veranstaltungstag"
            value={resolved.endDate ?? ''}
            error={endError}
            onChange={(event) => patch({ endDate: event.target.value || null })}
          />
        )}
        <TextInput
          label="Ort"
          value={answers.location}
          onChange={(event) => patch({ location: event.target.value })}
          placeholder="z. B. Bergstrecke Hohenstein"
          autoComplete="off"
        />
        <DateInput
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
      </Stack>
    </QuestionStep>
  );
}
