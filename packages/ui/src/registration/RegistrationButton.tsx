import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type RegistrationButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'className'
> & {
  /** One primary action per step (P9). Ghost is the secondary action, text and danger are inline, seg is the language switch. */
  tone?: 'primary' | 'ghost' | 'text' | 'danger' | 'seg';
  /** Arrow after the label (next), before it (back) or a plus before it. */
  icon?: 'next' | 'back' | 'plus';
  /** On phones only the icon stays visible; the label remains the accessible name. */
  iconOnlyOnMobile?: boolean;
  children: ReactNode;
};

const paths = {
  next: 'M4 12h13M12 7l5 5-5 5',
  back: 'M15 6l-6 6 6 6',
  plus: 'M12 5v14M5 12h14',
} as const;

/** Button of the public form: 44 px high, never the 32 px admin button (P9 “Knöpfe”). */
export function RegistrationButton({
  tone = 'primary',
  icon,
  iconOnlyOnMobile = false,
  type = 'button',
  children,
  ...props
}: RegistrationButtonProps) {
  const glyph = icon && (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d={paths[icon]} />
    </svg>
  );
  return (
    <button
      {...props}
      type={type}
      className={`nb-reg-btn is-${tone}${iconOnlyOnMobile ? ' is-icon-mobile' : ''}`}
    >
      {icon !== 'next' && glyph}
      <span className="nb-reg-btn-label">{children}</span>
      {icon === 'next' && glyph}
    </button>
  );
}
