import React, { useRef } from 'react';
export type TabItem = {
  id: string;
  label: string;
  /** Shown after the label as a mono count; part of the accessible name. */
  count?: number | string;
  content: React.ReactNode;
};

export function TabList({
  tabs,
  selected,
  onChange,
  label,
}: {
  tabs: Array<Pick<TabItem, 'id' | 'label' | 'count'>>;
  selected: string;
  onChange: (id: string) => void;
  label: string;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const move = (index: number, key: string) => {
    const delta = key === 'ArrowRight' ? 1 : -1;
    const next = (index + delta + tabs.length) % tabs.length;
    onChange(tabs[next]!.id);
    refs.current[next]?.focus();
  };
  const activeId = tabs.find((tab) => tab.id === selected)?.id ?? tabs[0]?.id;
  return (
    <div className="nb-tab-list" role="tablist" aria-label={label}>
      {tabs.map((tab, index) => (
        <button
          key={tab.id}
          ref={(node) => {
            refs.current[index] = node;
          }}
          id={`${tab.id}-tab`}
          type="button"
          role="tab"
          aria-selected={tab.id === activeId}
          aria-controls={`${tab.id}-panel`}
          tabIndex={tab.id === activeId ? 0 : -1}
          onClick={() => onChange(tab.id)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
              event.preventDefault();
              move(index, event.key);
            }
          }}
        >
          {tab.label}
          {tab.count !== undefined && (
            <>
              {' '}
              <span className="nb-tab-count">{tab.count}</span>
            </>
          )}
        </button>
      ))}
    </div>
  );
}

export function TabPanel({
  id,
  children,
}: {
  id: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="nb-tab-panel"
      id={`${id}-panel`}
      role="tabpanel"
      aria-labelledby={`${id}-tab`}
    >
      {children}
    </section>
  );
}

export function Tabs({
  tabs,
  selected,
  onChange,
  label,
}: {
  tabs: TabItem[];
  selected: string;
  onChange: (id: string) => void;
  label: string;
}) {
  const active = tabs.find((tab) => tab.id === selected) ?? tabs[0];
  return (
    <div className="nb-tabs">
      <TabList
        tabs={tabs}
        selected={selected}
        onChange={onChange}
        label={label}
      />
      {active && <TabPanel id={active.id}>{active.content}</TabPanel>}
    </div>
  );
}
