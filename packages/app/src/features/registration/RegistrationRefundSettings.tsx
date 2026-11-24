import { useEffect, useState } from 'react';
import { AppCheckbox, Button, TextInput } from '@nennbox/ui';
import type { RegistrationFormConfig } from '@nennbox/contracts';

type Policy = NonNullable<RegistrationFormConfig['payments']['refundPolicy']>;
type Tier = Policy['tiers'][number];
type Draft = { daysBefore: string; percent: string };
const emptyPolicy: Policy = { enabled: false, tiers: [], rejectedPercent: 100 };
const MAX_TIERS = 6;
const MAX_DAYS = 730;

const whole = (value: string, max: number): number | null =>
  /^\d{1,4}$/.test(value.trim()) && Number(value) <= max ? Number(value) : null;
const draftOf = (tier: Tier): Draft => ({
  daysBefore: String(tier.daysBefore),
  percent: String(tier.percent),
});
const byDaysDescending = (a: Tier, b: Tier) => b.daysBefore - a.daysBefore;

/** Tiers read from the drafts; null while any field is empty or not a whole number in range. */
function tiersFrom(drafts: readonly Draft[]): Tier[] | null {
  const tiers = drafts.map((draft) => ({
    daysBefore: whole(draft.daysBefore, MAX_DAYS),
    percent: whole(draft.percent, 100),
  }));
  return tiers.every(
    (tier): tier is Tier => tier.daysBefore !== null && tier.percent !== null,
  )
    ? tiers
    : null;
}

/** A later tier (fewer days left) that gives back more than an earlier one is usually a slip. */
export function refundTierWarning(tiers: readonly Tier[]): string | null {
  const sorted = [...tiers].sort(byDaysDescending);
  for (let index = 1; index < sorted.length; index += 1) {
    const earlier = sorted[index - 1]!;
    const later = sorted[index]!;
    if (later.percent > earlier.percent)
      return `Die Stufe „bis ${later.daysBefore} Tage“ erstattet mit ${later.percent} % mehr als die frühere Stufe „bis ${earlier.daysBefore} Tage“ mit ${earlier.percent} %. Üblich ist, dass die Erstattung zum Termin hin sinkt. Bitte prüfe die Reihenfolge.`;
  }
  return null;
}

/** What stops the rule from being saved; null when it is complete. */
export function refundPolicyProblem(
  drafts: readonly Draft[],
  rejectedPercent: string,
): string | null {
  if (whole(rejectedPercent, 100) === null)
    return 'Bitte gib bei „Erstattung bei Ablehnung“ eine ganze Zahl von 0 bis 100 an.';
  const tiers = tiersFrom(drafts);
  if (!tiers)
    return 'Bitte fülle bei jeder Erstattungsstufe die Tage (0 bis 730) und den Prozentsatz (0 bis 100) mit ganzen Zahlen aus.';
  if (new Set(tiers.map((tier) => tier.daysBefore)).size !== tiers.length)
    return 'Jede Stufe braucht eine andere Anzahl Tage, sonst lässt sich die Regel nicht speichern.';
  return null;
}

/**
 * Refund rule for cancellations: "up to X days before the event Y %". Fields keep
 * what was typed, so an empty field stays empty (never silently 0); the host asks
 * `onProblem` before saving and shows the problem when it blocks the save.
 */
export function RegistrationRefundSettings({
  config,
  updateConfig,
  onProblem,
  showProblems = false,
}: {
  config: RegistrationFormConfig;
  updateConfig: (
    updater: (current: RegistrationFormConfig) => RegistrationFormConfig,
  ) => void;
  onProblem?: (problem: string | null) => void;
  /** Set once a save was attempted: incomplete fields are then reported inline. */
  showProblems?: boolean;
}) {
  const policy = config.payments.refundPolicy ?? emptyPolicy;
  const [drafts, setDrafts] = useState<Draft[]>(() =>
    policy.tiers.map(draftOf),
  );
  const [rejected, setRejected] = useState(String(policy.rejectedPercent));
  const problem = policy.enabled ? refundPolicyProblem(drafts, rejected) : null;
  useEffect(() => {
    onProblem?.(problem);
  }, [problem, onProblem]);
  const write = (next: Partial<Policy>) =>
    updateConfig((current) => ({
      ...current,
      payments: {
        ...current.payments,
        refundPolicy: { ...policy, ...next },
      },
    }));
  const editDraft = (index: number, patch: Partial<Draft>) => {
    const next = drafts.map((draft, at) =>
      at === index ? { ...draft, ...patch } : draft,
    );
    setDrafts(next);
    // The config only ever holds complete numbers; a half-typed field waits in the draft.
    const tiers = tiersFrom(next);
    if (tiers) write({ tiers });
  };
  const sortDrafts = () => {
    const tiers = tiersFrom(drafts);
    if (!tiers) return;
    const sorted = [...tiers].sort(byDaysDescending);
    setDrafts(sorted.map(draftOf));
    write({ tiers: sorted });
  };
  const tiers = tiersFrom(drafts);
  const warning = tiers ? refundTierWarning(tiers) : null;
  const fieldError = (value: string, max: number) =>
    showProblems && whole(value, max) === null
      ? 'Bitte eine ganze Zahl angeben.'
      : undefined;
  const duplicate =
    tiers !== null &&
    new Set(tiers.map((tier) => tier.daysBefore)).size !== tiers.length;
  return (
    <div className="registration-refund-settings">
      <AppCheckbox
        label="Online-Zahlungen bei Absage automatisch erstatten"
        checked={policy.enabled}
        onChange={(event) => write({ enabled: event.target.checked })}
      />
      {policy.enabled && (
        <>
          <p>
            Gilt, sobald alle Nennungen einer Anmeldung zurückgezogen oder
            abgelehnt sind. Überweisungen erstattest du weiterhin selbst.
          </p>
          {drafts.map((draft, index) => (
            <div className="registration-refund-tier" key={index}>
              <TextInput
                label="Bis Tage vor der Veranstaltung"
                inputMode="numeric"
                value={draft.daysBefore}
                onChange={(event) =>
                  editDraft(index, { daysBefore: event.target.value })
                }
                onBlur={sortDrafts}
                error={fieldError(draft.daysBefore, MAX_DAYS)}
              />
              <TextInput
                label="Erstattung in %"
                inputMode="numeric"
                value={draft.percent}
                onChange={(event) =>
                  editDraft(index, { percent: event.target.value })
                }
                error={fieldError(draft.percent, 100)}
              />
              <Button
                variant="text"
                onClick={() => {
                  const next = drafts.filter((_, at) => at !== index);
                  setDrafts(next);
                  const kept = tiersFrom(next);
                  if (kept) write({ tiers: kept });
                }}
              >
                Stufe entfernen
              </Button>
            </div>
          ))}
          {duplicate && (
            <p role="alert">
              Jede Stufe braucht eine andere Anzahl Tage, sonst lässt sich die
              Regel nicht speichern.
            </p>
          )}
          {warning && <p role="status">{warning}</p>}
          {drafts.length < MAX_TIERS && (
            <Button
              variant="text"
              onClick={() => {
                const next = [
                  ...drafts,
                  draftOf({ daysBefore: 14, percent: 50 }),
                ];
                const tiers = tiersFrom(next);
                const sorted = tiers
                  ? [...tiers].sort(byDaysDescending).map(draftOf)
                  : next;
                setDrafts(sorted);
                const written = tiersFrom(sorted);
                if (written) write({ tiers: written });
              }}
            >
              Stufe hinzufügen
            </Button>
          )}
          <TextInput
            label="Erstattung bei Ablehnung durch den Veranstalter in %"
            inputMode="numeric"
            value={rejected}
            onChange={(event) => {
              setRejected(event.target.value);
              const value = whole(event.target.value, 100);
              if (value !== null) write({ rejectedPercent: value });
            }}
            error={fieldError(rejected, 100)}
          />
          <p>
            Ohne passende Stufe wird bei Rücktritt nichts automatisch erstattet.
          </p>
        </>
      )}
    </div>
  );
}
