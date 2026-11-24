import { AppCheckbox, Button, TextInput } from '@nennbox/ui';
import type { RegistrationFormConfig } from '@nennbox/contracts';

type Policy = NonNullable<RegistrationFormConfig['payments']['refundPolicy']>;
const emptyPolicy: Policy = { enabled: false, tiers: [], rejectedPercent: 100 };
const MAX_TIERS = 6;

const toInt = (value: string, max: number) =>
  Math.min(max, Math.max(0, Number.parseInt(value, 10) || 0));

/** Refund rule for cancellations: "up to X days before the event Y %". */
export function RegistrationRefundSettings({
  config,
  updateConfig,
}: {
  config: RegistrationFormConfig;
  updateConfig: (
    updater: (current: RegistrationFormConfig) => RegistrationFormConfig,
  ) => void;
}) {
  const policy = config.payments.refundPolicy ?? emptyPolicy;
  const change = (next: Policy) =>
    updateConfig((current) => ({
      ...current,
      payments: { ...current.payments, refundPolicy: next },
    }));
  const duplicate =
    new Set(policy.tiers.map((tier) => tier.daysBefore)).size !==
    policy.tiers.length;
  return (
    <div className="registration-refund-settings">
      <AppCheckbox
        label="Online-Zahlungen bei Absage automatisch erstatten"
        checked={policy.enabled}
        onChange={(event) =>
          change({ ...policy, enabled: event.target.checked })
        }
      />
      {policy.enabled && (
        <>
          <p>
            Gilt, sobald alle Nennungen einer Anmeldung zurückgezogen oder
            abgelehnt sind. Überweisungen erstattest du weiterhin selbst.
          </p>
          {policy.tiers.map((tier, index) => (
            <div className="registration-refund-tier" key={index}>
              <TextInput
                label="Bis Tage vor der Veranstaltung"
                inputMode="numeric"
                value={String(tier.daysBefore)}
                onChange={(event) =>
                  change({
                    ...policy,
                    tiers: policy.tiers.map((item, at) =>
                      at === index
                        ? {
                            ...item,
                            daysBefore: toInt(event.target.value, 730),
                          }
                        : item,
                    ),
                  })
                }
              />
              <TextInput
                label="Erstattung in %"
                inputMode="numeric"
                value={String(tier.percent)}
                onChange={(event) =>
                  change({
                    ...policy,
                    tiers: policy.tiers.map((item, at) =>
                      at === index
                        ? { ...item, percent: toInt(event.target.value, 100) }
                        : item,
                    ),
                  })
                }
              />
              <Button
                variant="text"
                onClick={() =>
                  change({
                    ...policy,
                    tiers: policy.tiers.filter((_, at) => at !== index),
                  })
                }
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
          {policy.tiers.length < MAX_TIERS && (
            <Button
              variant="text"
              onClick={() =>
                change({
                  ...policy,
                  tiers: [...policy.tiers, { daysBefore: 14, percent: 50 }],
                })
              }
            >
              Stufe hinzufügen
            </Button>
          )}
          <TextInput
            label="Erstattung bei Ablehnung durch den Veranstalter in %"
            inputMode="numeric"
            value={String(policy.rejectedPercent)}
            onChange={(event) =>
              change({
                ...policy,
                rejectedPercent: toInt(event.target.value, 100),
              })
            }
          />
          <p>
            Ohne passende Stufe wird bei Rücktritt nichts automatisch erstattet.
          </p>
        </>
      )}
    </div>
  );
}
