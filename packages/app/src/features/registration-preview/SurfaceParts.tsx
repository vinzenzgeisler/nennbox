import { type ReactNode } from 'react';
import { sideSurfaceOptions, type Surface } from './surfaces.js';

export type Status = 'ok' | 'warn' | 'bad' | 'info';

export const surfaceStatus = (surface: Surface): Status => {
  if (
    ['payment-failed', 'verify-error', 'cancelled', 'locked'].includes(surface)
  )
    return 'bad';
  if (
    [
      'waitlist',
      'payment-cancelled',
      'verify-expired',
      'resume-expired',
      'deadline',
    ].includes(surface)
  )
    return 'warn';
  if (
    ['confirmation', 'admitted', 'payment-success', 'verify-success'].includes(
      surface,
    )
  )
    return 'ok';
  return 'info';
};

/** Status pill above the title: what happened, in words, before the explanation (P6). */
export function SurfacePill({
  surface,
  locale,
  waitlist,
}: {
  surface: Surface;
  locale: 'de' | 'en';
  waitlist: boolean;
}) {
  const option = sideSurfaceOptions.find((item) => item.value === surface);
  const label =
    surface === 'confirmation' && !waitlist
      ? sideSurfaceOptions[0]!.label
      : surface === 'waitlist' || waitlist
        ? {
            de: 'Auf der Warteliste · Platz 4',
            en: 'On the waiting list · position 4',
          }
        : surface === 'admitted'
          ? { de: 'Zugelassen', en: 'Admitted' }
          : option?.label;
  if (!label) return null;
  return (
    <span className={`nb-reg-pill is-${surfaceStatus(surface)}`}>
      {label[locale]}
    </span>
  );
}

export function SurfaceRows({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="nb-reg-surface-rows">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Skeleton({ label }: { label: string }) {
  return (
    <div className="nb-reg-skeleton" aria-busy="true" aria-label={label}>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <span key={i} />
      ))}
    </div>
  );
}

export function SurfaceActions({ children }: { children: ReactNode }) {
  return <div className="nb-reg-surface-actions">{children}</div>;
}
