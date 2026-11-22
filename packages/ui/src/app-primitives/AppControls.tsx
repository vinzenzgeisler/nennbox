import { useState, type ComponentProps, type ReactNode } from 'react';
import { Dialog } from '../dialog/Dialog.js';
import { AppTextInput } from './AppView.js';

/** Explicit opt-in leaves public pages and setup dialogs unchanged. */
export function AppDialog(
  props: Omit<ComponentProps<typeof Dialog>, 'appearance'>,
) {
  return <Dialog {...props} appearance="app" />;
}
export function AppActions({ children }: { children: ReactNode }) {
  return <div className="nb-app-inline">{children}</div>;
}
export function AppSelectionList({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="nb-app-selection-list" role="group" aria-label={label}>
      {children}
    </div>
  );
}
export function AppFileInput({
  label,
  onChange,
  ...props
}: Omit<ComponentProps<typeof AppTextInput>, 'type'>) {
  const [filename, setFilename] = useState('');
  return (
    <label className="nb-app-input nb-app-file">
      <span>{label}</span>
      <span className="nb-app-file-control">
        <input
          aria-label={label}
          {...props}
          type="file"
          onChange={(event) => {
            const name = Array.from(event.target.files ?? [])
              .map((file) => file.name)
              .join(', ');
            onChange?.(event);
            setFilename(event.target.value ? name : '');
          }}
        />
        <span className="nb-app-btn nb-app-btn-secondary" aria-hidden="true">
          Datei auswählen
        </span>
        <span className="nb-app-file-name" aria-hidden="true">
          {filename || 'Keine Datei ausgewählt'}
        </span>
      </span>
    </label>
  );
}
