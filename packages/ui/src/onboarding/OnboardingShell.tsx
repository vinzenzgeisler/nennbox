import React, { useId, useState } from 'react';
import { EmergingContext } from './EmergingContext.js';

export type OnboardingShellProps = {
  brand: React.ReactNode;
  /** Name of the flow next to the brand, e.g. "Einrichten". */
  title: string;
  /** Secondary position note, e.g. "Schirm 4 von 14". */
  position?: React.ReactNode | undefined;
  /** Share of the flow behind the member, 0–1. */
  progress: number;
  progressLabel: string;
  /** Language switch and "Später fortsetzen". */
  headerEnd?: React.ReactNode | undefined;
  /** Section bar; hidden below 980 px. */
  sections?: React.ReactNode | undefined;
  /** "Das entsteht"; a sheet below 1240 px. Omitted on screens that need the width. */
  emerging?: React.ReactNode | undefined;
  /** Bar that opens the sheet on narrow screens. */
  emergingBar?:
    { title: string; summary: string; open: string; close: string } | undefined;
  actions?: React.ReactNode | undefined;
  /** Uses the whole middle column, e.g. for the summary with its preview. */
  wide?: boolean | undefined;
  children: React.ReactNode;
};

/**
 * Frame of the guided setup: header with progress line, section bar on the left, one
 * question in the middle, "Das entsteht" on the right and a sticky foot bar. Below
 * 1240 px the right column becomes a bar above the foot; below 980 px the section
 * bar drops out.
 */
export function OnboardingShell({
  brand,
  title,
  position,
  progress,
  progressLabel,
  headerEnd,
  sections,
  emerging,
  emergingBar,
  actions,
  wide,
  children,
}: OnboardingShellProps) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const percent = Math.round(Math.min(1, Math.max(0, progress)) * 100);
  return (
    <div
      className={`nb-onb nb-app-design${emerging ? ' has-emerging' : ''}${sections ? ' has-sections' : ''}${wide ? ' is-wide' : ''}`}
    >
      <header className="nb-onb-top">
        <div className="nb-onb-brand">{brand}</div>
        <span className="nb-onb-divider" aria-hidden="true" />
        <span className="nb-onb-title">{title}</span>
        <span className="nb-onb-spacer" />
        {position && <span className="nb-onb-position">{position}</span>}
        {headerEnd}
        <div
          className="nb-onb-progress"
          role="progressbar"
          aria-label={progressLabel}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
        >
          <span style={{ width: `${percent}%` }} />
        </div>
      </header>
      <div className="nb-onb-frame">
        {sections}
        <main className="nb-onb-main">
          <div className="nb-onb-scroll">
            <div className="nb-onb-content">{children}</div>
          </div>
          <div className="nb-onb-dock">
            {emerging && emergingBar && (
              <button
                type="button"
                className="nb-onb-emerging-bar"
                aria-expanded={open}
                aria-controls={id}
                onClick={() => setOpen(!open)}
              >
                <span className="nb-onb-emerging-bar-title">
                  {emergingBar.title}
                </span>
                <span className="nb-onb-emerging-bar-count">
                  {emergingBar.summary}
                </span>
                <span className="nb-onb-emerging-bar-action">
                  {open ? emergingBar.close : emergingBar.open}
                </span>
              </button>
            )}
            {actions}
          </div>
        </main>
        <EmergingContext.Provider value={{ open, setOpen, id }}>
          {emerging}
        </EmergingContext.Provider>
      </div>
    </div>
  );
}
