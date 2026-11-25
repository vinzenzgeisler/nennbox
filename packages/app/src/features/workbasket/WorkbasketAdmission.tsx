import { useEffect, useRef, useState } from 'react';
import {
  AppButton,
  Icon,
  AppDialog,
  AppNotice,
  AppSelectionList,
  ReasonDialog,
} from '@nennbox/ui';
import {
  errorText,
  executeAdmissions,
  prepareAdmissions,
  type Admission,
  type BulkResult,
} from './workbasketBulkApi.js';

export function WorkbasketAdmission({
  eventId,
  entryIds,
  onDone,
}: {
  eventId: string;
  entryIds: string[];
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const controller = useRef(new AbortController());
  useEffect(() => {
    const active = new AbortController();
    controller.current = active;
    return () => active.abort();
  }, []);
  const [error, setError] = useState('');
  const [plan, setPlan] = useState<Admission[]>([]);
  const [skipped, setSkipped] = useState<BulkResult[]>([]);
  const [results, setResults] = useState<BulkResult[] | null>(null);
  async function prepare() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      const value = await prepareAdmissions(eventId, entryIds);
      setPlan(value.admissions);
      setSkipped(value.results);
      setOpen(true);
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function execute(reason: string) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      setResults([
        ...skipped,
        ...(await executeAdmissions(
          eventId,
          plan,
          reason,
          controller.current.signal,
        )),
      ]);
      setOpen(false);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      <AppButton
        tone="primary"
        disabled={busy || !entryIds.length}
        onClick={() => void prepare()}
      >
        <Icon name="approval" />
        {busy ? 'Wird geprüft…' : 'Alle zulassen'}
      </AppButton>
      {error && <AppNotice tone="error">{error}</AppNotice>}
      <ReasonDialog
        open={open}
        title="Alle zulassen?"
        reasonLabel="Begründung für die Historie"
        message={`${plan.length} Nennungen werden in den unten angegebenen Zulassungsstatus geändert. ${skipped.length} werden übersprungen. Keine anderen Nennungen werden geändert. Die Berechtigung und Bereitschaft werden vor jeder Änderung erneut geprüft.`}
        confirmLabel={`${plan.length} Nennungen zulassen`}
        cancelLabel="Abbrechen"
        closeLabel="Schließen"
        busy={busy}
        confirmDisabled={!plan.length}
        onClose={() => {
          if (!busy) setOpen(false);
        }}
        onConfirm={(reason) => void execute(reason)}
      >
        <AppSelectionList label="Genaue Statusänderungen">
          {plan.map((item) => (
            <span key={item.entryId}>
              {item.name}: → {item.label} (zugelassen)
            </span>
          ))}
          {skipped.map((item) => (
            <span key={item.entryId}>
              {item.entryId}: {item.message}
            </span>
          ))}
        </AppSelectionList>
      </ReasonDialog>
      <AppDialog
        open={results !== null}
        title="Ergebnis der Sammelzulassung"
        closeLabel="Schließen"
        onClose={() => {
          setResults(null);
          onDone();
        }}
        actions={
          <AppButton
            onClick={() => {
              setResults(null);
              onDone();
            }}
          >
            Fertig
          </AppButton>
        }
      >
        <p>
          {results?.filter((item) => item.ok).length} zugelassen ·{' '}
          {results?.filter((item) => !item.ok).length} fehlgeschlagen oder
          übersprungen
        </p>
        <AppSelectionList label="Ergebnis je Nennung">
          {results?.map((item) => (
            <span key={item.entryId}>
              {item.entryId}: {item.message}
            </span>
          ))}
        </AppSelectionList>
      </AppDialog>
    </>
  );
}
