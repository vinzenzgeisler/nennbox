import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { Icon, type IconName } from './Icon.js';
it('keeps decorative icons hidden and labels meaningful icons', () => {
  expect(renderToStaticMarkup(<Icon name="list" />)).toContain(
    'aria-hidden="true"',
  );
  expect(renderToStaticMarkup(<Icon name="list" label="Liste" />)).toContain(
    'aria-label="Liste"',
  );
});

it.each<IconName>([
  'person',
  'amount',
  'note',
  'link',
  'warning',
  'payment',
  'tag',
  'trash',
])('renders %s on the shared icon grid with a single stroked path', (name) => {
  const markup = renderToStaticMarkup(<Icon name={name} />);
  expect(markup).toContain('viewBox="0 0 24 24"');
  expect(markup).toContain('stroke-width="1.5"');
  expect(markup).toContain('fill="none"');
  expect(markup.match(/<path /g)).toHaveLength(1);
  expect(markup).toContain('aria-hidden="true"');
});
