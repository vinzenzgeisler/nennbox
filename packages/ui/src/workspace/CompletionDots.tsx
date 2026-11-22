import { AppProgressDots } from '../app-primitives/AppPrimitives.js';
export type CompletionState = 'done' | 'missing' | 'wait' | 'not_relevant';

/** The four admission dimensions, always in their canonical order. */
export function CompletionDots({
  states,
}: {
  states: readonly CompletionState[];
}) {
  const completed = states.filter(
    (state) => state === 'done' || state === 'not_relevant',
  ).length;
  const label = `${completed} von ${states.length} erledigt`;
  return (
    <span className="nb-completion">
      <AppProgressDots
        states={states.map(
          (state) =>
            (
              ({
                done: 'ok',
                missing: 'missing',
                wait: 'waiting',
                not_relevant: 'na',
              }) as const
            )[state],
        )}
        label={label}
      />
      <span>
        {completed} von {states.length}
      </span>
    </span>
  );
}

export function AdmissionChecklist({
  states,
}: {
  states: readonly CompletionState[];
}) {
  const labels = ['Zahlung', 'Unterlagen', 'Abnahme', 'Haftverzicht'];
  const completed = states.filter(
    (state) => state === 'done' || state === 'not_relevant',
  ).length;
  return (
    <section className="nb-preview-checklist" aria-label="Bis zur Zulassung">
      <div className="nb-preview-section-heading">
        <h3>Bis zur Zulassung</h3>
        <span>
          {completed} von {states.length} erledigt
        </span>
      </div>
      {states.map((state, index) => (
        <div className="nb-preview-check" key={labels[index]}>
          <i
            data-state={state === 'not_relevant' ? 'done' : state}
            aria-hidden="true"
          />
          <span>{labels[index]}</span>
          <small>
            {state === 'not_relevant'
              ? 'Nicht erforderlich'
              : state === 'done'
                ? 'Erledigt'
                : state === 'wait'
                  ? 'Vor Ort'
                  : 'Fehlt'}
          </small>
        </div>
      ))}
    </section>
  );
}
