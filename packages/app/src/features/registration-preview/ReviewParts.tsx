import { RegistrationButton, RegistrationCard } from '@nennbox/ui';
import { type ReactNode } from 'react';

/** One group of the review step; “Ändern” is a text link back to its step. */
export function ReviewCard({
  title,
  change,
  changeLabel,
  className,
  children,
}: {
  title: ReactNode;
  change?: () => void;
  changeLabel: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <RegistrationCard
      title={title}
      {...(className ? { className } : {})}
      {...(change
        ? {
            action: (
              <RegistrationButton tone="text" onClick={change}>
                {changeLabel}
              </RegistrationButton>
            ),
          }
        : {})}
    >
      <dl className="nb-reg-review-rows">{children}</dl>
    </RegistrationCard>
  );
}

export function ReviewRow({
  label,
  tag,
  strong,
  children,
}: {
  label: string;
  tag?: string;
  strong?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="nb-reg-review-row">
      <dt>
        {label}
        {tag && <span className="nb-reg-tag">{tag}</span>}
      </dt>
      <dd className={strong ? 'is-strong' : undefined}>{children}</dd>
    </div>
  );
}
