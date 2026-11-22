import { useId, type ReactNode } from 'react';
import { Icon } from '../icon/Icon.js';

/** Compact N5 row; closed editors retain their values but leave the focus order. */
export function AppEditorRow({
  label,
  preview,
  description,
  open,
  onToggle,
  children,
}: {
  label: string;
  preview: ReactNode;
  description?: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <div className="nb-app-editor-row">
      <button
        type="button"
        className="nb-app-editor-summary"
        aria-label={label}
        aria-expanded={open}
        aria-controls={id}
        onClick={onToggle}
      >
        <span className="nb-app-inline">{preview}</span>
        <span className="nb-app-editor-description">{description}</span>
        <span className="nb-app-editor-toggle">
          <span>Bearbeiten</span>
          <Icon name="next" />
        </span>
      </button>
      <div className="nb-app-editor-disclosure" data-open={open} inert={!open}>
        <div id={id} className="nb-app-editor-content" aria-hidden={!open}>
          <div className="nb-app-stack">{children}</div>
        </div>
      </div>
    </div>
  );
}

/** The configured workflow color appears only in the small status marker. */
export function AppWorkflowPill({
  label,
  color,
}: {
  label: string;
  color?: string | undefined;
}) {
  return (
    <span className="nb-app-pill nb-app-workflow-pill">
      <i
        aria-hidden="true"
        style={
          color && /^#[0-9a-f]{6}$/i.test(color)
            ? { backgroundColor: color }
            : undefined
        }
      />
      {label}
    </span>
  );
}
