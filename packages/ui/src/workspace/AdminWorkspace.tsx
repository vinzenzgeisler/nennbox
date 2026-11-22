import type { ReactNode } from 'react';
export function AdminWorkspace({
  navigation,
  header,
  children,
  inset = true,
  overlay,
}: {
  navigation: ReactNode;
  header: ReactNode;
  children: ReactNode;
  /** false lets the content run edge to edge, e.g. for WorkspaceSplit. */
  inset?: boolean;
  /** Fixed layers above the workspace, e.g. „Suchen und springen“. */
  overlay?: ReactNode;
}) {
  return (
    <div className="nb-admin-workspace">
      {navigation}
      <div className="nb-admin-workspace-body">
        {header}
        <main className={`nb-admin-workspace-main${inset ? ' is-inset' : ''}`}>
          {children}
        </main>
      </div>
      {overlay}
    </div>
  );
}
