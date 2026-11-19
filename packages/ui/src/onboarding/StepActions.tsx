import React from 'react';
import { Button } from '../button/Button.js';

export type StepActionsProps = {
  backLabel: string;
  onBack?: (() => void) | undefined;
  skipLabel?: string | undefined;
  onSkip?: (() => void) | undefined;
  continueLabel: string;
  onContinue: () => void;
  continueDisabled?: boolean | undefined;
  /** Why "Weiter" is disabled, announced to assistive technology. */
  disabledReason?: string | undefined;
  /** Visible keyboard hint, e.g. "Enter ↵ zum Fortfahren". */
  hint?: string | undefined;
  secondary?: React.ReactNode | undefined;
};

/** Back, skip and continue; lives in the shell's dock so it stays reachable. */
export function StepActions(props: StepActionsProps) {
  const reasonId = props.disabledReason ? 'nb-step-disabled-reason' : undefined;
  return (
    <div className="nb-step-actions">
      <div className="nb-step-actions-start">
        {props.onBack && (
          <Button variant="text" size={48} onClick={props.onBack}>
            {props.backLabel}
          </Button>
        )}
        {props.onSkip && props.skipLabel && (
          <Button variant="text" size={48} onClick={props.onSkip}>
            {props.skipLabel}
          </Button>
        )}
      </div>
      <div className="nb-step-actions-end">
        {props.hint && (
          <span className="nb-step-actions-hint" aria-hidden="true">
            {props.hint}
          </span>
        )}
        {props.secondary}
        <Button
          size={48}
          onClick={props.onContinue}
          disabled={props.continueDisabled}
          aria-describedby={props.continueDisabled ? reasonId : undefined}
        >
          {props.continueLabel}
        </Button>
        {reasonId && props.continueDisabled && (
          <span id={reasonId} className="nb-visually-hidden">
            {props.disabledReason}
          </span>
        )}
      </div>
    </div>
  );
}
