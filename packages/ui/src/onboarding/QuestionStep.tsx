import React, { useEffect, useId, useRef } from 'react';
import { QuestionContext } from './QuestionContext.js';

export type QuestionStepProps = {
  /** Line above the question, e.g. "Abschnitt 3 · Veranstaltung". */
  eyebrow: string;
  title: string;
  lead?: React.ReactNode | undefined;
  /** Concrete example of the chosen answer, shown below the answers. */
  example?: { label: string; text: React.ReactNode } | undefined;
  /** Quiet line below the answers, e.g. what to do to continue. */
  note?: React.ReactNode | undefined;
  /** Follow-up control below the example, e.g. the build-year limit. */
  after?: React.ReactNode | undefined;
  /** Enter on a focused field or card continues; omitted while the step cannot continue. */
  onSubmit?: (() => void) | undefined;
  children: React.ReactNode;
};

const typing = (target: HTMLElement) =>
  (target.tagName === 'INPUT' &&
    !['radio', 'checkbox', 'range'].includes(
      (target as HTMLInputElement).type,
    )) ||
  target.tagName === 'TEXTAREA' ||
  target.tagName === 'SELECT' ||
  target.isContentEditable;

/** One question per screen: heading, optional lead, answers, and keyboard handling. */
export function QuestionStep({
  eyebrow,
  title,
  lead,
  example,
  note,
  after,
  onSubmit,
  children,
}: QuestionStepProps) {
  const titleId = useId();
  const root = useRef<HTMLElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const submit = useRef(onSubmit);
  useEffect(() => {
    submit.current = onSubmit;
  });
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, [title]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey
      )
        return;
      const target = event.target as HTMLElement;
      if (/^[1-9]$/.test(event.key) && !typing(target)) {
        const input = root.current?.querySelectorAll<HTMLInputElement>(
          'input[data-choice]:not(:disabled)',
        )[Number(event.key) - 1];
        if (input) {
          event.preventDefault();
          input.focus();
          input.click();
        }
      } else if (
        event.key === 'Enter' &&
        !event.shiftKey &&
        submit.current &&
        !['BUTTON', 'A', 'SUMMARY', 'TEXTAREA', 'SELECT'].includes(
          target.tagName,
        )
      ) {
        event.preventDefault();
        submit.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <QuestionContext.Provider value={{ titleId }}>
      <section className="nb-question" ref={root} aria-labelledby={titleId}>
        <header className="nb-question-head">
          <p className="nb-question-eyebrow">{eyebrow}</p>
          <h1
            className="nb-question-title"
            id={titleId}
            ref={heading}
            tabIndex={-1}
          >
            {title}
          </h1>
          {lead && <p className="nb-question-lead">{lead}</p>}
        </header>
        <div className="nb-question-body">{children}</div>
        {example && (
          <aside className="nb-question-example">
            <span className="nb-question-example-label">{example.label}</span>
            <p>{example.text}</p>
          </aside>
        )}
        {after}
        {note && <p className="nb-question-note">{note}</p>}
      </section>
    </QuestionContext.Provider>
  );
}
