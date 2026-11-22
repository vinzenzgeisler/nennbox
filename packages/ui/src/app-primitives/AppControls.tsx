import type { ComponentProps, ReactNode } from 'react';
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
export function AppFileInput(
  props: Omit<ComponentProps<typeof AppTextInput>, 'type'>,
) {
  return <AppTextInput {...props} type="file" />;
}
