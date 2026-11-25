import { WorkbasketAdmission } from './WorkbasketAdmission.js';
import { WorkbasketReminder } from './WorkbasketReminder.js';

export type WorkbasketBulkActionsProps = {
  eventId: string;
  ruleId: string;
  entryIds: string[];
  onDone: () => void;
};
/** Explicitly confirmed, advisory actions; no mutation runs on mount or selection. */
export function WorkbasketBulkActions(props: WorkbasketBulkActionsProps) {
  const key = `${props.eventId}:${props.ruleId}:${[...new Set(props.entryIds)].sort().join(',')}`;
  if (props.ruleId === 'ready')
    return <WorkbasketAdmission key={key} {...props} />;
  // Task changes reset drafts; attempted sends are restored by event/rule from session storage.
  if (props.ruleId === 'missingDocuments' || props.ruleId === 'paymentOpen')
    return <WorkbasketReminder key={key} {...props} ruleId={props.ruleId} />;
  return null;
}
