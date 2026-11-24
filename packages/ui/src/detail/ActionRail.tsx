import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Button } from '../button/Button.js';
/** Primary step of the entry with its hint, on top of the rail. */
export function NextStep({
  label,
  action,
  hint,
}: {
  label: string;
  action?: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <section className="nb-next-step">
      <h3 className="nb-rail-label">{label}</h3>
      {action}
      {hint && <p>{hint}</p>}
    </section>
  );
}
/** Full-width primary action; the signal square marks the one decision to take. */
export function NextStepButton({
  children,
  ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  children: ReactNode;
}) {
  return (
    <Button {...props} variant="primary" size={48} className="nb-next-button">
      {children}
    </Button>
  );
}
export function ActionGroup({
  title,
  hideTitle = false,
  children,
}: {
  title: string;
  hideTitle?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      className="nb-action-group"
      aria-label={hideTitle ? title : undefined}
    >
      {!hideTitle && <h3 className="nb-rail-label">{title}</h3>}
      <div>{children}</div>
    </section>
  );
}
export function RailAction({
  tone = 'default',
  icon,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: 'default' | 'danger';
  icon?: ReactNode;
}) {
  return (
    <button
      type="button"
      {...props}
      className={`nb-rail-action nb-rail-${tone}`}
    >
      {icon}
      <span>{children}</span>
    </button>
  );
}
export function RailNote({ children }: { children: ReactNode }) {
  return <p className="nb-rail-note">{children}</p>;
}
