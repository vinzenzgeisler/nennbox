import { useId, useState } from 'react';
import './filters.css';
import type { Dispatch, ReactNode, SetStateAction } from 'react';
import { AppButton, FilterBar, SelectField, TextInput } from '@nennbox/ui';
import type { EntryQuery } from './AdminEntriesModel.js';

export function AdminEntryFilters({
  draft,
  setDraft,
  changeSort,
  classes,
  tabs,
}: {
  draft: EntryQuery;
  setDraft: Dispatch<SetStateAction<EntryQuery>>;
  changeSort: (sort: string, direction?: string) => void;
  classes: Array<{ id: string; name: string }>;
  tabs?: ReactNode;
}) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const filterId = useId();
  const sortId = useId();
  const sortLabels: Record<string, string> = {
    createdAt: 'Neueste zuerst',
    requestedStartNumber: 'Wunschstartnummer',
    acceptanceStatus: 'Nennungsstatus',
    verificationStatus: 'E-Mail-Prüfung',
  };
  const activeFilters = [
    ...(draft.classId
      ? [
          {
            id: 'classId',
            label: `Klasse: ${classes.find((item) => item.id === draft.classId)?.name ?? draft.classId}`,
            removeLabel: 'Klassenfilter entfernen',
          },
        ]
      : []),
    ...(draft.paymentStatus
      ? [
          {
            id: 'paymentStatus',
            label: `Zahlung: ${draft.paymentStatus}`,
            removeLabel: 'Zahlungsfilter entfernen',
          },
        ]
      : []),
  ];
  return (
    <FilterBar
      label="Nennungen filtern"
      className="nb-entry-filters"
      tabs={tabs}
      activeFilters={activeFilters}
      onRemoveFilter={(id) => setDraft((value) => ({ ...value, [id]: '' }))}
    >
      <div className="nb-entry-search">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="11" cy="11" r="6" />
          <path d="M20 20l-4.5-4.5" />
        </svg>
        <TextInput
          label="Suche"
          type="search"
          placeholder="In Nennungen suchen"
          value={draft.search}
          maxLength={120}
          onChange={(e) =>
            setDraft((value) => ({ ...value, search: e.target.value }))
          }
        />
      </div>
      <AppButton
        tone="ghost"
        aria-expanded={filtersOpen}
        aria-controls={filterId}
        onClick={() => setFiltersOpen(!filtersOpen)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 6h16M7 12h10M10 18h4" />
        </svg>
        Filter
      </AppButton>
      <AppButton
        className="nb-entry-sort"
        tone="ghost"
        aria-expanded={sortOpen}
        aria-controls={sortId}
        onClick={() => setSortOpen(!sortOpen)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M7 4v16M4 17l3 3 3-3M17 20V4M14 7l3-3 3 3" />
        </svg>
        {sortLabels[draft.sort] ?? 'Sortierung'}
      </AppButton>
      <div
        id={filterId}
        className="nb-entry-filter-options"
        hidden={!filtersOpen}
      >
        <SelectField
          label="Klasse"
          value={draft.classId}
          onChange={(e) =>
            setDraft((value) => ({ ...value, classId: e.target.value }))
          }
        >
          <option value="">Alle</option>
          {classes.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Zahlung"
          value={draft.paymentStatus}
          onChange={(e) =>
            setDraft((value) => ({
              ...value,
              paymentStatus: e.target.value,
            }))
          }
        >
          <option value="">Alle</option>
          <option value="open">Offen</option>
          <option value="partially_paid">Teilweise bezahlt</option>
          <option value="paid">Bezahlt</option>
          <option value="not_required">Nicht erforderlich</option>
          <option value="not_relevant">Nicht relevant</option>
        </SelectField>
      </div>
      <div id={sortId} className="nb-entry-filter-options" hidden={!sortOpen}>
        <SelectField
          label="Sortierung"
          value={draft.sort}
          onChange={(e) => changeSort(e.target.value)}
        >
          <option value="createdAt">Neueste zuerst</option>
          <option value="requestedStartNumber">Wunschstartnummer</option>
          <option value="acceptanceStatus">Nennungsstatus</option>
          <option value="verificationStatus">E-Mail-Prüfung</option>
        </SelectField>
      </div>
    </FilterBar>
  );
}
