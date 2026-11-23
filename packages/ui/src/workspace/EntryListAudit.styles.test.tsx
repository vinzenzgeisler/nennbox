// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
import { EntryStatusMenu } from './EntryStatusMenu.js';
import { Menu, MenuItem } from '../menu/Menu.js';
import { readFileSync } from 'node:fs';
const menuCss = readFileSync('packages/ui/src/menu/menu.css', 'utf8');
const statusCss = readFileSync(
  'packages/ui/src/workspace/entry-status-menu.css',
  'utf8',
);
afterEach(() => document.body.replaceChildren());

it('removes closed row and status popovers from layout and restores them on open', () => {
  const style = document.createElement('style');
  style.textContent = menuCss + statusCss;
  document.body.append(style);
  const host = document.createElement('div');
  host.innerHTML = renderToStaticMarkup(
    <>
      <Menu label="Aktionen">
        <MenuItem>Öffnen</MenuItem>
      </Menu>
      <EntryStatusMenu
        label="Offen"
        tone="offen"
        options={[{ key: 'accepted', label: 'Zugelassen', tone: 'zu' }]}
        onChange={vi.fn()}
      />
    </>,
  );
  document.body.append(host);
  for (const details of host.querySelectorAll('details')) {
    const popover = details.querySelector('[role="menu"]')!;
    expect(getComputedStyle(popover).display).toBe('none');
    details.open = true;
    expect(getComputedStyle(popover).display).not.toBe('none');
    details.open = false;
    expect(getComputedStyle(popover).display).toBe('none');
  }
});

it('keeps IBM Plex out of the entries views by remapping shared font tokens', () => {
  const tokens = readFileSync('packages/ui/src/app-tokens.css', 'utf8');
  const block = tokens.match(
    /\.admin-entries,\s*\.admin-detail-view,\s*\.nb-preview-panel\s*\{([^}]*)\}/,
  )?.[1];
  expect(block).toContain('--font-plex: var(--nb-font);');
  expect(block).toContain('--font-mono: var(--nb-font-mono);');
});
