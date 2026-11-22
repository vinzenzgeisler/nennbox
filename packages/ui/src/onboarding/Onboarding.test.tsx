// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChoiceCard, ChoiceGroup } from './ChoiceCard.js';
import { EmergingList } from './EmergingList.js';
import { NumberStepper } from './NumberStepper.js';
import { OnboardingField, OnboardingSwitch } from './OnboardingFields.js';
import { OnboardingSections } from './OnboardingSections.js';
import { OnboardingShell } from './OnboardingShell.js';
import { QuestionStep } from './QuestionStep.js';
import { StepActions } from './StepActions.js';

vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);

let root: ReturnType<typeof createRoot> | undefined;
let container: HTMLDivElement | undefined;
afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
});
const mount = (node: React.ReactNode) => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => root!.render(node));
  return container;
};

function Question({ onSubmit }: { onSubmit?: () => void }) {
  const [value, setValue] = useState('');
  return (
    <QuestionStep
      eyebrow="Abschnitt 3 · Veranstaltung"
      title="Was veranstaltet ihr?"
      onSubmit={onSubmit}
      example={
        value ? { label: 'Beispiel', text: `Beispiel ${value}` } : undefined
      }
    >
      <ChoiceGroup>
        {['a', 'b', 'c'].map((id) => (
          <ChoiceCard
            key={id}
            value={id}
            checked={value === id}
            onChange={() => setValue(id)}
            title={`Titel ${id}`}
            description="Erklärung"
            consequence={`Folge ${id}`}
            badge={id === 'a' ? 'Empfohlen' : undefined}
          />
        ))}
      </ChoiceGroup>
    </QuestionStep>
  );
}

describe('ChoiceCard', () => {
  it('renders single choice as a radio group named after the question', () => {
    const html = renderToStaticMarkup(<Question />);
    expect(html).toContain('role="radiogroup"');
    expect(html).toMatch(/aria-labelledby="[^"]+"/);
    expect(html.match(/type="radio"/g)).toHaveLength(3);
  });
  it('always shows the consequence line on the card', () => {
    const html = renderToStaticMarkup(<Question />);
    expect(html.match(/nb-choice-card-consequence/g)).toHaveLength(3);
    expect(html).toContain('Folge b');
  });
  it('shows the recommended badge until the card is chosen and then only the tick, never both', () => {
    const view = mount(<Question />);
    const first = view.querySelector('.nb-choice-card')!;
    expect(first.querySelector('.nb-choice-card-badge')?.textContent).toBe(
      'Empfohlen',
    );
    expect(first.querySelector('.nb-choice-card-tick')).toBeNull();
    act(() => first.querySelector<HTMLInputElement>('input')!.click());
    expect(first.classList.contains('is-selected')).toBe(true);
    expect(first.querySelector('.nb-choice-card-badge')).toBeNull();
    expect(first.querySelector('.nb-choice-card-tick')).not.toBeNull();
    expect(view.querySelector('.nb-question-example')?.textContent).toContain(
      'Beispiel a',
    );
  });
  it('replaces the consequence with the reason when a card is not possible', () => {
    const view = mount(
      <ChoiceGroup aria-label="Art">
        <ChoiceCard
          value="kart"
          checked={false}
          onChange={() => undefined}
          title="Kart"
          description="x"
          consequence="Folge"
          badge="Empfohlen"
          unavailableReason="Passt nicht zu Fahrzeugpass und Baujahr"
        />
      </ChoiceGroup>,
    );
    const card = view.querySelector('.nb-choice-card')!;
    expect(card.classList.contains('is-unavailable')).toBe(true);
    expect(card.textContent).toContain('Passt nicht zu Fahrzeugpass');
    expect(card.textContent).not.toContain('Folge');
    expect(card.querySelector('.nb-choice-card-badge')).toBeNull();
    expect(card.querySelector<HTMLInputElement>('input')!.disabled).toBe(true);
  });
  it('renders multiple choice as a checkbox group', () => {
    const html = renderToStaticMarkup(
      <ChoiceGroup mode="multiple" aria-label="Ausstattung">
        <ChoiceCard
          value="a"
          checked
          onChange={() => undefined}
          title="A"
          description="x"
        />
      </ChoiceGroup>,
    );
    expect(html).toContain('role="group"');
    expect(html).toContain('aria-label="Ausstattung"');
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('is-selected');
  });
});

describe('QuestionStep keyboard', () => {
  it('selects the nth card with number keys and continues with Enter', () => {
    const onSubmit = vi.fn();
    const view = mount(<Question onSubmit={onSubmit} />);
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: '2', bubbles: true }),
      );
    });
    const radios = view.querySelectorAll<HTMLInputElement>('input[type=radio]');
    expect(radios[1]!.checked).toBe(true);
    expect(radios[0]!.checked).toBe(false);
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
      );
    });
    expect(onSubmit).toHaveBeenCalledOnce();
  });
  it('leaves digits and Enter to text fields and buttons', () => {
    const onSubmit = vi.fn();
    const view = mount(
      <>
        <Question onSubmit={onSubmit} />
        <input aria-label="Name" />
        <button type="button">Aktion</button>
      </>,
    );
    const input = view.querySelector('input[aria-label=Name]')!;
    act(() => {
      input.dispatchEvent(
        new KeyboardEvent('keydown', { key: '1', bubbles: true }),
      );
    });
    expect(
      view.querySelectorAll<HTMLInputElement>('input[type=radio]:checked'),
    ).toHaveLength(0);
    act(() => {
      view
        .querySelector('button')!
        .dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
        );
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });
  it('moves focus to the new question heading', () => {
    const view = mount(<Question />);
    expect(document.activeElement).toBe(view.querySelector('h1'));
  });
});

describe('actions, sections, emerging list, fields and shell', () => {
  it('explains a disabled continue button to assistive technology', () => {
    const html = renderToStaticMarkup(
      <StepActions
        backLabel="Zurück"
        onBack={() => undefined}
        continueLabel="Weiter"
        onContinue={() => undefined}
        continueDisabled
        disabledReason="Bitte wählen"
      />,
    );
    expect(html).toMatch(/aria-describedby="nb-step-disabled-reason"/);
    expect(html).toContain('Bitte wählen');
  });
  it('offers "Überspringen" with its hint only where a skip is given', () => {
    const withSkip = renderToStaticMarkup(
      <StepActions
        backLabel="Zurück"
        skipLabel="Überspringen"
        skipHint="Wir nehmen den Vorschlag"
        onSkip={() => undefined}
        continueLabel="Weiter"
        onContinue={() => undefined}
        hints={['↵ weiter', '1–9 wählen']}
      />,
    );
    expect(withSkip).toContain('Wir nehmen den Vorschlag');
    expect(withSkip).toContain('↵ weiter · 1–9 wählen');
    const without = renderToStaticMarkup(
      <StepActions
        backLabel="Zurück"
        continueLabel="Weiter"
        onContinue={() => undefined}
      />,
    );
    expect(without).not.toContain('Überspringen');
  });
  it('lists sections with ticks, only the active one with its screens, and jumps back', () => {
    const onSelect = vi.fn();
    const view = mount(
      <OnboardingSections
        label="Abschnitte"
        doneLabel="erledigt"
        onSelect={onSelect}
        note={{
          title: 'Noch etwa acht Minuten',
          text: 'Du kannst jederzeit aufhören.',
        }}
        sections={[
          { id: 'account', label: 'Konto', state: 'done' },
          {
            id: 'event',
            label: 'Veranstaltung',
            state: 'active',
            screens: [{ label: 'Was veranstaltet ihr', state: 'active' }],
          },
          {
            id: 'participants',
            label: 'Teilnehmer',
            state: 'todo',
            screens: [{ label: 'Wer startet', state: 'todo' }],
          },
        ]}
      />,
    );
    expect(view.querySelectorAll('button.nb-onb-section')).toHaveLength(1);
    expect(view.textContent).toContain('(erledigt)');
    expect(view.querySelector('[aria-current=step]')?.textContent).toContain(
      'Veranstaltung',
    );
    expect(view.textContent).toContain('Was veranstaltet ihr');
    expect(view.textContent).not.toContain('Wer startet');
    expect(view.textContent).toContain('Noch etwa acht Minuten');
    act(() =>
      view.querySelector<HTMLButtonElement>('button.nb-onb-section')!.click(),
    );
    expect(onSelect).toHaveBeenCalledWith('account');
  });
  const groups = (value: string | null) => [
    {
      id: 'event',
      title: 'Eure Veranstaltung',
      rows: [
        {
          kind: 'fact' as const,
          id: 'kind',
          label: 'Art',
          value,
          signature: value ?? '',
        },
        {
          kind: 'field' as const,
          id: 'license',
          name: 'Lizenznummer',
          tag: 'Pflicht',
          tone: 'required' as const,
          reason: 'Weil nur Lizenzfahrer starten',
          signature: 'x',
        },
      ],
    },
  ];
  it('shows "noch offen" for missing values and the reason for form fields', () => {
    const view = mount(
      <OnboardingShell
        brand="NENNBOX"
        title="Einrichten"
        progress={0.3}
        progressLabel="Fortschritt"
        emerging={
          <EmergingList
            title="Das entsteht"
            openLabel="noch offen"
            closeLabel="Schließen"
            groups={groups(null)}
          />
        }
        emergingBar={{
          title: 'Das entsteht',
          summary: '0 von 1 Angaben',
          open: 'Anzeigen',
          close: 'Schließen',
        }}
      >
        <p>Frage</p>
      </OnboardingShell>,
    );
    expect(
      view.querySelector('.nb-emerging-fact.is-open')?.textContent,
    ).toContain('noch offen');
    expect(view.querySelector('.nb-emerging-reason')?.textContent).toBe(
      'Weil nur Lizenzfahrer starten',
    );
    expect(
      view.querySelector('.nb-emerging')?.classList.contains('is-armed'),
    ).toBe(true);
  });
  it('re-keys a row when its value changes so the highlight plays again', () => {
    function Host() {
      const [value, setValue] = useState<string | null>(null);
      return (
        <>
          <button type="button" onClick={() => setValue('Bergrennen')}>
            wählen
          </button>
          <EmergingList
            title="Das entsteht"
            openLabel="noch offen"
            closeLabel="Schließen"
            groups={groups(value)}
          />
        </>
      );
    }
    const view = mount(<Host />);
    const before = view.querySelector('.nb-emerging-fact');
    act(() => view.querySelector('button')!.click());
    const after = view.querySelector('.nb-emerging-fact');
    expect(after).not.toBe(before);
    expect(after?.textContent).toContain('Bergrennen');
  });
  it('collapses "Das entsteht" behind a labelled bar on narrow screens and closes with Escape', () => {
    const view = mount(
      <OnboardingShell
        brand="NENNBOX"
        title="Einrichten"
        position="Schirm 4 von 13"
        progress={0.3}
        progressLabel="Fortschritt"
        emerging={
          <EmergingList
            title="Das entsteht"
            openLabel="noch offen"
            closeLabel="Schließen"
            groups={groups('Bergrennen')}
          />
        }
        emergingBar={{
          title: 'Das entsteht',
          summary: '1 von 1 Angaben',
          open: 'Anzeigen',
          close: 'Schließen',
        }}
      >
        <p>Frage</p>
      </OnboardingShell>,
    );
    const toggle = view.querySelector<HTMLButtonElement>(
      '.nb-onb-emerging-bar',
    )!;
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.textContent).toContain('1 von 1 Angaben');
    expect(
      view.querySelector('.nb-emerging')?.classList.contains('is-open'),
    ).toBe(false);
    act(() => toggle.click());
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(
      view.querySelector('.nb-emerging')?.classList.contains('is-open'),
    ).toBe(true);
    act(() =>
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })),
    );
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });
  it('reports progress to assistive technology', () => {
    const view = mount(
      <OnboardingShell
        brand="NENNBOX"
        title="Einrichten"
        progress={0.42}
        progressLabel="Fortschritt"
      >
        <p>Frage</p>
      </OnboardingShell>,
    );
    expect(
      view.querySelector('[role=progressbar]')?.getAttribute('aria-valuenow'),
    ).toBe('42');
  });
  it('steps a number within its bounds and never leaves the field empty', () => {
    const onChange = vi.fn();
    const view = mount(
      <NumberStepper
        label="Baujahr"
        value={1990}
        min={1985}
        max={1995}
        step={5}
        lessLabel="Früher"
        moreLabel="Später"
        onChange={onChange}
      />,
    );
    const [less, more] = view.querySelectorAll<HTMLButtonElement>('button');
    act(() => less!.click());
    expect(onChange).toHaveBeenLastCalledWith(1985);
    act(() => more!.click());
    expect(onChange).toHaveBeenLastCalledWith(1995);
    expect(view.querySelector('output')?.textContent).toBe('1990');
  });
  it('connects field errors and the fixed address suffix to the input', () => {
    const html = renderToStaticMarkup(
      <OnboardingField
        label="Adresse"
        suffix=".nennbox.com"
        error="Schon vergeben"
        defaultValue="msc"
      />,
    );
    expect(html).toContain('aria-invalid="true"');
    expect(html).toMatch(/aria-describedby="[^"]+-error"/);
    expect(html).toContain('.nennbox.com');
  });
  it('exposes the switch with its role and reports changes', () => {
    const onChange = vi.fn();
    const view = mount(
      <OnboardingSwitch
        label="Warteliste"
        checked={false}
        onChange={onChange}
      />,
    );
    const input = view.querySelector<HTMLInputElement>('input[role=switch]')!;
    act(() => input.click());
    expect(onChange).toHaveBeenCalledOnce();
  });
});
