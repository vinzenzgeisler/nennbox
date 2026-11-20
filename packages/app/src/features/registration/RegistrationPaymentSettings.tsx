import { Checkbox } from '@nennbox/ui';
import type { RegistrationFormConfig } from '@nennbox/contracts';

const methods = [
  ['card', 'Karte'],
  ['sepa_debit', 'SEPA-Lastschrift'],
  ['paypal', 'PayPal'],
  ['klarna', 'Klarna'],
] as const;

export function RegistrationPaymentSettings({
  config,
  updateConfig,
}: {
  config: RegistrationFormConfig;
  updateConfig: (
    updater: (current: RegistrationFormConfig) => RegistrationFormConfig,
  ) => void;
}) {
  const toggleMethod = (
    method: (typeof methods)[number][0],
    enabled: boolean,
  ) =>
    updateConfig((current) => ({
      ...current,
      payments: {
        ...current.payments,
        onlineMethods: enabled
          ? [...current.payments.onlineMethods, method]
          : current.payments.onlineMethods.filter((item) => item !== method),
      },
    }));
  return (
    <fieldset className="registration-payment-config">
      <legend>Zahlungsarten für diese Veranstaltung</legend>
      <p>
        Überweisung bleibt zusätzlich verfügbar, wenn eine Bankverbindung
        hinterlegt ist.
      </p>
      {methods.map(([method, label]) => (
        <Checkbox
          key={method}
          label={label}
          checked={config.payments.onlineMethods.includes(method)}
          onChange={(event) => toggleMethod(method, event.target.checked)}
        />
      ))}
      <Checkbox
        label="Überweisung anbieten"
        checked={config.payments.bankTransfer}
        onChange={(event) =>
          updateConfig((current) => ({
            ...current,
            payments: {
              ...current.payments,
              bankTransfer: event.target.checked,
            },
          }))
        }
      />
    </fieldset>
  );
}
