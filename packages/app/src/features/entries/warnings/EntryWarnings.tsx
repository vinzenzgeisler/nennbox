import { AppButton, Banner, HintLabel, Icon } from '@nennbox/ui';
import { warningEvidence, type EntryWarning } from './entryWarnings.js';

export function EntryWarnings({
  warnings = [],
  fields,
  compact = false,
}: {
  warnings?: EntryWarning[] | undefined;
  fields?: string[];
  compact?: boolean;
}) {
  const visible = warnings.filter(
    (warning) =>
      warning.severity === 'warning' &&
      (!fields || warning.fields.some((field) => fields.includes(field))),
  );
  if (!visible.length) return null;
  if (compact)
    return (
      <span
        aria-label={visible
          .map((warning) => `${warning.reason} (${warningEvidence(warning)})`)
          .join('; ')}
        title={visible
          .map((warning) => `${warning.reason} (${warningEvidence(warning)})`)
          .join('\n')}
      >
        <HintLabel>
          <Icon name="warning" /> {visible.length}{' '}
          {visible.length === 1 ? 'Warnung' : 'Warnungen'}
        </HintLabel>
      </span>
    );
  return (
    <div aria-label="Warnungen">
      {visible.map((warning) => (
        <Banner
          tone="warning"
          key={`${warning.ruleId}:${warning.entryId}:${warning.classId}`}
        >
          {warning.reason}
          <small> Betroffene Felder: {warningEvidence(warning)}</small>
        </Banner>
      ))}
    </div>
  );
}
export function EntryWarningsStatus({
  status,
  retry,
}: {
  status: 'idle' | 'loading' | 'ready' | 'error';
  retry: () => void;
}) {
  if (status === 'loading')
    return <p role="status">Warnungen werden geladen …</p>;
  if (status !== 'error') return null;
  return (
    <Banner tone="warning">
      Warnungen konnten nicht geladen werden.
      <AppButton tone="ghost" onClick={retry}>
        Erneut versuchen
      </AppButton>
    </Banner>
  );
}
