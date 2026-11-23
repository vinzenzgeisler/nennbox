import { AppButton, AppSection, AppValueRow } from '@nennbox/ui';
import type { RegistrationFormConfigPatch } from '@nennbox/contracts';

const areas = [
  ['branding', 'Erscheinungsbild'],
  ['welcomeText', 'Begrüßung'],
  ['organizerNotice', 'Hinweise des Veranstalters'],
  ['fields', 'Formularfelder'],
  ['payments', 'Zahlungsarten'],
  ['customFields', 'Eigene Felder'],
  ['features', 'Veranstaltungsoptionen'],
] as const;

export function RegistrationInheritance({
  overrides,
  reset,
  busy,
  embedded,
}: {
  overrides: RegistrationFormConfigPatch;
  reset: (key: keyof RegistrationFormConfigPatch) => void;
  busy: boolean;
  embedded: boolean;
}) {
  return (
    <AppSection
      title="Vererbung von der Organisation"
      description="Nur hier geänderte Bereiche überschreiben die Organisation. Bestehende vollständige Kopien bleiben bis zur bewussten Übernahme erhalten."
    >
      {areas
        .filter(([key]) => !embedded || key === 'fields' || key === 'payments')
        .map(([key, label]) => (
          <AppValueRow key={key} label={label}>
            <span>
              {overrides[key] === undefined
                ? 'Von Organisation übernommen'
                : 'Veranstaltung überschreibt Organisation'}
            </span>
            <AppButton
              type="button"
              disabled={busy || overrides[key] === undefined}
              aria-label={`${label}: Von Organisation übernehmen`}
              onClick={() => reset(key)}
            >
              Von Organisation übernehmen
            </AppButton>
          </AppValueRow>
        ))}
    </AppSection>
  );
}
