import type { InputHTMLAttributes, ReactNode } from 'react';

/**
 * Radio card of the administration app: one choice with a name and a short
 * sentence, selectable by clicking anywhere on the card. Group the cards in a
 * fieldset (`AppOptionCards`) so the group has an accessible name.
 */
export function AppOptionCard({
  label,
  description,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'children'> & {
  label: ReactNode;
  description?: ReactNode;
}) {
  return (
    <label className="nb-app-option-card">
      <input {...props} type="radio" />
      <span>
        <strong>{label}</strong>
        {description && <small>{description}</small>}
      </span>
    </label>
  );
}
export function AppOptionCards({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <fieldset className="nb-app-option-cards">
      <legend>{label}</legend>
      {children}
    </fieldset>
  );
}
