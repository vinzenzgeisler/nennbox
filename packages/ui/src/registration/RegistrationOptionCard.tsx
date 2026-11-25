import type { InputHTMLAttributes, ReactNode } from 'react';

export type RegistrationOptionCardProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'children' | 'className'
> & {
  label: ReactNode;
  /** Price sits in the card because it changes the decision (P9). */
  price?: ReactNode;
  detail?: ReactNode;
  /** Sold out: still selectable, but marked in words rather than colour alone. */
  unavailable?: boolean;
};

/** Radio card of the registration form: a real radio with a 44 px target. */
export function RegistrationOptionCard({
  label,
  price,
  detail,
  unavailable = false,
  ...inputProps
}: RegistrationOptionCardProps) {
  return (
    <label className={`nb-reg-option${unavailable ? ' is-unavailable' : ''}`}>
      <input {...inputProps} type="radio" />
      <span className="nb-reg-option-text">
        <strong>{label}</strong>
        {detail && <small>{detail}</small>}
      </span>
      {price && <span className="nb-reg-option-price">{price}</span>}
    </label>
  );
}
