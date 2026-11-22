// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChoiceCard, ChoiceGroup } from './ChoiceCard.js';
import { LivePreview } from './LivePreview.js';
import { OnboardingProgress } from './OnboardingProgress.js';
import { OnboardingShell } from './OnboardingShell.js';
import { QuestionStep } from './QuestionStep.js';
import { Slider } from './Slider.js';
import { StepActions } from './StepActions.js';
import { OnboardingSketch, sketchNames } from './sketches/index.js';

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
      eyebrow="Schritt 1"
      title="Was veranstaltet ihr?"
      onSubmit={onSubmit}
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
            exampleLabel="Beispiel"
            example="Ein Beispiel"
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
    expect(html).toContain('<summary>Beispiel</summary>');
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
  it('keeps the example disclosure outside the label so opening it does not select the card', () => {
    const view = mount(<Question />);
    const card = view.querySelector('.nb-choice-card')!;
    expect(card.querySelector('label details')).toBeNull();
    expect(card.querySelector('details')).not.toBeNull();
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

describe('progress, actions, slider, preview and shell', () => {
  it('marks the current phase and announces finished ones', () => {
    const html = renderToStaticMarkup(
      <OnboardingProgress
        label="Fortschritt"
        position="Schritt 2 von 5"
        completedLabel="erledigt"
        current={1}
        segments={[
          { label: 'Konto', fill: 1 },
          { label: 'Verein', fill: 0.5 },
        ]}
      />,
    );
    expect(html).toContain('aria-current="step"');
    expect(html).toContain('(erledigt)');
    expect(html).toContain('width:50%');
  });
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
  it('reports slider changes with the spoken value', () => {
    const onChange = vi.fn();
    const view = mount(
      <Slider
        label="Starter"
        value={50}
        min={10}
        max={100}
        onChange={onChange}
        valueText="50 Starter"
      />,
    );
    const input = view.querySelector('input')!;
    expect(input.getAttribute('aria-valuetext')).toBe('50 Starter');
    expect(view.querySelector('label')?.getAttribute('for')).toBe(input.id);
  });
  it('switches the preview view', () => {
    const onViewChange = vi.fn();
    const view = mount(
      <LivePreview
        label="Vorschau"
        title="Vorschau"
        statusLabel="Live"
        viewsLabel="Ansicht"
        views={[
          { value: 'a', label: 'A' },
          { value: 'b', label: 'B' },
        ]}
        view="a"
        onViewChange={onViewChange}
        address="x.nennbox.com"
      >
        <p>Seite</p>
      </LivePreview>,
    );
    act(() =>
      view.querySelectorAll<HTMLInputElement>('input[type=radio]')[1]!.click(),
    );
    expect(onViewChange).toHaveBeenCalledWith('b');
  });
  it('collapses the preview behind a labelled toggle', () => {
    const view = mount(
      <OnboardingShell
        brand="NENNBOX"
        preview={<p>Vorschau</p>}
        previewToggleLabel="Vorschau anzeigen"
        previewCloseLabel="Vorschau schließen"
      >
        <p>Frage</p>
      </OnboardingShell>,
    );
    const toggle = view.querySelector<HTMLButtonElement>(
      '.nb-onb-preview-toggle',
    )!;
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(
      view.querySelector('.nb-onb-preview')?.classList.contains('is-open'),
    ).toBe(false);
    act(() => toggle.click());
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(toggle.textContent).toContain('Vorschau schließen');
    expect(
      view.querySelector('.nb-onb-preview')?.classList.contains('is-open'),
    ).toBe(true);
    act(() =>
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })),
    );
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });
});

describe('sketches', () => {
  it('renders every sketch as decorative SVG without text alternatives', () => {
    for (const name of sketchNames) {
      const html = renderToStaticMarkup(<OnboardingSketch name={name} />);
      expect(html, name).toContain('aria-hidden="true"');
      expect(html, name).toContain('viewBox="0 0 160 100"');
    }
    expect(sketchNames.length).toBeGreaterThanOrEqual(30);
  });
});
