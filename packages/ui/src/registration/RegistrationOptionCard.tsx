import type { InputHTMLAttributes, ReactNode } from 'react';

export type RegistrationOptionCardProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'children' | 'className'
> & {
  label: ReactNode;
  /** Price sits in the card because it changes the decision (P9). */
  price?: ReactNode;
  detail?: ReactNode;
  /** Short example in mono type next to the label, e.g. how the name would appear. */
  meta?: ReactNode;
  /** Green detail line for “places free”; sold out stays orange via `unavailable`. */
  detailTone?: 'free' | undefined;
  /** Sold out: still selectable, but marked in words rather than colour alone. */
  unavailable?: boolean;
};

/** Radio card of the registration form: a real radio with a 44 px target. */
export function RegistrationOptionCard({
  label,
  price,
  detail,
  meta,
  detailTone,
  unavailable = false,
  ...inputProps
}: RegistrationOptionCardProps) {
  return (
    <label className={`nb-reg-option${unavailable ? ' is-unavailable' : ''}`}>
      <input {...inputProps} type="radio" />
      <span className="nb-reg-option-text">
        <span className="nb-reg-option-head">
          <strong>{label}</strong>
          {meta && <span className="nb-reg-option-meta">{meta}</span>}
          {price && <span className="nb-reg-option-price">{price}</span>}
        </span>
        {detail && (
          <small className={detailTone === 'free' ? 'is-free' : undefined}>
            {detail}
          </small>
        )}
      </span>
    </label>
  );
}
