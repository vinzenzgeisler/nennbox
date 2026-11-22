import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Icon } from '../icon/Icon.js';
import {
  filterCommands,
  groupCommands,
  highlightParts,
  moveActive,
  orderedCommands,
  type CommandItem,
} from './commandPaletteModel.js';

export type { CommandItem } from './commandPaletteModel.js';

type CommandPaletteProps = {
  items: CommandItem[];
  open: boolean;
  onClose: () => void;
  /** Items that depend on the typed text, e.g. a search in the entries. */
  queryItems?: (query: string) => CommandItem[];
  title?: string;
  placeholder?: string;
  /** Short hint on the right of the footer. */
  scopeHint?: string;
};

/** „Suchen und springen“ (⌘K): a modal search over places, settings and actions. */
export function CommandPalette({ open, ...props }: CommandPaletteProps) {
  return open ? <CommandPaletteDialog {...props} /> : null;
}

const FOCUSABLE =
  'input, button:not([disabled]), [tabindex]:not([tabindex="-1"])';

function CommandPaletteDialog({
  items,
  onClose,
  queryItems,
  title = 'Suchen und springen',
  placeholder = title,
  scopeHint = 'Nennungen, Einstellungen und Aktionen',
}: Omit<CommandPaletteProps, 'open'>) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [parent, setParent] = useState<CommandItem | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const id = useId();
  const listId = `${id}-list`;
  const optionId = (index: number) => `${id}-option-${index}`;

  useEffect(() => {
    // Give the focus back to whatever opened the palette.
    const opener =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    input.current?.focus();
    return () => {
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  const level = parent?.children ?? items;
  const matches = orderedCommands([
    ...filterCommands(level, query),
    ...(parent || !query.trim() ? [] : (queryItems?.(query.trim()) ?? [])),
  ]);
  const activeIndex = Math.min(active, Math.max(0, matches.length - 1));
  const activeItem = matches[activeIndex];

  useEffect(() => {
    document
      .getElementById(optionId(activeIndex))
      ?.scrollIntoView?.({ block: 'nearest' });
  });

  const changeLevel = (next: CommandItem | null) => {
    setParent(next);
    setQuery('');
    setActive(0);
    input.current?.focus();
  };
  const run = (item: CommandItem) => {
    if (item.children) return changeLevel(item);
    item.onSelect?.();
    onClose();
  };
  const handleKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const fromInput = event.target === input.current;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onClose();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      event.stopPropagation();
      setActive(moveActive(activeIndex, event.key, matches.length));
    } else if (event.key === 'Enter' && fromInput && activeItem) {
      event.preventDefault();
      event.stopPropagation();
      run(activeItem);
    } else if (event.key === 'Backspace' && fromInput && !query && parent) {
      event.preventDefault();
      changeLevel(null);
    } else if (event.key === 'Tab') {
      const focusable = [
        ...(dialog.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []),
      ];
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
  };

  return (
    <div
      className="nb-app-design nb-command-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialog}
        className="nb-command-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onKeyDown={handleKey}
      >
        <div className="nb-command-search">
          <Icon name="search" />
          <input
            ref={input}
            role="combobox"
            aria-label={title}
            aria-expanded="true"
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={
              activeItem ? optionId(activeIndex) : undefined
            }
            autoComplete="off"
            spellCheck={false}
            placeholder={parent?.childrenPlaceholder ?? placeholder}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
          />
          <button
            type="button"
            className="nb-app-kbd"
            aria-label="Schließen"
            onClick={onClose}
          >
            Esc
          </button>
        </div>
        <div
          id={listId}
          className="nb-command-results"
          role="listbox"
          aria-label={parent?.label ?? title}
        >
          {groupCommands(matches).map((group, groupIndex) => (
            <div
              key={group.label}
              role="group"
              aria-labelledby={`${id}-group-${groupIndex}`}
            >
              <div
                id={`${id}-group-${groupIndex}`}
                role="presentation"
                className="nb-command-group"
              >
                {group.label}
              </div>
              {group.items.map((item) => {
                const index = matches.indexOf(item);
                const parts = highlightParts(item.label, query);
                return (
                  <div
                    key={item.id}
                    id={optionId(index)}
                    role="option"
                    aria-selected={index === activeIndex}
                    className="nb-command-result"
                    onMouseMove={() => {
                      if (index !== activeIndex) setActive(index);
                    }}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => run(item)}
                  >
                    <Icon name={item.icon} />
                    <span className="nb-command-result-text">
                      {parts ? (
                        <>
                          {parts.before}
                          <mark>{parts.match}</mark>
                          {parts.after}
                        </>
                      ) : (
                        item.label
                      )}
                      {item.detail && (
                        <span className="nb-command-result-detail">
                          {' '}
                          {item.detail}
                        </span>
                      )}
                    </span>
                    {index === activeIndex && (
                      <kbd className="nb-app-kbd" aria-hidden="true">
                        ↵
                      </kbd>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
          {matches.length === 0 && (
            <p className="nb-command-empty">Keine Treffer</p>
          )}
        </div>
        <div className="nb-command-footer" aria-hidden="true">
          <span>
            <kbd className="nb-app-kbd">↑</kbd>
            <kbd className="nb-app-kbd">↓</kbd>
            auswählen
          </span>
          <span>
            <kbd className="nb-app-kbd">↵</kbd>
            ausführen
          </span>
          <span className="nb-command-scope">{scopeHint}</span>
        </div>
      </div>
    </div>
  );
}
