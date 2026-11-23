import { useRef } from 'react';
import { Icon } from '../icon/Icon.js';
import type { NavGroup } from './AdminNavigation.js';

type NavItem = NavGroup['items'][number];

export function AdminMobileNavigation({
  groups,
  current,
  onNavigate,
  ariaLabel,
  onSearch,
  searchLabel,
}: {
  groups: NavGroup[];
  current: string;
  onNavigate: (id: string) => void;
  ariaLabel: string;
  onSearch?: (() => void) | undefined;
  searchLabel: string;
}) {
  const disclosure = useRef<HTMLDetailsElement>(null);
  const summary = useRef<HTMLElement>(null);
  const items = groups.flatMap((group) => group.items);
  const primary = items.filter((entry) => entry.mobile !== false).slice(0, 4);
  const overflow = items.filter((entry) => !primary.includes(entry));
  const close = () => {
    if (disclosure.current) disclosure.current.open = false;
  };
  const item = (entry: NavItem) => (
    <button
      key={entry.id}
      type="button"
      className={`nb-admin-nav-item${current === entry.id ? ' is-current' : ''}`}
      aria-current={current === entry.id ? 'page' : undefined}
      onClick={() => {
        close();
        onNavigate(entry.id);
      }}
    >
      <Icon name={entry.icon} />
      <span className="nb-admin-nav-label">{entry.label}</span>
    </button>
  );
  return (
    <nav className="nb-admin-mobile-nav" aria-label={ariaLabel}>
      {primary.map(item)}
      <details
        ref={disclosure}
        className="nb-admin-mobile-more"
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            close();
            summary.current?.focus();
          }
        }}
      >
        <summary
          ref={summary}
          className={`nb-admin-nav-item${overflow.some((entry) => entry.id === current) ? ' is-current' : ''}`}
        >
          <Icon name="more" />
          <span>Mehr</span>
        </summary>
        <div className="nb-admin-mobile-more-panel">
          {overflow.map(item)}
          {onSearch && (
            <button
              type="button"
              className="nb-admin-nav-item"
              aria-haspopup="dialog"
              onClick={() => {
                close();
                onSearch();
              }}
            >
              <Icon name="search" />
              <span>{searchLabel}</span>
            </button>
          )}
        </div>
      </details>
    </nav>
  );
}
