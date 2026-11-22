import React, { createContext, useContext, useId } from 'react';
import { useQuestionTitleId } from './QuestionContext.js';

type ChoiceMode = 'single' | 'multiple';
const GroupContext = createContext<{ name: string; mode: ChoiceMode }>({
  name: '',
  mode: 'single',
});

export type ChoiceGroupProps = {
  mode?: ChoiceMode | undefined;
  columns?: 2 | 3 | undefined;
  'aria-label'?: string | undefined;
  children: React.ReactNode;
};

/**
 * Radio group (single) or checkbox group (multiple) of decision cards. The cards are
 * numbered 1–9 by their order; QuestionStep turns those numbers into shortcuts. On
 * narrow screens the cards become rows.
 */
export function ChoiceGroup({
  mode = 'single',
  columns = 3,
  children,
  ...props
}: ChoiceGroupProps) {
  const name = useId();
  const titleId = useQuestionTitleId();
  return (
    <GroupContext.Provider value={{ name, mode }}>
      <div
        className={`nb-choice-group has-${columns}-columns`}
        role={mode === 'single' ? 'radiogroup' : 'group'}
        aria-label={props['aria-label']}
        aria-labelledby={props['aria-label'] ? undefined : titleId}
      >
        {children}
      </div>
    </GroupContext.Provider>
  );
}

export type ChoiceCardProps = {
  value: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  title: string;
  description: string;
  /** Icon tile; decorative, the title carries the meaning. */
  illustration?: React.ReactNode | undefined;
  /** What this choice does to the form, classes or documents; always visible. */
  consequence?: React.ReactNode | undefined;
  /** Short label for the recommended answer, e.g. "Empfohlen"; replaced by the tick once chosen. */
  badge?: string | undefined;
  /** Card that is always on, e.g. the main language: shows this label instead of the tick and cannot be changed. */
  lockedLabel?: string | undefined;
  /** Why the card cannot be chosen; replaces the consequence and disables the card. */
  unavailableReason?: string | undefined;
  disabled?: boolean | undefined;
};

/**
 * One answer. States: rest, hover, recommended (badge), chosen (tick), keyboard focus
 * (ring) and unavailable (with the reason in place of the consequence).
 */
export function ChoiceCard({
  value,
  checked,
  onChange,
  title,
  description,
  illustration,
  consequence,
  badge,
  unavailableReason,
  lockedLabel,
  disabled,
}: ChoiceCardProps) {
  const { name, mode } = useContext(GroupContext);
  const blocked = Boolean(disabled || unavailableReason || lockedLabel);
  const foot = unavailableReason ?? consequence;
  return (
    <div
      className={`nb-choice-card${checked || lockedLabel ? ' is-selected' : ''}${blocked && !lockedLabel ? ' is-unavailable' : ''}${lockedLabel ? ' is-locked' : ''}`}
      data-mode={mode}
    >
      <label className="nb-choice-card-main">
        <input
          className="nb-choice-card-input"
          type={mode === 'single' ? 'radio' : 'checkbox'}
          name={name}
          value={value}
          checked={checked}
          disabled={blocked}
          readOnly={Boolean(lockedLabel)}
          data-choice=""
          onChange={(event) => onChange(event.target.checked)}
        />
        <span className="nb-choice-card-body">
          {illustration && (
            <span className="nb-choice-card-art" aria-hidden="true">
              {illustration}
            </span>
          )}
          <span className="nb-choice-card-title">{title}</span>
          <span className="nb-choice-card-description">{description}</span>
        </span>
        {foot && (
          <span className="nb-choice-card-consequence">
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
            <span>{foot}</span>
          </span>
        )}
        {lockedLabel ? (
          <span className="nb-choice-card-badge">{lockedLabel}</span>
        ) : checked ? (
          <span className="nb-choice-card-tick" aria-hidden="true">
            <svg viewBox="0 0 24 24" focusable="false">
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          </span>
        ) : (
          badge &&
          !blocked && <span className="nb-choice-card-badge">{badge}</span>
        )}
      </label>
    </div>
  );
}
