// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AppOptionCard, AppOptionCards } from './AppOptionCard.js';

beforeEach(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true));
afterEach(() => vi.unstubAllGlobals());

it('is a named radio group whose cards select on click', () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const picked: string[] = [];
  act(() =>
    root.render(
      <AppOptionCards label="Rolle">
        {['a', 'b'].map((value) => (
          <AppOptionCard
            key={value}
            name="role"
            value={value}
            checked={value === 'a'}
            onChange={() => picked.push(value)}
            label={`Rolle ${value}`}
            description="Ein Satz."
          />
        ))}
      </AppOptionCards>,
    ),
  );
  expect(host.querySelector('fieldset legend')?.textContent).toBe('Rolle');
  const cards = [...host.querySelectorAll('label')];
  expect(cards).toHaveLength(2);
  expect(cards[1]!.querySelector('input')!.type).toBe('radio');
  expect(cards[1]!.textContent).toBe('Rolle bEin Satz.');
  act(() => cards[1]!.click());
  expect(picked).toEqual(['b']);
  act(() => root.unmount());
  host.remove();
});
