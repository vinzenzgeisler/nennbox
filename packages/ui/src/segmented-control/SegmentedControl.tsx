import { useId } from 'react';

export type SegmentedOption<Value extends string> = {
  value: Value;
  label: string;
};

/** Compact single choice among a few options; the group label names it for assistive tech and stays out of sight. */
export function SegmentedControl<Value extends string>({
  label,
  value,
  options,
  onChange,
  disabled = false,
  appearance = 'default',
}: {
  label: string;
  value: Value;
  options: Array<SegmentedOption<Value>>;
  onChange: (value: Value) => void;
  disabled?: boolean;
  appearance?: 'default' | 'app';
}) {
  const name = useId();
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={
        appearance === 'app' ? 'nb-app-radio-segmented' : 'nb-segmented'
      }
    >
      {options.map((option) => (
        <label
          key={option.value}
          className={
            appearance === 'app' ? 'nb-app-radio-option' : 'nb-segmented-option'
          }
        >
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={option.value === value}
            disabled={disabled}
            onChange={() => onChange(option.value)}
          />
          <span>{option.label}</span>
        </label>
      ))}
    </div>
  );
}
