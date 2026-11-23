import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { EntryListRow } from './EntryListRow.js';

it('reserves a checkbox cell before the vehicle and keeps it outside the person cell', () => {
  const html = renderToStaticMarkup(
    <table>
      <tbody>
        <EntryListRow
          name="Alex"
          vehicle="BMW"
          className="Classic"
          selectLabel="Alex auswählen"
          status="Offen"
          imageUrl="/vehicle.jpg"
        />
      </tbody>
    </table>,
  );
  const selection = html.indexOf('data-column="selection"');
  const person = html.indexOf('data-column="person"');
  expect(selection).toBeLessThan(person);
  expect(html.slice(selection, person)).toContain('type="checkbox"');
  expect(html.slice(person)).not.toContain('type="checkbox"');
  expect(html.match(/<td/g)).toHaveLength(6);
});
