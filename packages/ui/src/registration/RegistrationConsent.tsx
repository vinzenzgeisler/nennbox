import type { InputHTMLAttributes, ReactNode } from 'react';

export type RegistrationConsentProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'children' | 'className'
> & {
  label: ReactNode;
  /** The text to read is a link inside the sentence's box, never a button under it (P1 decision 05). */
  readLabel: string;
  onRead: () => void;
  error?: ReactNode;
};

/** One confirmation of the review step: checkbox, sentence and the link to its text. */
export function RegistrationConsent({
  label,
  readLabel,
  onRead,
  error,
  id,
  ...inputProps
}: RegistrationConsentProps) {
  return (
    <div className={`nb-reg-consent${error ? ' has-error' : ''}`}>
      <label>
        <input
          {...inputProps}
          id={id}
          type="checkbox"
          aria-invalid={error ? true : undefined}
          aria-describedby={error && id ? `${id}-error` : undefined}
        />
        <span>{label}</span>
      </label>
      <button type="button" className="nb-reg-consent-link" onClick={onRead}>
        {readLabel}
      </button>
      {error && (
        <small
          className="nb-reg-field-error"
          id={id ? `${id}-error` : undefined}
        >
          <span aria-hidden="true">ⓘ</span> {error}
        </small>
      )}
    </div>
  );
}
