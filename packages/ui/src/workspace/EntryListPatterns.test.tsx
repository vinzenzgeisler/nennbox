import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { CompletionDots } from './CompletionDots.js';
import { EntryStatusMenu } from './EntryStatusMenu.js';

it('announces completed admission dimensions in the prescribed order', () => {
  const html = renderToStaticMarkup(
    <CompletionDots states={['done', 'missing', 'wait', 'not_relevant']} />,
  );
  expect(html).toContain('2 von 4 erledigt');
  expect(
    [...html.matchAll(/nb-app-dot-(ok|missing|waiting|na)/g)].map(
      (match) => match[1],
    ),
  ).toEqual(['ok', 'missing', 'waiting', 'na']);
});

it('renders a row-local status menu with only supplied transitions', () => {
  const html = renderToStaticMarkup(
    <EntryStatusMenu
      label="Offen"
      tone="offen"
      options={[{ key: 'accepted', label: 'Zugelassen', tone: 'zu' }]}
      onChange={vi.fn()}
    />,
  );
  expect(html).toContain('Status: Offen');
  expect(html).toContain('Status ändern');
  expect(html).toContain('Zugelassen');
  expect(html).not.toContain('Abgelehnt');
});
