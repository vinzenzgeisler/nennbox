import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { SegmentedControl } from './SegmentedControl.js';

const options = [
  { value: 'hidden', label: 'Aus' },
  { value: 'optional', label: 'Freiwillig' },
  { value: 'required', label: 'Pflicht' },
] as const;

it('renders one named radio group with the current option checked', () => {
  const html = renderToStaticMarkup(
    <SegmentedControl
      label="Telefon"
      value="optional"
      options={[...options]}
      onChange={() => undefined}
    />,
  );
  expect(html).toContain('role="radiogroup"');
  expect(html).toContain('aria-label="Telefon"');
  expect(html.match(/type="radio"/g)).toHaveLength(3);
  expect(html.match(/checked=""/g)).toHaveLength(1);
  expect(html).toMatch(/checked=""[^>]*value="optional"/);
});
