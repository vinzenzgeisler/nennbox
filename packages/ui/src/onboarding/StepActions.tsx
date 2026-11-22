import React from 'react';
import { AppButton } from '../app-primitives/AppPrimitives.js';

export type StepActionsProps = {
  backLabel: string;
  onBack?: (() => void) | undefined;
  skipLabel?: string | undefined;
  /** Second line of the skip button, e.g. "Wir nehmen den Vorschlag". */
  skipHint?: string | undefined;
  onSkip?: (() => void) | undefined;
  continueLabel: string;
  onContinue: () => void;
  continueDisabled?: boolean | undefined;
  /** Why "Weiter" is disabled, announced to assistive technology. */
  disabledReason?: string | undefined;
  /** Keys that work on this screen, e.g. ["↵ weiter", "1–9 wählen"]. */
  hints?: string[] | undefined;
  /** Quieter action next to the main one, e.g. "Als Entwurf speichern". */
  secondary?: React.ReactNode | undefined;
};

/**
 * Foot bar: back on the left, skip only where there is something to skip, key hints
 * and the main action on the right. Lives in the shell's dock so it stays reachable.
 */
export function StepActions(props: StepActionsProps) {
  const reasonId = props.disabledReason ? 'nb-step-disabled-reason' : undefined;
  return (
    <div className="nb-step-actions">
      <div className="nb-step-actions-start">
        {props.onBack && (
          <AppButton onClick={props.onBack} className="nb-step-back">
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M15 6l-6 6 6 6" />
            </svg>
            {props.backLabel}
          </AppButton>
        )}
        {props.onSkip && props.skipLabel && (
          <AppButton
            tone="ghost"
            onClick={props.onSkip}
            className="nb-step-skip"
          >
            <span>{props.skipLabel}</span>
            {props.skipHint && <small>{props.skipHint}</small>}
          </AppButton>
        )}
      </div>
      <div className="nb-step-actions-end">
        {props.hints && props.hints.length > 0 && (
          <span className="nb-step-actions-hint" aria-hidden="true">
            {props.hints.join(' · ')}
          </span>
        )}
        {props.secondary}
        <AppButton
          tone="primary"
          className="nb-step-continue"
          onClick={props.onContinue}
          disabled={props.continueDisabled}
          aria-describedby={props.continueDisabled ? reasonId : undefined}
        >
          {props.continueLabel}
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </AppButton>
        {reasonId && props.continueDisabled && (
          <span id={reasonId} className="nb-visually-hidden">
            {props.disabledReason}
          </span>
        )}
      </div>
    </div>
  );
}
