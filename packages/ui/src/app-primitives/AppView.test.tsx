// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  AppChoiceGroup,
  AppView,
  AppNotice,
  AppSection,
  AppSelect,
  AppTable,
  AppTextarea,
  AppTextInput,
} from './AppView.js';
import { FormItem } from '../form-section/FormItem.js';
import { AppCheckbox } from './AppPrimitives.js';
import { Metric, MetricGrid } from '../metric/Metric.js';

describe('app view patterns', () => {
  it('names sections and retains native labeled, disabled and required controls', () => {
    const host = document.createElement('div');
    const root = createRoot(host);
    act(() =>
      root.render(
        <AppSection title="Unterlagentypen">
          <FormItem label="Unterlage 1">
            <AppTextInput
              label="Name"
              defaultValue="Lizenz"
              required
              disabled
            />
            <AppSelect label="Klasse" defaultValue="a">
              <option value="a">A</option>
            </AppSelect>
            <AppTextarea label="Hinweis" maxLength={500} />
            <AppChoiceGroup label="Spalten">Fahrer</AppChoiceGroup>
          </FormItem>
        </AppSection>,
      ),
    );
    const section = host.querySelector('section')!;
    expect(
      host.querySelector(`[id="${section.getAttribute('aria-labelledby')}"]`)
        ?.textContent,
    ).toBe('Unterlagentypen');
    expect(
      host.querySelector('[role="group"]')?.getAttribute('aria-label'),
    ).toBe('Unterlage 1');
    const input = host.querySelector('input')!;
    expect(input.closest('label')?.textContent).toBe('Name');
    expect(input.disabled).toBe(true);
    expect(input.required).toBe(true);
    expect(input.value).toBe('Lizenz');
    expect(host.querySelector('select')?.value).toBe('a');
    expect(host.querySelector('textarea')?.maxLength).toBe(500);
    act(() => root.unmount());
  });
  it('retains native select and checkbox behavior inside a padded view', () => {
    const host = document.createElement('div');
    const root = createRoot(host);
    const changes: string[] = [];
    act(() =>
      root.render(
        <AppView>
          <AppSelect
            label="Trennzeichen"
            defaultValue=";"
            onChange={(event) => changes.push(event.target.value)}
          >
            <option value=";">Semikolon</option>
            <option value=",">Komma</option>
          </AppSelect>
          <AppCheckbox
            label="Fahrer"
            defaultChecked
            onChange={(event) => changes.push(String(event.target.checked))}
          />
          <AppCheckbox label="Fahrzeug" disabled />
        </AppView>,
      ),
    );
    const select = host.querySelector('select')!;
    expect(select.closest('label')?.textContent).toContain('Trennzeichen');
    expect(select.closest('.nb-app-select-control')).not.toBeNull();
    act(() => {
      select.value = ',';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      host.querySelector('input')!.click();
      host.querySelectorAll('input')[1]!.click();
    });
    expect(changes).toEqual([',', 'false']);
    expect(host.querySelectorAll('input')[1]?.disabled).toBe(true);
    act(() => root.unmount());
  });
  it('exposes feedback urgency and tabular column headers', () => {
    const html = renderToStaticMarkup(
      <>
        <AppNotice tone="error">Wiederhole den Export.</AppNotice>
        <AppNotice tone="success">Gespeichert.</AppNotice>
        <AppTable headers={['Status']}>
          <tr>
            <td>Fertig</td>
          </tr>
        </AppTable>
        <MetricGrid label="Kennzahlen">
          <Metric label="Nennungen" value={42} />
        </MetricGrid>
      </>,
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain('role="status"');
    expect(html).toContain('<th scope="col">Status</th>');
    expect(html).toContain('<dt>Nennungen</dt><dd><strong>42</strong>');
  });
});
