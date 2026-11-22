import React, { createContext, useContext, useId } from 'react';
import { useQuestionTitleId } from './QuestionContext.js';

type ChoiceMode = 'single' | 'multiple';
const GroupContext = createContext<{ name: string; mode: ChoiceMode }>({
  name: '',
  mode: 'single',
});

export type ChoiceGroupProps = {
  mode?: ChoiceMode | undefined;
  /** `tiles` puts the sketch above the text; `rows` beside it. Narrow screens always use rows. */
  layout?: 'tiles' | 'rows' | undefined;
  columns?: 2 | 3 | undefined;
  'aria-label'?: string | undefined;
  children: React.ReactNode;
};

/**
 * Radio group (single) or checkbox group (multiple) of large decision cards. The
 * cards are numbered 1–9 by their order; QuestionStep turns those numbers into
 * keyboard shortcuts.
 */
export function ChoiceGroup({
  mode = 'single',
  layout = 'tiles',
  columns = 3,
  children,
  ...props
}: ChoiceGroupProps) {
  const name = useId();
  const titleId = useQuestionTitleId();
  return (
    <GroupContext.Provider value={{ name, mode }}>
      <div
        className={`nb-choice-group is-${layout} has-${columns}-columns`}
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
  /** A sketch from the onboarding set; decorative, the title carries the meaning. */
  illustration?: React.ReactNode | undefined;
  /** Short label for a recommended answer, e.g. "Empfohlen". */
  badge?: string | undefined;
  exampleLabel?: string | undefined;
  example?: React.ReactNode | undefined;
  disabled?: boolean | undefined;
};

export function ChoiceCard({
  value,
  checked,
  onChange,
  title,
  description,
  illustration,
  badge,
  exampleLabel,
  example,
  disabled,
}: ChoiceCardProps) {
  const { name, mode } = useContext(GroupContext);
  return (
    <div
      className={`nb-choice-card${checked ? ' is-selected' : ''}${disabled ? ' is-disabled' : ''}`}
      data-mode={mode}
    >
      <label className="nb-choice-card-main">
        <input
          className="nb-choice-card-input"
          type={mode === 'single' ? 'radio' : 'checkbox'}
          name={name}
          value={value}
          checked={checked}
          disabled={disabled}
          data-choice=""
          onChange={(event) => onChange(event.target.checked)}
        />
        {illustration && (
          <span className="nb-choice-card-art" aria-hidden="true">
            {illustration}
          </span>
        )}
        <span className="nb-choice-card-text">
          {badge && <span className="nb-choice-card-badge">{badge}</span>}
          <span className="nb-choice-card-title">{title}</span>
          <span className="nb-choice-card-description">{description}</span>
        </span>
        <span className="nb-choice-card-mark" aria-hidden="true" />
        <span className="nb-choice-card-key" aria-hidden="true" />
      </label>
      {example && exampleLabel && (
        <details className="nb-choice-card-example">
          <summary>{exampleLabel}</summary>
          <div>{example}</div>
        </details>
      )}
    </div>
  );
}
