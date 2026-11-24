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

function Harness({ initial }: { initial: RegistrationFormConfig }) {
  const [config, setConfig] = useState(initial);
  useEffect(() => {
    latest = config;
  }, [config]);
  return (
    <RegistrationRefundSettings
      config={config}
      updateConfig={(updater) => setConfig(updater)}
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
  it('is off by default and hides the tiers until switched on', async () => {
    await mount();
    expect(container.querySelector('input[type="checkbox"]')).not.toBeNull();
    expect(container.textContent).not.toContain('Stufe hinzufügen');
  });

  it('builds a rule with tiers that the shared contract accepts', async () => {
    await mount();
    await act(async () =>
      container
        .querySelector<HTMLInputElement>('input[type="checkbox"]')!
        .click(),
    );
    await act(async () => button('Stufe hinzufügen').click());
    const inputs = container.querySelectorAll<HTMLInputElement>(
      'input:not([type="checkbox"])',
    );
    await typeInto(inputs[0]!, '28');
    await typeInto(
      container.querySelectorAll<HTMLInputElement>(
        'input:not([type="checkbox"])',
      )[1]!,
      '100',
    );
    expect(latest.payments.refundPolicy).toEqual({
      enabled: true,
      tiers: [{ daysBefore: 28, percent: 100 }],
      rejectedPercent: 100,
    });
    expect(RegistrationFormConfigSchema.safeParse(latest).success).toBe(true);
  });

  it('keeps percentages within 0 to 100 and warns about two tiers with the same day count', async () => {
    await mount();
    await act(async () =>
      container
        .querySelector<HTMLInputElement>('input[type="checkbox"]')!
        .click(),
    );
    await act(async () => button('Stufe hinzufügen').click());
    await act(async () => button('Stufe hinzufügen').click());
    const percent = container.querySelectorAll<HTMLInputElement>(
      'input:not([type="checkbox"])',
    )[1]!;
    await typeInto(percent, '250');
    expect(latest.payments.refundPolicy!.tiers[0]!.percent).toBe(100);
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
