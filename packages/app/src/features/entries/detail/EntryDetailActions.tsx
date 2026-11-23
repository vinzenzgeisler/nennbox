import { AppButton, EntryStatusMenu } from '@nennbox/ui';
import type { EntryResponse as Entry } from '@nennbox/contracts';
import type { WorkflowView } from '../AdminEntriesModel.js';
import { statusSteps, type StatusStep } from './EntryActionRail.js';
export function EntryDetailActions({
  selected,
  workflow,
  busy,
  onStatus,
}: {
  selected: Entry;
  workflow: WorkflowView | null;
  busy: boolean;
  onStatus: (step: StatusStep) => void;
}) {
  const steps = statusSteps(selected, workflow);
  const options = [...steps.others, ...(steps.primary ? [steps.primary] : [])];
  return (
    <>
      <EntryStatusMenu
        label={
          selected.statusProjection?.dimensions.find(
            (item) =>
              item.key === 'entry' && item.value === selected.acceptanceStatus,
          )?.label.de ??
          workflow?.statuses.find(
            (item) => (item.id ?? item.key) === selected.acceptanceStatus,
          )?.labels.de ??
          selected.acceptanceStatus
        }
        tone={statusTone(
          workflow?.statuses.find(
            (item) => (item.id ?? item.key) === selected.acceptanceStatus,
          )?.category,
        )}
        disabled={busy}
        options={options.map((step) => ({
          key: step.to,
          label:
            workflow?.statuses.find((item) => (item.id ?? item.key) === step.to)
              ?.labels.de ?? step.label,
          tone: statusTone(
            workflow?.statuses.find((item) => (item.id ?? item.key) === step.to)
              ?.category,
          ),
        }))}
        onChange={(key) => {
          const step = options.find((item) => item.to === key);
          if (step) onStatus(step);
        }}
      />
      {['rejected', 'accepted'].map((category) => {
        const step = options.find(
          (item) =>
            workflow?.statuses.find(
              (status) => (status.id ?? status.key) === item.to,
            )?.category === category,
        );
        return (
          step && (
            <AppButton
              key={category}
              tone={category === 'accepted' ? 'primary' : 'secondary'}
              disabled={busy}
              onClick={() => onStatus(step)}
            >
              {category === 'accepted' ? 'Zulassen' : 'Ablehnen'}
            </AppButton>
          )
        );
      })}
    </>
  );
}
function statusTone(
  category: string | undefined,
): 'offen' | 'vor' | 'zu' | 'neg' | 'ab' {
  return category === 'accepted'
    ? 'zu'
    : category === 'waitlisted'
      ? 'vor'
      : category === 'rejected'
        ? 'neg'
        : category === 'withdrawn'
          ? 'ab'
          : 'offen';
}
