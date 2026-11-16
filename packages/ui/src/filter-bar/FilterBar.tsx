import React from 'react';
export function FilterBar({
  label,
  children,
  actions,
  activeFilters,
  onRemoveFilter,
  tabs,
  mobileToggleLabel,
  ...props
}: React.HTMLAttributes<HTMLElement> & {
  label: string;
  actions?: React.ReactNode;
  /** Status tabs; they sit on the bar below the fields, as in the A7 reference. */
  tabs?: React.ReactNode;
  /** Optional compact-mobile control; fields stay mounted and retain their values. */
  mobileToggleLabel?: string;
  activeFilters?: Array<{ id: string; label: string; removeLabel: string }>;
  onRemoveFilter?: (id: string) => void;
}) {
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const fieldsId = React.useId();
  return (
    <section
      {...props}
      className={`nb-filter-bar${tabs ? ' has-tabs' : ''}${mobileToggleLabel ? ' is-mobile-collapsible' : ''} ${props.className ?? ''}`}
      aria-label={label}
    >
      {mobileToggleLabel && (
        <button
          type="button"
          className="nb-filter-mobile-toggle"
          aria-expanded={mobileOpen}
          aria-controls={fieldsId}
          onClick={() => setMobileOpen((open) => !open)}
        >
          {mobileToggleLabel}
          <span aria-hidden="true">{mobileOpen ? '−' : '+'}</span>
        </button>
      )}
      <div
        id={fieldsId}
        className={`nb-filter-fields${mobileOpen ? ' is-mobile-open' : ''}`}
      >
        {children}
      </div>
      {actions && <div className="nb-filter-actions">{actions}</div>}
      {activeFilters && activeFilters.length > 0 && (
        <div className="nb-active-filters">
          {activeFilters.map((filter) => (
            <button
              type="button"
              key={filter.id}
              aria-label={filter.removeLabel}
              onClick={() => onRemoveFilter?.(filter.id)}
            >
              {filter.label}
              <span aria-hidden="true">×</span>
            </button>
          ))}
        </div>
      )}
      {tabs && <div className="nb-filter-bar-tabs">{tabs}</div>}
    </section>
  );
}
