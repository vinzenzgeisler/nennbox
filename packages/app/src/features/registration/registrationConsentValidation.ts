import type { FormPayload } from './RegistrationDomain.js';

export function hasMissingRequiredConsent(
  consents: FormPayload['consents'],
  accepted: Record<string, boolean>,
  locale: 'de' | 'en',
) {
  return consents
    .filter((item) => item.language === locale && item.required !== false)
    .some(
      (item) =>
        accepted[`${item.key}:${item.version}:${item.language}`] !== true,
    );
}
