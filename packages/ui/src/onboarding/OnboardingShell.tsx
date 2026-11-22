import React, { useEffect, useId, useState } from 'react';

export type OnboardingShellProps = {
  brand: React.ReactNode;
  progress?: React.ReactNode | undefined;
  headerEnd?: React.ReactNode | undefined;
  /** The LivePreview; omitted on screens that need the whole width. */
  preview?: React.ReactNode | undefined;
  previewToggleLabel: string;
  previewCloseLabel: string;
  actions?: React.ReactNode | undefined;
  children: React.ReactNode;
};

/**
 * Full-screen frame of the guided setup: header with progress, one question on the
 * left, the live preview on the right (a collapsible sheet above the action dock on
 * narrow screens).
 */
export function OnboardingShell({
  brand,
  progress,
  headerEnd,
  preview,
  previewToggleLabel,
  previewCloseLabel,
  actions,
  children,
}: OnboardingShellProps) {
  const [open, setOpen] = useState(false);
  const previewId = useId();
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  return (
    <div className={`nb-onb${preview ? ' has-preview' : ''}`}>
      <header className="nb-onb-header">
        <div className="nb-onb-brand">{brand}</div>
        <div className="nb-onb-progress-slot">{progress}</div>
        <div className="nb-onb-header-end">{headerEnd}</div>
      </header>
      <div className="nb-onb-body">
        <main className="nb-onb-main">{children}</main>
        {preview && (
          <div
            id={previewId}
            className={`nb-onb-preview${open ? ' is-open' : ''}`}
          >
            {preview}
          </div>
        )}
      </div>
      <div className="nb-onb-dock">
        {preview && (
          <button
            type="button"
            className="nb-onb-preview-toggle"
            aria-expanded={open}
            aria-controls={previewId}
            onClick={() => setOpen(!open)}
          >
            <span>{open ? previewCloseLabel : previewToggleLabel}</span>
            <i aria-hidden="true" />
          </button>
        )}
        {actions}
      </div>
    </div>
  );
}
