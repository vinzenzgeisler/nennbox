import React, { useId } from 'react';

type Describe = { hint?: string | undefined; error?: string | undefined };

export type OnboardingFieldProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'prefix'
> &
  Describe & {
    label: string;
    /** Fixed text after the input, e.g. ".nennbox.com". */
    suffix?: string | undefined;
    /** Quiet confirmation below the field, e.g. "Adresse ist frei". */
    success?: string | undefined;
  };

function describedBy(
  id: string,
  { hint, error, success }: Describe & { success?: string | undefined },
) {
  if (error) return `${id}-error`;
  if (success) return `${id}-success`;
  return hint ? `${id}-hint` : undefined;
}

/** Text field of the setup in the app design (32 px, inset border). */
export function OnboardingField({
  label,
  hint,
  error,
  success,
  suffix,
  id,
  className = '',
  ...props
}: OnboardingFieldProps) {
  const generated = useId();
  const inputId = id ?? `onb-${generated}`;
  return (
    <div className="nb-onb-field">
      <label htmlFor={inputId}>{label}</label>
      <div
        className={`nb-onb-field-box${error ? ' has-error' : ''}${suffix ? ' has-suffix' : ''}`}
      >
        <input
          {...props}
          id={inputId}
          className={className}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(inputId, { hint, error, success })}
        />
        {suffix && <span aria-hidden="true">{suffix}</span>}
      </div>
      {error ? (
        <small className="nb-onb-field-error" id={`${inputId}-error`}>
          {error}
        </small>
      ) : success ? (
        <small className="nb-onb-field-success" id={`${inputId}-success`}>
          {success}
        </small>
      ) : (
        hint && <small id={`${inputId}-hint`}>{hint}</small>
      )}
    </div>
  );
}

export type OnboardingTextareaProps =
  React.TextareaHTMLAttributes<HTMLTextAreaElement> &
    Describe & { label: string };

export function OnboardingTextarea({
  label,
  hint,
  error,
  id,
  ...props
}: OnboardingTextareaProps) {
  const generated = useId();
  const inputId = id ?? `onb-${generated}`;
  return (
    <div className="nb-onb-field">
      <label htmlFor={inputId}>{label}</label>
      <textarea
        {...props}
        id={inputId}
        className={`nb-onb-textarea${error ? ' has-error' : ''}`}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(inputId, { hint, error })}
      />
      {error ? (
        <small className="nb-onb-field-error" id={`${inputId}-error`}>
          {error}
        </small>
      ) : (
        hint && <small id={`${inputId}-hint`}>{hint}</small>
      )}
    </div>
  );
}

export type OnboardingSwitchProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'type' | 'role'
> & {
  label: string;
  hint?: string | undefined;
  /** Keeps the label for assistive technology only, e.g. in a list row that names the field itself. */
  hideLabel?: boolean | undefined;
};

/** On/off switch with a label and an optional explanation. */
export function OnboardingSwitch({
  label,
  hint,
  hideLabel,
  id,
  ...props
}: OnboardingSwitchProps) {
  const generated = useId();
  const inputId = id ?? `onb-${generated}`;
  return (
    <div className="nb-onb-switch">
      <input
        {...props}
        id={inputId}
        type="checkbox"
        role="switch"
        aria-describedby={hint ? `${inputId}-hint` : undefined}
      />
      <label htmlFor={inputId}>
        <span className="nb-onb-switch-track" aria-hidden="true" />
        <span
          className={hideLabel ? 'nb-visually-hidden' : 'nb-onb-switch-text'}
        >
          {label}
        </span>
      </label>
      {hint && <small id={`${inputId}-hint`}>{hint}</small>}
    </div>
  );
}

export type OnboardingFileButtonProps = {
  label: string;
  accept: string;
  onSelect: (file: File | undefined) => void;
  describedBy?: string | undefined;
};

/** File chooser that looks like a secondary button; the native input stays focusable. */
export function OnboardingFileButton({
  label,
  accept,
  onSelect,
  describedBy,
}: OnboardingFileButtonProps) {
  return (
    <label className="nb-app-btn nb-app-btn-secondary nb-onb-file">
      <input
        type="file"
        accept={accept}
        aria-describedby={describedBy}
        onChange={(event) => onSelect(event.target.files?.[0])}
      />
      {label}
    </label>
  );
}
