import { useState } from 'react';
import { Button, Inline, QuestionStep, Stack, TextInput } from '@racepilot/ui';
import { formatEuro, type OnboardingClass } from '@racepilot/contracts';
import { reasonFor } from '../reasons.js';
import type { StepProps } from './types.js';

export function ClassesStep({
  resolved,
  proposal,
  patch,
  next,
  canContinue,
  eyebrow,
}: StepProps) {
  const classes = resolved.classes;
  const [selectedId, setSelectedId] = useState(classes[0]?.id);
  const selected = classes.find((item) => item.id === selectedId) ?? classes[0];
  const update = (list: OnboardingClass[]) => patch({ classes: list });
  const change = (id: string, part: Partial<OnboardingClass>) =>
    update(
      classes.map((item) => (item.id === id ? { ...item, ...part } : item)),
    );
  const add = () => {
    const id = `class-${Date.now().toString(36)}`;
    update([
      ...classes,
      { id, name: '', feeCents: classes.at(-1)?.feeCents ?? 5000 },
    ]);
    setSelectedId(id);
  };
  const remove = (id: string) => {
    const rest = classes.filter((item) => item.id !== id);
    update(rest);
    setSelectedId(rest[0]?.id);
  };
  const duplicate = (item: OnboardingClass) =>
    classes
      .filter((other) => other.id !== item.id)
      .some(
        (other) =>
          other.name.trim().toLowerCase() === item.name.trim().toLowerCase(),
      );
  return (
    <QuestionStep
      eyebrow={`${eyebrow} · Klassen`}
      title="Das sind eure Klassen"
      lead="Aus der Vorlage vorgeschlagen. Wählt eine Klasse, um Namen und Startgeld zu ändern."
      onSubmit={canContinue ? next : undefined}
      why={{
        label: 'Warum dieser Vorschlag',
        text:
          reasonFor(proposal.reasons, 'classes') ??
          'Ihr habt die Klassen angepasst.',
      }}
    >
      <Stack gap={6}>
        <ul className="nb-onb-chips" aria-label="Klassen">
          {classes.map((item) => (
            <li key={item.id}>
              <Button
                variant="secondary"
                size={48}
                aria-pressed={selected?.id === item.id}
                onClick={() => setSelectedId(item.id)}
              >
                <span>{item.name.trim() || 'Neue Klasse'}</span>
                <span className="nb-onb-chip-fee">
                  {formatEuro(item.feeCents)}
                </span>
              </Button>
            </li>
          ))}
          <li>
            <Button variant="text" size={48} onClick={add}>
              + Klasse
            </Button>
          </li>
        </ul>
        {selected && (
          <Stack gap={4} className="nb-onb-editor">
            <Inline gap={4} className="nb-onb-editor-fields">
              <TextInput
                label="Name der Klasse"
                value={selected.name}
                onChange={(event) =>
                  change(selected.id, { name: event.target.value })
                }
                error={
                  !selected.name.trim()
                    ? 'Bitte einen Namen eingeben.'
                    : duplicate(selected)
                      ? 'Diesen Namen gibt es schon.'
                      : undefined
                }
              />
              <TextInput
                label="Startgeld in Euro"
                type="number"
                inputMode="decimal"
                min={0}
                step={1}
                value={selected.feeCents / 100}
                onChange={(event) =>
                  change(selected.id, {
                    feeCents: Math.max(
                      0,
                      Math.round(Number(event.target.value) * 100) || 0,
                    ),
                  })
                }
              />
            </Inline>
            <div>
              <Button
                variant="text"
                size={40}
                disabled={classes.length < 2}
                onClick={() => remove(selected.id)}
              >
                Klasse entfernen
              </Button>
            </div>
          </Stack>
        )}
      </Stack>
    </QuestionStep>
  );
}
