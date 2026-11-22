import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
} from 'react';

type ActionTone = 'primary' | 'secondary' | 'ghost';
export function AppButton({
  tone = 'secondary',
  type = 'button',
  iconOnly = false,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: ActionTone;
  iconOnly?: boolean;
}) {
  return (
    <button
      {...props}
      type={type}
      className={`nb-app-btn nb-app-btn-${tone}${iconOnly ? ' nb-app-icon-btn' : ''} ${className}`}
    />
  );
}
export function KeyboardHint({ children }: { children: ReactNode }) {
  return <kbd className="nb-app-kbd">{children}</kbd>;
}
export type AppStatus = 'offen' | 'vor' | 'zu' | 'neg' | 'ab';
export function AppStatusPill({
  status,
  children,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { status: AppStatus }) {
  return (
    <span {...props} className={`nb-app-pill nb-app-status-${status}`}>
      <i aria-hidden="true" />
      {children}
    </span>
  );
}
export function AppThumb({
  children,
  className = '',
}: {
  children?: ReactNode;
  className?: string;
}) {
  return <span className={`nb-app-thumb ${className}`}>{children}</span>;
}
export function AppProgressDots({
  states,
  label,
}: {
  states: Array<'ok' | 'missing' | 'waiting' | 'na'>;
  label: string;
}) {
  return (
    <span className="nb-app-dots" role="img" aria-label={label}>
      {states.map((state, index) => (
        <i key={index} className={`nb-app-dot-${state}`} />
      ))}
    </span>
  );
}
export function AppField({
  className = '',
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`nb-app-field ${className}`} />;
}
export function AppChip({ children }: { children: ReactNode }) {
  return <span className="nb-app-chip">{children}</span>;
}
export function AppPopover({ children }: { children: ReactNode }) {
  return <div className="nb-app-popover">{children}</div>;
}
export function AppMenuItem({
  children,
  danger = false,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { danger?: boolean }) {
  return (
    <button
      {...props}
      className={`nb-app-menu-item${danger ? ' is-danger' : ''}`}
    >
      {children}
    </button>
  );
}
export function AppSegmented({
  options,
  value,
  onChange,
  label,
}: {
  options: Array<{ value: string; label: string }>;
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  return (
    <div className="nb-app-segmented" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
export function AppCheckbox({
  label,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { label: string }) {
  return (
    <label className="nb-app-checkbox">
      <input {...props} type="checkbox" />
      <span aria-hidden="true" />
      {label}
    </label>
  );
}
