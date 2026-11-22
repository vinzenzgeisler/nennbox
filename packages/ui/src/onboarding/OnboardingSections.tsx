export type OnboardingSectionState = 'done' | 'active' | 'todo';

export type OnboardingSectionItem = {
  id: string;
  label: string;
  state: OnboardingSectionState;
  /** Screens of this section; only the active section shows them. */
  screens?: Array<{ label: string; state: OnboardingSectionState }>;
};

export type OnboardingSectionsProps = {
  label: string;
  sections: OnboardingSectionItem[];
  /** Spoken suffix of finished sections, e.g. "erledigt". */
  doneLabel: string;
  /** Jump back to a finished section. */
  onSelect: (id: string) => void;
  /** Time note at the foot, e.g. title "Noch etwa acht Minuten". */
  note?: { title: string; text: string } | undefined;
};

const check = (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);

/**
 * Section bar of the guided setup. It never counts screens: finished sections carry a
 * tick and can be clicked, the active one shows its screens, later ones stay quiet.
 */
export function OnboardingSections({
  label,
  sections,
  doneLabel,
  onSelect,
  note,
}: OnboardingSectionsProps) {
  return (
    <aside className="nb-onb-sections">
      <nav aria-label={label}>
        <ol>
          {sections.map((section, index) => {
            const content = (
              <>
                <span className="nb-onb-section-num" aria-hidden="true">
                  {section.state === 'done' ? check : index + 1}
                </span>
                <span>{section.label}</span>
                {section.state === 'done' && (
                  <span className="nb-visually-hidden"> ({doneLabel})</span>
                )}
              </>
            );
            return (
              <li key={section.id} className={`is-${section.state}`}>
                {section.state === 'done' ? (
                  <button
                    type="button"
                    className="nb-onb-section"
                    onClick={() => onSelect(section.id)}
                  >
                    {content}
                  </button>
                ) : (
                  <span
                    className="nb-onb-section"
                    aria-current={
                      section.state === 'active' ? 'step' : undefined
                    }
                  >
                    {content}
                  </span>
                )}
                {section.state === 'active' && section.screens && (
                  <ol className="nb-onb-screens">
                    {section.screens.map((screen) => (
                      <li
                        key={screen.label}
                        className={`is-${screen.state}`}
                        aria-current={
                          screen.state === 'active' ? 'location' : undefined
                        }
                      >
                        <i aria-hidden="true" />
                        {screen.label}
                      </li>
                    ))}
                  </ol>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
      {note && (
        <div className="nb-onb-note">
          <strong>{note.title}</strong>
          <span>{note.text}</span>
        </div>
      )}
    </aside>
  );
}
