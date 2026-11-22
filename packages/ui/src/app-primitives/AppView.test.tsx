// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  AppChoiceGroup,
  AppNotice,
  AppSection,
  AppSelect,
  AppTable,
  AppTextarea,
  AppTextInput,
} from './AppView.js';
import { FormItem } from '../form-section/FormItem.js';
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
