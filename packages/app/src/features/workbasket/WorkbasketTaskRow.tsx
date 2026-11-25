import { useId } from 'react';
import { AppButton, Icon } from '@nennbox/ui';
import type { WorkbasketTask } from './workbasketModel.js';

type EntryDisplay = NonNullable<WorkbasketTask['entry']>;
function identity(entry: EntryDisplay) {
  return [
    entry.startNumber ? `#${entry.startNumber}` : null,
    entry.organizationCode,
    entry.className,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** Display only: all facts, including age and duplicate matches, come from the API. */
export function WorkbasketTaskRow({
  task,
  disabled,
  onOpen,
}: {
  task: WorkbasketTask;
  disabled: boolean;
  onOpen: (entryId?: string) => void;
}) {
  const descriptionId = useId();
  const identityId = useId();
  const ageId = useId();
  const name =
    task.entry?.name ??
    (task.entryId ? 'Nennung' : (task.className ?? 'Klasse'));
  const openLabel = task.entryId
    ? task.entry
      ? `Nennung ${name} öffnen`
      : 'Nennung öffnen'
    : 'Nennungen der Klasse öffnen';
  return (
    <li className="nb-workbasket-task">
      <AppButton
        tone="ghost"
        className="nb-workbasket-row"
        disabled={disabled}
        aria-label={openLabel}
        aria-describedby={`${identityId} ${descriptionId} ${ageId}`}
        onClick={() => onOpen()}
      >
        <span className="nb-workbasket-identity">
          <strong>{name}</strong>
          <span id={identityId} className="nb-workbasket-meta">
            {task.entry ? identity(task.entry) : task.className}
          </span>
        </span>
        <span id={descriptionId} className="nb-workbasket-detail">
          {task.detail?.de ?? task.reason}
        </span>
        <span id={ageId} className="nb-workbasket-meta">
          {task.ageDays != null
            ? task.ageDays === 0
              ? 'Heute eingegangen'
              : `Seit ${task.ageDays} ${task.ageDays === 1 ? 'Tag' : 'Tagen'}`
            : null}
        </span>
        <span className="nb-workbasket-open">
          <span>{task.entryId ? 'Öffnen' : 'Klasse öffnen'}</span>
          <Icon name="next" />
        </span>
      </AppButton>
      {!!task.relatedEntries?.length && (
        <div
          className="nb-workbasket-related"
          aria-label="Zugehörige Nennungen"
        >
          <span className="nb-workbasket-meta">Abgleichen mit:</span>
          {task.relatedEntries.map((entry) => (
            <AppButton
              key={entry.id}
              tone="ghost"
              disabled={disabled}
              aria-label={`Nennung ${entry.name} öffnen`}
              onClick={() => onOpen(entry.id)}
            >
              <Icon name="link" />
              {entry.name} · {identity(entry)}
            </AppButton>
          ))}
        </div>
      )}
    </li>
  );
}
