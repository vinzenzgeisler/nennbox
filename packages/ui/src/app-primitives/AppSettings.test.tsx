// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AppSettingsLayout,
  AppSettingsNav,
  AppPreviewCard,
} from './AppSettings.js';
import { SegmentedControl } from '../segmented-control/SegmentedControl.js';
import { AppTextInput, AppTextarea } from './AppView.js';

beforeEach(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true));
afterEach(() => vi.unstubAllGlobals());

describe('settings patterns', () => {
  it('names navigation, exposes the active section and selects without navigation', () => {
    const host = document.createElement('div');
    const root = createRoot(host);
    const selected: string[] = [];
    act(() =>
      root.render(
        <AppSettingsLayout
          navigation={
            <AppSettingsNav
              items={[
                { id: 'event', label: 'Veranstaltung' },
                { id: 'terms', label: 'Teilnahmebedingungen' },
              ]}
              activeId="terms"
              onSelect={(id) => selected.push(id)}
            />
          }
          aside={<AppPreviewCard>Vorschau</AppPreviewCard>}
        >
          <p>Formular</p>
        </AppSettingsLayout>,
      ),
    );
    expect(host.querySelector('nav')?.getAttribute('aria-label')).toBe(
      'Abschnittsnavigation',
    );
    expect(host.querySelector('a[aria-current="true"]')?.textContent).toBe(
      'Teilnahmebedingungen',
    );
    act(() => host.querySelector('a')!.click());
    expect(selected).toEqual(['event']);
    expect(host.querySelector('aside')?.getAttribute('aria-label')).toBe(
      'Hilfe und Vorschau',
    );
    act(() => root.unmount());
  });
  it('keeps hints as descriptions instead of changing field names', () => {
    const host = document.createElement('div');
    const root = createRoot(host);
    act(() =>
      root.render(
        <>
          <AppTextInput
            label="Beginn"
            type="date"
            min="2027-01-01"
            hint="Wähle den ersten Tag."
            required
          />
          <AppTextarea label="Anreise" hint="Beschreibe den Weg." />
        </>,
      ),
    );
    for (const field of host.querySelectorAll('input,textarea')) {
      expect(field.getAttribute('aria-label')).toBeTruthy();
      expect(
        host.querySelector(`[id="${field.getAttribute('aria-describedby')}"]`)
          ?.textContent,
      ).toBeTruthy();
    }
    expect(host.querySelector('input')?.min).toBe('2027-01-01');
    expect(host.querySelector('input')?.required).toBe(true);
    act(() => root.unmount());
  });
});

it('preserves native radio selection and disabled states in the opt-in app variant', () => {
  const host = document.createElement('div');
  const root = createRoot(host);
  const changes: string[] = [];
  act(() =>
    root.render(
      <>
        <SegmentedControl
          appearance="app"
          label="Telefon"
          value="optional"
          options={[
            { value: 'optional', label: 'Freiwillig' },
            { value: 'required', label: 'Pflicht' },
          ]}
          onChange={(value) => changes.push(value)}
        />
        <SegmentedControl
          label="Öffentlich"
          value="optional"
          options={[{ value: 'optional', label: 'Freiwillig' }]}
          disabled
          onChange={() => undefined}
        />
      </>,
    ),
  );
  expect(host.querySelector('[role="radiogroup"]')?.className).toBe(
    'nb-app-radio-segmented',
  );
  act(() => host.querySelectorAll('input')[1]!.click());
  expect(changes).toEqual(['required']);
  expect(host.querySelectorAll('input')[2]?.disabled).toBe(true);
  expect(host.querySelectorAll('[role="radiogroup"]')[1]?.className).toBe(
    'nb-segmented',
  );
  act(() => root.unmount());
});
