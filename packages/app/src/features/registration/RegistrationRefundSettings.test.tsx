// @vitest-environment jsdom
import { act, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  RegistrationFormConfigSchema,
  defaultRegistrationFormConfig,
  type RegistrationFormConfig,
} from '@nennbox/contracts';
import { RegistrationRefundSettings } from './RegistrationRefundSettings.js';

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let latest: RegistrationFormConfig;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

function Harness({
  initial,
  onProblem,
  showProblems,
}: {
  initial: RegistrationFormConfig;
  onProblem?: (problem: string | null) => void;
  showProblems?: boolean;
}) {
  const [config, setConfig] = useState(initial);
  useEffect(() => {
    latest = config;
  }, [config]);
  return (
    <RegistrationRefundSettings
      config={config}
      updateConfig={(updater) => setConfig(updater)}
      {...(onProblem ? { onProblem } : {})}
      {...(showProblems ? { showProblems } : {})}
    />
  );
}
const mount = (initial = defaultRegistrationFormConfig) =>
  act(async () => root.render(<Harness initial={initial} />));
const button = (label: string) =>
  [...container.querySelectorAll('button')].find(
    (node) => node.textContent === label,
  )!;
async function typeInto(input: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('refund rule settings', () => {
  const inputs = () => [
    ...container.querySelectorAll<HTMLInputElement>(
      'input:not([type="checkbox"])',
    ),
  ];
  const enable = () =>
    act(async () =>
      container
        .querySelector<HTMLInputElement>('input[type="checkbox"]')!
        .click(),
    );
  const blur = (input: HTMLInputElement) =>
    act(async () => {
      input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    });

  it('is off by default and hides the tiers until switched on', async () => {
    await mount();
    expect(container.querySelector('input[type="checkbox"]')).not.toBeNull();
    expect(container.textContent).not.toContain('Stufe hinzufügen');
  });

  it('builds a rule with tiers that the shared contract accepts', async () => {
    await mount();
    await enable();
    await act(async () => button('Stufe hinzufügen').click());
    await typeInto(inputs()[0]!, '28');
    await typeInto(inputs()[1]!, '100');
    expect(latest.payments.refundPolicy).toEqual({
      enabled: true,
      tiers: [{ daysBefore: 28, percent: 100 }],
      rejectedPercent: 100,
    });
    expect(RegistrationFormConfigSchema.safeParse(latest).success).toBe(true);
  });

  it('keeps an emptied field empty instead of turning it into 0, and reports the problem only after a save attempt', async () => {
    const problems: Array<string | null> = [];
    await act(async () =>
      root.render(
        <Harness
          initial={defaultRegistrationFormConfig}
          onProblem={(problem) => problems.push(problem)}
        />,
      ),
    );
    await enable();
    await act(async () => button('Stufe hinzufügen').click());
    await typeInto(inputs()[1]!, '');
    expect(inputs()[1]!.value).toBe('');
    // The stored rule keeps the last complete value; the save is blocked instead.
    expect(latest.payments.refundPolicy!.tiers[0]!.percent).toBe(50);
    expect(problems.at(-1)).toContain('Prozentsatz');
    expect(container.textContent).not.toContain('Bitte eine ganze Zahl');
    await act(async () =>
      root.render(
        <Harness
          initial={latest}
          showProblems
          onProblem={(problem) => problems.push(problem)}
        />,
      ),
    );
    expect(container.textContent).toContain('Bitte eine ganze Zahl');
    await typeInto(inputs()[1]!, '30');
    expect(problems.at(-1)).toBeNull();
  });

  it('rejects text, decimals and out-of-range numbers instead of coercing them', async () => {
    const problems: Array<string | null> = [];
    await act(async () =>
      root.render(
        <Harness
          initial={defaultRegistrationFormConfig}
          onProblem={(problem) => problems.push(problem)}
        />,
      ),
    );
    await enable();
    await act(async () => button('Stufe hinzufügen').click());
    for (const bad of ['abc', '12,5', '250', '-3']) {
      await typeInto(inputs()[1]!, bad);
      expect(problems.at(-1), bad).not.toBeNull();
      expect(latest.payments.refundPolicy!.tiers[0]!.percent).toBe(50);
    }
  });

  it('sorts the tiers by days, most days first, when a day field is left', async () => {
    await mount();
    await enable();
    await act(async () => button('Stufe hinzufügen').click());
    await act(async () => button('Stufe hinzufügen').click());
    await typeInto(inputs()[0]!, '7');
    await typeInto(inputs()[2]!, '28');
    await blur(inputs()[0]!);
    expect(inputs().map((input) => input.value)).toEqual([
      '28',
      '50',
      '7',
      '50',
      '100',
    ]);
    expect(
      latest.payments.refundPolicy!.tiers.map((t) => t.daysBefore),
    ).toEqual([28, 7]);
  });

  it('warns in German when a later tier refunds more than an earlier one, without blocking', async () => {
    const problems: Array<string | null> = [];
    await act(async () =>
      root.render(
        <Harness
          initial={defaultRegistrationFormConfig}
          onProblem={(problem) => problems.push(problem)}
        />,
      ),
    );
    await enable();
    await act(async () => button('Stufe hinzufügen').click());
    await act(async () => button('Stufe hinzufügen').click());
    await typeInto(inputs()[0]!, '28');
    await typeInto(inputs()[1]!, '30');
    await typeInto(inputs()[2]!, '14');
    await typeInto(inputs()[3]!, '80');
    const warning = container.querySelector('[role="status"]')?.textContent;
    expect(warning).toContain('„bis 14 Tage“ erstattet mit 80 %');
    expect(warning).toContain('mehr als die frühere Stufe „bis 28 Tage“');
    expect(problems.at(-1)).toBeNull();
    await typeInto(inputs()[3]!, '20');
    expect(container.querySelector('[role="status"]')).toBeNull();
  });

  it('flags two tiers with the same day count and lets one be removed', async () => {
    await mount();
    await enable();
    await act(async () => button('Stufe hinzufügen').click());
    await act(async () => button('Stufe hinzufügen').click());
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      'andere Anzahl Tage',
    );
    await act(async () => button('Stufe entfernen').click());
    expect(latest.payments.refundPolicy!.tiers).toHaveLength(1);
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it('rejects a duplicated tier in the contract so it cannot be saved', () => {
    const result = RegistrationFormConfigSchema.safeParse({
      ...defaultRegistrationFormConfig,
      payments: {
        onlineMethods: [],
        bankTransfer: true,
        refundPolicy: {
          enabled: true,
          tiers: [
            { daysBefore: 14, percent: 50 },
            { daysBefore: 14, percent: 100 },
          ],
          rejectedPercent: 100,
        },
      },
    });
    expect(result.success).toBe(false);
  });
});
