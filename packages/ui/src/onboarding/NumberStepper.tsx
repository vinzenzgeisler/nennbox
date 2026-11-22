import { useId } from 'react';

export type NumberStepperProps = {
  label: string;
  hint?: string | undefined;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  lessLabel: string;
  moreLabel: string;
};

/**
 * Number with steps for build year, expected starters or fees. Never an empty field:
 * there is always a suggestion that can be moved up or down.
 */
export function NumberStepper({
  label,
  hint,
  value,
  min,
  max,
  step,
  onChange,
  lessLabel,
  moreLabel,
}: NumberStepperProps) {
  const id = useId();
  const clamp = (next: number) => Math.min(max, Math.max(min, next));
  return (
    <div className="nb-stepper" role="group" aria-labelledby={`${id}-label`}>
      <div className="nb-stepper-text">
        <strong id={`${id}-label`}>{label}</strong>
        {hint && <span>{hint}</span>}
      </div>
      <div className="nb-stepper-control">
        <button
          type="button"
          aria-label={lessLabel}
          disabled={value <= min}
          onClick={() => onChange(clamp(value - step))}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M6 12h12" />
          </svg>
        </button>
        <output aria-live="polite">{value}</output>
        <button
          type="button"
          aria-label={moreLabel}
          disabled={value >= max}
          onClick={() => onChange(clamp(value + step))}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M6 12h12M12 6v12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
