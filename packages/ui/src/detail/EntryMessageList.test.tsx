import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { EntryMessageList } from './EntryMessageList.js';
it('shows actual outbox metadata without fabricating delivery receipts or message bodies', () => {
  const html = renderToStaticMarkup(
    <EntryMessageList
      items={[
        {
          id: 'one',
          subject: 'Unterlagen <bitte>',
          recipient: 'driver@example.test',
          status: 'Gesendet',
          template: 'reminder',
          time: 'vor 2 Std.',
          dateTime: '2026-04-12T07:12:00Z',
        },
      ]}
      empty={<p>Leer</p>}
    />,
  );
  expect(html).toContain('Unterlagen &lt;bitte&gt;');
  expect(html).toContain('driver@example.test');
  expect(html).toContain('Gesendet');
  expect(html).toContain('vor 2 Std.');
  expect(html).toContain('dateTime="2026-04-12T07:12:00Z"');
  expect(html).not.toContain('Zugestellt');
  expect(html).not.toContain('geöffnet');
});
it('renders the supplied empty state', () => {
  expect(
    renderToStaticMarkup(
      <EntryMessageList items={[]} empty={<p>Keine Nachrichten</p>} />,
    ),
  ).toBe('<p>Keine Nachrichten</p>');
});
