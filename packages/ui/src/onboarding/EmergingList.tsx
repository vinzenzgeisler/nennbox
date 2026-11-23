import { useEffect, useRef, type ReactNode } from 'react';
import { useEmergingSheet } from './useEmergingSheet.js';
import { useEmerging } from './EmergingContext.js';

export type EmergingFact = {
  kind: 'fact';
  id: string;
  label: string;
  /** `null` renders the quiet "noch offen" line. */
  value: string | null;
  /** Follows from earlier answers instead of being asked. */
  derived?: boolean | undefined;
  /** Text of the "abgeleitet" marker. */
  derivedLabel?: string | undefined;
  /** Identifies the displayed value, independently of the current screen. */
  signature: string;
};

export type EmergingField = {
  kind: 'field';
  id: string;
  name: string;
  tag: string;
  tone: 'required' | 'optional' | 'file' | 'off';
  /** Half a sentence on why this entry exists. */
  reason: string;
  signature: string;
};

export type EmergingGroup = {
  id: string;
  title: string;
  icon?: ReactNode | undefined;
  rows: Array<EmergingFact | EmergingField>;
};

export type EmergingListProps = {
  title: string;
  openLabel: string;
  groups: EmergingGroup[];
  footnote?: string | undefined;
  /** Label of the close button of the sheet on narrow screens. */
  closeLabel: string;
};

/**
 * "Das entsteht": a grouped list instead of a preview. Facts show a value or the quiet
 * "noch offen"; form fields and documents add the reason in half a sentence. A row
 * whose content changed is marked mint for a moment.
 */
export function EmergingList({
  title,
  openLabel,
  groups,
  footnote,
  closeLabel,
}: EmergingListProps) {
  const { open, setOpen, id } = useEmerging();
  const sheet = useEmergingSheet(open, setOpen);
  return (
    <aside
      ref={sheet}
      role={open ? 'dialog' : undefined}
      aria-modal={open ? true : undefined}
      tabIndex={open ? -1 : undefined}
      id={id}
      className={`nb-emerging${open ? ' is-open' : ''}`}
      aria-label={title}
    >
      <div className="nb-emerging-sheet-head">
        <strong>{title}</strong>
        <button type="button" onClick={() => setOpen(false)}>
          {closeLabel}
        </button>
      </div>
      <div className="nb-emerging-groups">
        {groups.map((group) => (
          <section key={group.id} className="nb-emerging-group">
            <h2>
              {group.icon}
              {group.title}
            </h2>
            <ul>
              {group.rows.map((row) => (
                <EmergingRow key={row.id} row={row} openLabel={openLabel} />
              ))}
            </ul>
          </section>
        ))}
      </div>
      {footnote && <p className="nb-emerging-footnote">{footnote}</p>}
    </aside>
  );
}

function EmergingRow({
  row,
  openLabel,
}: {
  row: EmergingFact | EmergingField;
  openLabel: string;
}) {
  const element = useRef<HTMLLIElement>(null);
  const previous = useRef(row.signature);
  useEffect(() => {
    if (previous.current === row.signature) return;
    previous.current = row.signature;
    const node = element.current;
    node?.classList.add('is-changed');
    const timer = window.setTimeout(
      () => node?.classList.remove('is-changed'),
      1500,
    );
    return () => {
      window.clearTimeout(timer);
      node?.classList.remove('is-changed');
    };
  }, [row.signature]);
  return row.kind === 'fact' ? (
    <li
      ref={element}
      key={row.signature}
      className={`nb-emerging-row nb-emerging-fact${row.value === null ? ' is-open' : ''}`}
    >
      <span className="nb-emerging-label">{row.label}</span>
      <span className="nb-emerging-value">
        {row.value ?? openLabel}
        {row.derived && row.value !== null && (
          <span className="nb-emerging-derived">{row.derivedLabel}</span>
        )}
      </span>
    </li>
  ) : (
    <li
      ref={element}
      key={row.signature}
      className={`nb-emerging-row nb-emerging-field${row.tone === 'off' ? ' is-off' : ''}`}
    >
      <span className="nb-emerging-name">
        {row.name}
        <span className={`nb-emerging-tag is-${row.tone}`}>{row.tag}</span>
      </span>
      <span className="nb-emerging-reason">{row.reason}</span>
    </li>
  );
}
