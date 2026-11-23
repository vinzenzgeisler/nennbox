import { AppThumb } from '../app-primitives/AppPrimitives.js';
import type { ReactNode } from 'react';
import { Checkbox } from '../choice/Choice.js';
export function EntryListRow({
  name,
  vehicle,
  hints,
  imageUrl,
  imageAlt = '',
  className,
  number,
  requestedNumber,
  selected = false,
  dimmed = false,
  checked = false,
  onSelect,
  onOpen,
  onOpenDetail,
  openActionId,
  status,
  completion,
  nextAction,
  menu,
  selectLabel,
}: {
  name: string;
  vehicle: string;
  hints?: ReactNode;
  imageUrl?: string | null;
  imageAlt?: string;
  className: string;
  number?: string | null;
  requestedNumber?: string | null;
  selected?: boolean;
  dimmed?: boolean;
  checked?: boolean;
  onSelect?: (selected: boolean) => void;
  onOpen?: () => void;
  onOpenDetail?: (() => void) | undefined;
  openActionId?: string;
  status: ReactNode;
  completion?: ReactNode;
  nextAction?: ReactNode;
  menu?: ReactNode;
  selectLabel: string;
}) {
  return (
    <tr
      className={`nb-entry-list-row${selected ? ' is-selected' : ''}${dimmed ? ' is-dim' : ''}`}
      onClick={onOpen}
      onDoubleClick={(event) => {
        if (
          event.target instanceof Element &&
          event.target.closest(
            'input, summary, [role=menuitem], button:not(.nb-entry-list-open), a',
          )
        )
          return;
        onOpenDetail?.();
      }}
    >
      <td data-column="selection" onClick={(event) => event.stopPropagation()}>
        <span
          className="nb-entry-list-select"
          onClick={(event) => event.stopPropagation()}
        >
          <Checkbox
            visuallyHiddenLabel
            label={selectLabel}
            checked={checked}
            onChange={(event) => onSelect?.(event.target.checked)}
          />
        </span>
      </td>
      <td data-column="person">
        <div className="nb-entry-list-person">
          {imageUrl ? (
            <img src={imageUrl} alt={imageAlt} />
          ) : (
            <AppThumb className="nb-entry-list-image-empty" />
          )}
          {onOpen ? (
            <button
              className="nb-entry-list-open"
              data-entry-action={openActionId}
              data-selected-entry={selected ? true : undefined}
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onOpen();
              }}
            >
              <strong>{name}</strong>
              <span className="nb-entry-list-meta">
                <small>
                  {number ? `Nr. ${number} · ` : ''}
                  {requestedNumber ? `Wunsch: ${requestedNumber} · ` : ''}
                  {vehicle}
                </small>
                {hints}
              </span>
            </button>
          ) : (
            <span>
              <strong>{name}</strong>
              <span className="nb-entry-list-meta">
                <small>
                  {number ? `Nr. ${number} · ` : ''}
                  {requestedNumber ? `Wunsch: ${requestedNumber} · ` : ''}
                  {vehicle}
                </small>
                {hints}
              </span>
            </span>
          )}
        </div>
      </td>
      <td data-priority="2">{className}</td>
      <td data-column="status">{status}</td>
      <td data-column="completion">{completion}</td>
      <td
        data-priority="1"
        data-column="actions"
        onClick={(event) => event.stopPropagation()}
      >
        {nextAction}
        {menu}
      </td>
    </tr>
  );
}
