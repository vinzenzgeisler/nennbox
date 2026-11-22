import { useEffect, useRef } from 'react';

export type EntryStatusTone = 'offen' | 'vor' | 'zu' | 'neg' | 'ab';
export function EntryStatusMenu({
  label,
  tone,
  options,
  onChange,
  disabled = false,
}: {
  label: string;
  tone: EntryStatusTone;
  options: readonly { key: string; label: string; tone: EntryStatusTone }[];
  onChange: (key: string) => void;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && ref.current?.open) {
        event.stopImmediatePropagation();
        ref.current.open = false;
        ref.current.querySelector('summary')?.focus();
      }
    };
    document.addEventListener('keydown', close, true);
    return () => document.removeEventListener('keydown', close, true);
  }, []);
  return (
    <details
      className="nb-entry-status-menu"
      ref={ref}
      onClick={(event) => event.stopPropagation()}
    >
      <summary
        aria-label={`Status: ${label}`}
        className={`nb-app-pill nb-app-status-${tone}`}
      >
        <i />
        {label}
      </summary>
      {options.length > 0 && !disabled && (
        <div
          className="nb-entry-status-options"
          role="menu"
          aria-label="Status ändern"
        >
          {options.map((option) => (
            <button
              type="button"
              role="menuitem"
              key={option.key}
              onClick={() => {
                ref.current!.open = false;
                onChange(option.key);
              }}
            >
              <i
                className={`nb-entry-status-option-dot nb-app-status-${option.tone}`}
              />
              {option.label}
            </button>
          ))}
        </div>
      )}
    </details>
  );
}
