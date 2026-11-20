import React from 'react';
import { SegmentedControl } from '../segmented-control/SegmentedControl.js';

export type LivePreviewProps<View extends string> = {
  label: string;
  /** Short mono title, e.g. "Vorschau". */
  title: string;
  statusLabel: string;
  views: Array<{ value: View; label: string }>;
  view: View;
  onViewChange: (view: View) => void;
  viewsLabel: string;
  /** Address shown in the frame, so the club sees where the page will live. */
  address: string;
  children: React.ReactNode;
};

/** Browser-like frame for the live preview of the form or event page. */
export function LivePreview<View extends string>({
  label,
  title,
  statusLabel,
  views,
  view,
  onViewChange,
  viewsLabel,
  address,
  children,
}: LivePreviewProps<View>) {
  return (
    <section className="nb-live" aria-label={label}>
      <header className="nb-live-head">
        <p className="nb-live-title">
          {title}
          <span className="nb-live-status">
            <i aria-hidden="true" />
            {statusLabel}
          </span>
        </p>
        <SegmentedControl
          label={viewsLabel}
          value={view}
          options={views}
          onChange={onViewChange}
        />
      </header>
      <div className="nb-live-frame">
        <div className="nb-live-chrome" aria-hidden="true">
          <i />
          <i />
          <i />
          <span>{address}</span>
        </div>
        <div className="nb-live-viewport" aria-live="polite">
          {children}
        </div>
      </div>
    </section>
  );
}
