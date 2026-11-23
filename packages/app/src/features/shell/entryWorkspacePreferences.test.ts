import { expect, it } from 'vitest';
import { parseShellEvents } from './entryWorkspacePreferences.js';

it('keeps usable event rows, defaults optional fields and reads unknown status as draft', () => {
  expect(
    parseShellEvents([
      null,
      'text',
      { id: 'a' },
      { name: 'ohne id' },
      {
        id: 'b',
        name: 'Lauf',
        slug: 'lauf',
        status: 'open',
        registrationClosesAt: '2030-01-01T00:00:00.000Z',
      },
      { id: 'c', name: 'Neu', status: 'unbekannt', registrationClosesAt: 5 },
    ]),
  ).toEqual([
    {
      id: 'b',
      name: 'Lauf',
      slug: 'lauf',
      status: 'open',
      registrationClosesAt: '2030-01-01T00:00:00.000Z',
    },
    {
      id: 'c',
      name: 'Neu',
      slug: '',
      status: 'draft',
      registrationClosesAt: null,
    },
  ]);
});
