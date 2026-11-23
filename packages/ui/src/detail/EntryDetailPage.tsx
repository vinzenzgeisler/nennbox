import { usePreviewResize } from '../workspace/usePreviewResize.js';
import { useId, useRef, type ReactNode, type CSSProperties } from 'react';
import { useRevealActiveTab } from '../tabs/useRevealActiveTab.js';
import { AppButton } from '../app-primitives/AppPrimitives.js';

export type EntryDetailTab = { key: string; label: string; count?: number };
export function EntryDetailPage({
  navigation,
  header,
  progress,
  tabs,
  activeTab,
  onTab,
  sidebar,
  children,
}: {
  navigation: ReactNode;
  header: ReactNode;
  progress: ReactNode;
  tabs: readonly EntryDetailTab[];
  activeTab: string;
  onTab: (key: string) => void;
  sidebar: ReactNode;
  children: ReactNode;
}) {
  const id = useId();
  const { ref, width } = usePreviewResize();
  const tabRow = useRef<HTMLElement>(null);
  useRevealActiveTab(tabRow, activeTab);
  return (
    <div
      ref={ref}
      className="nb-entry-page"
      style={{ '--workspace-preview-width': `${width}px` } as CSSProperties}
    >
      <div className="nb-entry-page-navigation">{navigation}</div>
      <div className="nb-entry-page-head">
        <div className="nb-entry-page-identity">{header}</div>
        <nav
          ref={tabRow}
          aria-label="Bereiche der Nennung"
          className="nb-entry-page-tabs"
        >
          {tabs.map((tab) => (
            <AppButton
              key={tab.key}
              tone="ghost"
              aria-pressed={tab.key === activeTab}
              aria-controls={id}
              onClick={() => onTab(tab.key)}
            >
              {tab.label}
              {tab.count !== undefined && <span>{tab.count}</span>}
            </AppButton>
          ))}
        </nav>
      </div>
      <div className="nb-entry-page-body">
        <div id={id} className="nb-entry-page-content">
          {children}
        </div>
        <aside
          className="nb-entry-page-sidebar"
          aria-label="Checkliste, Aktionen und Eigenschaften"
        >
          {progress}
          {sidebar}
        </aside>
      </div>
    </div>
  );
}
export function AdmissionProgress({
  items,
  summary,
}: {
  items: readonly {
    label: string;
    state: 'done' | 'missing' | 'wait' | 'not_relevant';
    detail: string;
  }[];
  summary: string;
}) {
  return (
    <section className="nb-admission-progress" aria-label="Bis zur Zulassung">
      <div>
        <strong>Bis zur Zulassung</strong>
        <span>{summary}</span>
      </div>
      <ol>
        {items.map((item) => (
          <li key={item.label} className={`is-${item.state}`}>
            <i aria-hidden="true" />
            <span>
              <strong>{item.label}</strong> <span>{item.detail}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
