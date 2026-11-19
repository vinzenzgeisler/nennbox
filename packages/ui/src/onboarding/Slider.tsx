import { useId, type CSSProperties } from 'react';

export type SliderProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number | undefined;
  onChange: (value: number) => void;
  /** Spoken value, e.g. "120 Starter"; the number alone is shown otherwise. */
  valueText?: string | undefined;
  minLabel?: string | undefined;
  maxLabel?: string | undefined;
};

/** Single-value slider with a large readout; the native range input keeps keyboard and touch behaviour. */
export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  valueText,
  minLabel,
  maxLabel,
}: SliderProps) {
  const id = useId();
  const share = ((value - min) / (max - min)) * 100;
  return (
    <div
      className="nb-slider"
      style={{ '--nb-slider-share': `${share}%` } as CSSProperties}
    >
      <label htmlFor={id}>{label}</label>
      <output htmlFor={id} className="nb-slider-value">
        {value}
      </output>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-valuetext={valueText}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      {(minLabel || maxLabel) && (
        <span className="nb-slider-range" aria-hidden="true">
          <span>{minLabel}</span>
          <span>{maxLabel}</span>
        </span>
      )}
    </div>
  );
}
