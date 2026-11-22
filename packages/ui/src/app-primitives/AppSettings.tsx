import type { ReactNode } from 'react';

/** N5 settings: section navigation, a readable form column and optional help. */
export function AppSettingsLayout({
  navigation,
  children,
  aside,
}: {
  navigation: ReactNode;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <div className={`nb-app-settings${aside ? ' has-aside' : ''}`}>
      {navigation}
      <div className="nb-app-stack">{children}</div>
      {aside && (
        <aside className="nb-app-stack" aria-label="Hilfe und Vorschau">
          {aside}
        </aside>
      )}
    </div>
  );
}
export function AppSettingsNav({
  items,
  activeId,
  onSelect,
  navRef,
}: {
  items: ReadonlyArray<{ id: string; label: string }>;
  activeId: string;
  onSelect: (id: string) => void;
  navRef?: React.Ref<HTMLElement>;
}) {
  return (
    <nav
      ref={navRef}
      className="nb-app-settings-nav"
      aria-label="Abschnittsnavigation"
    >
      {items.map((item) => (
        <a
          key={item.id}
          href={`#${item.id}`}
          aria-current={item.id === activeId}
          onClick={(event) => {
            event.preventDefault();
            onSelect(item.id);
          }}
        >
          {item.label}
        </a>
      ))}
    </nav>
  );
}
export function AppPreviewCard({ children }: { children: ReactNode }) {
  return <div className="nb-app-preview-card">{children}</div>;
}
