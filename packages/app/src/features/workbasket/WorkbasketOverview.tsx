import './workbasket.css';
import { useCallback, useState } from 'react';
import {
  AppActions,
  AppButton,
  AppNotice,
  AppEmptyState,
  AppSection,
} from '@nennbox/ui';
import { LoadingNotice, RemoteError } from '../remote/RemoteNotice.js';
import { useRemoteResource } from '../remote/useRemoteResource.js';
import {
  loadWorkbasket,
  prioritizedTasks,
  ruleLabels,
  type WorkbasketTask,
} from './workbasketModel.js';
import { WorkbasketTaskRow } from './WorkbasketTaskRow.js';
import { WorkbasketBulkActions } from './WorkbasketBulkActions.js';

export function WorkbasketOverview({
  eventId,
  onOpenEntry,
  onOpenClass,
}: {
  eventId: string;
  onOpenEntry: (id: string) => void | Promise<void>;
  onOpenClass: (classId: string) => void;
}) {
  const load = useCallback(
    (signal: AbortSignal) => loadWorkbasket(eventId, signal),
    [eventId],
  );
  const { state, reload } = useRemoteResource(load);
  const [openError, setOpenError] = useState('');
  const [opening, setOpening] = useState(false);
  async function openTask(task: WorkbasketTask, entryId = task.entryId) {
    setOpenError('');
    setOpening(true);
    try {
      if (entryId) await onOpenEntry(entryId);
      else onOpenClass(task.classId);
    } catch {
      setOpenError(
        'Die Nennung konnte nicht geöffnet werden. Bitte erneut versuchen.',
      );
    } finally {
      setOpening(false);
    }
  }
  const [rule, setRule] = useState('');
  const [page, setPage] = useState(1);
  const data = state.status === 'ready' ? state.data : null;
  const filtered = prioritizedTasks(data?.tasks ?? []).filter(
    (task) => !rule || task.ruleId === rule,
  );
  const currentPage = Math.min(
    page,
    Math.max(1, Math.ceil(filtered.length / 10)),
  );
  const pageTasks = filtered.slice((currentPage - 1) * 10, currentPage * 10);
  const groups = [...new Set(pageTasks.map((task) => task.ruleId))];
  function filterByRule(value: string) {
    setRule(value);
    setPage(1);
  }
  return (
    <AppSection
      title="Heute zu tun"
      description="Zuerst Warnungen prüfen, dann Nachforderungen und Zulassungen bearbeiten. Keine Regel verändert Daten ohne deine Bestätigung."
    >
      {openError && <AppNotice tone="error">{openError}</AppNotice>}
      {state.status === 'loading' ? (
        <LoadingNotice subject="Der Arbeitskorb" />
      ) : state.status === 'error' ? (
        <RemoteError
          appDesign
          subject="Der Arbeitskorb"
          kind={state.kind}
          onRetry={reload}
        />
      ) : (
        data && (
          <>
            {data.tasks.length === 0 ? (
              <AppEmptyState
                title="Alles erledigt"
                description="Für diese Veranstaltung gibt es gerade nichts zu tun. Neue Aufgaben erscheinen hier, sobald sie anstehen."
              />
            ) : (
              <>
                <nav
                  className="nb-workbasket-counts"
                  aria-label="Aufgaben nach Regel filtern"
                >
                  <AppButton
                    tone={rule ? 'ghost' : 'secondary'}
                    aria-pressed={!rule}
                    onClick={() => filterByRule('')}
                  >
                    Alle Aufgaben ({data.tasks.length})
                  </AppButton>
                  {Object.entries(ruleLabels).map(([id, label]) => (
                    <AppButton
                      key={id}
                      tone={rule === id ? 'secondary' : 'ghost'}
                      aria-pressed={rule === id}
                      onClick={() => filterByRule(id)}
                    >
                      {label} ({data.counts[id] ?? 0})
                    </AppButton>
                  ))}
                </nav>
                <AppSection
                  title="Sammelaktionen"
                  description="Auswahl und genaue Auswirkungen vor dem Ausführen prüfen und bestätigen."
                >
                  <AppActions>
                    {['ready', 'missingDocuments', 'paymentOpen'].map((id) => (
                      <div key={id} className="nb-workbasket-bulk-action">
                        <WorkbasketBulkActions
                          eventId={eventId}
                          ruleId={id}
                          entryIds={[
                            ...new Set(
                              data.tasks
                                .filter(
                                  (task) => task.ruleId === id && task.entryId,
                                )
                                .map((task) => task.entryId!),
                            ),
                          ]}
                          onDone={reload}
                        />
                      </div>
                    ))}
                  </AppActions>
                </AppSection>
                <p role="status">
                  {filtered.length} Aufgaben
                  {rule ? ` · ${ruleLabels[rule] ?? rule}` : ''}
                </p>
                {filtered.length === 0 ? (
                  <AppEmptyState
                    title="Hier ist nichts zu tun"
                    description="Für diese Regel stehen gerade keine Aufgaben an."
                  />
                ) : (
                  <div className="nb-workbasket-groups">
                    {groups.map((id) => (
                      <section key={id} aria-label={ruleLabels[id] ?? id}>
                        <h3 className="nb-workbasket-group-heading">
                          {ruleLabels[id] ?? id} ({data.counts[id] ?? 0})
                        </h3>
                        <ul className="nb-workbasket-list">
                          {pageTasks
                            .filter((task) => task.ruleId === id)
                            .map((task, index) => (
                              <WorkbasketTaskRow
                                key={`${task.ruleId}-${task.entryId ?? task.classId}-${index}`}
                                task={task}
                                disabled={opening}
                                onOpen={(entryId) =>
                                  void openTask(task, entryId)
                                }
                              />
                            ))}
                        </ul>
                      </section>
                    ))}
                  </div>
                )}
                {filtered.length > 10 && (
                  <AppActions>
                    <AppButton
                      tone="secondary"
                      disabled={currentPage === 1}
                      onClick={() => setPage(currentPage - 1)}
                    >
                      Zurück
                    </AppButton>
                    <span>
                      Seite {currentPage} von {Math.ceil(filtered.length / 10)}
                    </span>
                    <AppButton
                      tone="secondary"
                      disabled={currentPage * 10 >= filtered.length}
                      onClick={() => setPage(currentPage + 1)}
                    >
                      Weiter
                    </AppButton>
                  </AppActions>
                )}
              </>
            )}
            <AppActions>
              <AppButton tone="ghost" onClick={reload}>
                Arbeitskorb aktualisieren
              </AppButton>
            </AppActions>
          </>
        )
      )}
    </AppSection>
  );
}
