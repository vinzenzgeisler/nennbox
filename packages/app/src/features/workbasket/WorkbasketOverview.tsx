import './workbasket.css';
import { useCallback, useState } from 'react';
import {
  AppActions,
  AppButton,
  AppNotice,
  AppEmptyState,
  AppSection,
  AppSelect,
  AppView,
} from '@nennbox/ui';
import { LoadingNotice, RemoteError } from '../remote/RemoteNotice.js';
import { useRemoteResource } from '../remote/useRemoteResource.js';
import {
  loadWorkbasket,
  prioritizedTasks,
  ruleLabels,
  type WorkbasketTask,
} from './workbasketModel.js';
import { warningEvidence } from '../entries/warnings/entryWarnings.js';
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
  async function openTask(task: WorkbasketTask) {
    setOpenError('');
    setOpening(true);
    try {
      if (task.entryId) await onOpenEntry(task.entryId);
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
                <AppSelect
                  label="Aufgaben filtern"
                  value={rule}
                  onChange={(event) => {
                    setRule(event.target.value);
                    setPage(1);
                  }}
                >
                  <option value="">Alle Aufgaben ({data.tasks.length})</option>
                  {Object.entries(ruleLabels).map(([id, label]) => (
                    <option key={id} value={id}>
                      {label} ({data.counts[id] ?? 0})
                    </option>
                  ))}
                </AppSelect>
                <AppSection
                  title="Sammelaktionen"
                  description="Auswahl und genaue Auswirkungen vor dem Ausführen prüfen und bestätigen."
                >
                  <AppActions>
                    {['ready', 'missingDocuments', 'paymentOpen'].map((id) => (
                      <WorkbasketBulkActions
                        key={id}
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
                  <AppView>
                    {filtered
                      .slice((currentPage - 1) * 10, currentPage * 10)
                      .map((task, index) => (
                        <Task
                          key={`${task.ruleId}-${task.entryId ?? task.classId}-${index}`}
                          task={task}
                          disabled={opening}
                          onOpen={() => void openTask(task)}
                        />
                      ))}
                  </AppView>
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
function Task({
  task,
  onOpen,
  disabled,
}: {
  task: WorkbasketTask;
  onOpen: () => void;
  disabled: boolean;
}) {
  return (
    <section
      className="nb-workbasket-task"
      aria-label={ruleLabels[task.ruleId] ?? task.ruleId}
    >
      <strong>
        {task.severity === 'warning' ? 'Prüfen: ' : ''}
        {ruleLabels[task.ruleId] ?? task.ruleId}
      </strong>
      <p>{task.reason}</p>
      <p className="nb-workbasket-fields">
        Betroffene Datenfelder: {warningEvidence(task)}
      </p>
      <AppButton tone="secondary" disabled={disabled} onClick={onOpen}>
        {task.entryId ? 'Nennung öffnen' : 'Nennungen der Klasse öffnen'}
      </AppButton>
    </section>
  );
}
