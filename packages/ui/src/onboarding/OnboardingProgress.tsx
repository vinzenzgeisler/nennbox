export type OnboardingProgressProps = {
  label: string;
  /** Phase names in order; `fill` is the share of that phase already behind the member. */
  segments: Array<{ label: string; fill: number }>;
  current: number;
  /** Spoken and shown position, e.g. "Schritt 5 von 16". */
  position: string;
  completedLabel: string;
};

/** Seven-station progress bar in the style of the Nennformular step bar. */
export function OnboardingProgress({
  label,
  segments,
  current,
  position,
  completedLabel,
}: OnboardingProgressProps) {
  return (
    <nav className="nb-onb-progress" aria-label={label}>
      <p className="nb-onb-progress-position">{position}</p>
      <ol>
        {segments.map((segment, index) => (
          <li
            key={segment.label}
            aria-current={index === current ? 'step' : undefined}
            className={index < current ? 'is-done' : undefined}
          >
            <span className="nb-onb-progress-bar" aria-hidden="true">
              <span style={{ width: `${Math.round(segment.fill * 100)}%` }} />
            </span>
            <span className="nb-onb-progress-name">
              <span aria-hidden="true">
                {String(index + 1).padStart(2, '0')}
              </span>{' '}
              {segment.label}
              {index < current && (
                <span className="nb-visually-hidden"> ({completedLabel})</span>
              )}
            </span>
          </li>
        ))}
      </ol>
    </nav>
  );
}
