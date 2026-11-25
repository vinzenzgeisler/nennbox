import { SelectField } from '@nennbox/ui';

export function EntryWarningFilter({
  value,
  onChange,
  disabled,
  count,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  count: number;
}) {
  return (
    <SelectField
      label="Warnungen auf dieser Seite"
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="all">Alle Nennungen dieser Seite</option>
      <option value="with">Mit Warnungen ({count})</option>
      <option value="without">Ohne Warnungen</option>
    </SelectField>
  );
}
