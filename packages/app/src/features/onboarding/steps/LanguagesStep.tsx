import { ChoiceCard, ChoiceGroup, QuestionStep } from '@nennbox/ui';
import { eventLanguages, type EventLanguage } from '@nennbox/contracts';
import { languageOptions } from '../languages.js';
import type { StepProps } from './types.js';

const isLanguage = (code: string): code is EventLanguage =>
  (eventLanguages as readonly string[]).includes(code);

/** Languages participants can register in; German is always on, the others are chosen. */
export function LanguagesStep({
  answers,
  resolved,
  patch,
  next,
  canContinue,
  eyebrow,
  accepted,
}: StepProps) {
  // After "Überspringen" the suggestion counts as chosen; otherwise only explicit picks do.
  const chosen: EventLanguage[] =
    answers.languages ?? (accepted ? resolved.languages.slice(1) : []);
  const toggle = (code: EventLanguage, on: boolean) =>
    patch({
      languages: on
        ? [...new Set([...chosen, code])]
        : chosen.filter((item) => item !== code),
    });
  return (
    <QuestionStep
      eyebrow={eyebrow}
      title="In welchen Sprachen nennt man bei euch?"
      lead="NENNBOX übersetzt Formular, Bestätigungsmails und Statusmeldungen selbst. Eure eigenen Texte, also Klassennamen und Teilnahmebedingungen, übersetzt ihr."
      onSubmit={canContinue ? next : undefined}
      note="Mehrfachauswahl. Deutsch ist immer dabei, weitere Sprachen könnt ihr später hinzufügen."
    >
      <ChoiceGroup mode="multiple" columns={3}>
        {languageOptions.map((option) => {
          const code = option.code;
          const main = code === 'de';
          return (
            <ChoiceCard
              key={code}
              value={code}
              checked={main || (isLanguage(code) && chosen.includes(code))}
              onChange={(on) => isLanguage(code) && toggle(code, on)}
              title={option.title}
              description={option.description}
              illustration={<span className="nb-onb-code">{option.short}</span>}
              consequence={option.consequence}
              badge={code === 'en' ? 'Empfohlen' : undefined}
              lockedLabel={main ? 'Hauptsprache' : undefined}
              unavailableReason={
                option.available
                  ? undefined
                  : 'Noch nicht verfügbar, das Nennformular gibt es auf Deutsch und Englisch'
              }
            />
          );
        })}
      </ChoiceGroup>
    </QuestionStep>
  );
}
