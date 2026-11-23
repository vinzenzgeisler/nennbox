import type { EventOverview } from '@nennbox/contracts';
import { AppButton, Metric, MetricGrid } from '@nennbox/ui';
import {
  deadlineText,
  formatMoney,
  totalEntries,
  type EntryFilters,
} from './overviewModel.js';

export function OverviewMetrics({
  overview,
  onOpenEntries,
}: {
  overview: EventOverview;
  onOpenEntries: (filters: EntryFilters) => void;
}) {
  const { openPayments, missingDocuments } = overview;
  const deadline = deadlineText(overview.daysUntilRegistrationCloses);
  return (
    <MetricGrid label="Kennzahlen der Veranstaltung">
      <Metric
        label="Nennungen"
        value={
          <AppButton
            tone="ghost"
            aria-label="Alle Nennungen anzeigen"
            onClick={() => onOpenEntries({})}
          >
            {totalEntries(overview.statuses)}
          </AppButton>
        }
      />
      <Metric
        label="Offene Zahlungen"
        value={
          <AppButton
            tone="ghost"
            aria-label="Nennungen mit offenen Zahlungen anzeigen"
            onClick={() => onOpenEntries({ paymentStatus: 'outstanding' })}
          >
            {openPayments.count}
          </AppButton>
        }
        detail={formatMoney(openPayments.amountCents, openPayments.currency)}
        tone={openPayments.count > 0 ? 'attention' : 'default'}
      />
      <Metric
        label="Fehlende Unterlagen"
        value={
          <AppButton
            tone="ghost"
            aria-label="Nennungen mit fehlenden Unterlagen anzeigen"
            onClick={() => onOpenEntries({ missingDocuments: 'true' })}
          >
            {missingDocuments.count}
          </AppButton>
        }
        detail="Nennungen mit fehlender Pflichtunterlage"
        tone={missingDocuments.count > 0 ? 'attention' : 'default'}
      />
      <Metric
        label="Bis Nennungsschluss"
        value={deadline.value}
        detail={deadline.detail}
      />
    </MetricGrid>
  );
}
