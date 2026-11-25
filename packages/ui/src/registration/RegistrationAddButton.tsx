import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type RegistrationAddButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'className' | 'children' | 'title'
> & {
  /** `spare`: inset box inside a Startmeldung; `add`: dashed box below the Startmeldungen. */
  variant: 'spare' | 'add';
  title: ReactNode;
  description?: ReactNode;
  /** Price badge at the right edge, e.g. “0 €” (P1 decision 01). */
  tag?: ReactNode;
};

/** Add action drawn as a box with plus, text and price badge, not as a link (P1, P3). */
export function RegistrationAddButton({
  variant,
  title,
  description,
  tag,
  type = 'button',
  ...props
}: RegistrationAddButtonProps) {
  return (
    <button {...props} type={type} className={`nb-reg-${variant}`}>
      <span className={`nb-reg-${variant}-icon`} aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </span>
      <span className={`nb-reg-${variant}-text`}>
        <strong>{title}</strong>
        {description && <span>{description}</span>}
      </span>
      {tag && <span className="nb-reg-tag">{tag}</span>}
    </button>
  );
}
