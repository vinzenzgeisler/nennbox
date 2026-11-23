import { RegistrationConfirmation } from './RegistrationConfirmation.js';
import type { RegistrationDraft } from '@nennbox/contracts';
import { useState } from 'react';
import { Button } from '@nennbox/ui';
import { useRegistrationState } from './useRegistrationState.js';
import { deriveRegistration } from './RegistrationModel.js';
import { createRegistrationActions } from './RegistrationActions.js';
import { RegistrationView } from './RegistrationView.js';
import {
  RegistrationHeader,
  registrationBrandStyle,
} from './RegistrationChrome.js';
export { estimateRegistrationTotal } from './RegistrationDomain.js';

function PaymentReturn({
  organizationId,
  eventSlug,
  payload,
  locale,
}: {
  organizationId: string;
  eventSlug: string;
  payload: NonNullable<ReturnType<typeof useRegistrationState>['payload']>;
  locale: 'de' | 'en';
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const params = new URLSearchParams(window.location.search);
  const status = params.get('payment');
  const invoiceId = params.get('invoice');
  if (status !== 'success' && status !== 'cancelled') return null;
  const de = locale === 'de';
  async function retry() {
    if (!invoiceId) return;
    setLoading(true);
    setError(false);
    try {
      const response = await fetch(
        `/public/organizations/${encodeURIComponent(organizationId)}/invoices/${encodeURIComponent(invoiceId)}/checkout`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            paymentMethods:
              payload.registrationFormConfig.payments.onlineMethods,
          }),
        },
      );
      const result = (await response.json().catch(() => null)) as {
        url?: string;
      } | null;
      if (!response.ok || !result?.url) throw new Error('Checkout unavailable');
      window.location.assign(result.url);
    } catch {
      setError(true);
      setLoading(false);
    }
  }
  return (
    <section
      className="registration-payment-return"
      aria-labelledby="payment-return-title"
    >
      <h2 id="payment-return-title">
        {status === 'success'
          ? de
            ? 'Zahlung erfolgreich'
            : 'Payment successful'
          : de
            ? 'Zahlung abgebrochen'
            : 'Payment cancelled'}
      </h2>
      <p role="status">
        {status === 'success'
          ? de
            ? 'Deine Zahlung wurde an Stripe übermittelt. Die Bestätigung folgt, sobald die Zahlung verbucht ist.'
            : 'Your payment was sent to Stripe. Confirmation follows once the payment is recorded.'
          : de
            ? 'Es wurde nichts abgebucht. Du kannst den Zahlungsvorgang erneut starten.'
            : 'You were not charged. You can try the payment again.'}
      </p>
      {status === 'cancelled' && (
        <Button
          type="button"
          disabled={loading || !invoiceId}
          onClick={() => void retry()}
        >
          {loading
            ? de
              ? 'Wird geöffnet …'
              : 'Opening …'
            : de
              ? 'Erneut bezahlen'
              : 'Try payment again'}
        </Button>
      )}
      {error && (
        <p role="alert">
          {de
            ? 'Checkout konnte nicht geöffnet werden. Bitte später erneut versuchen.'
            : 'Checkout could not be opened. Please try again later.'}
        </p>
      )}
      <a href={`/events/${encodeURIComponent(eventSlug)}/register`}>
        {de ? 'Zur Veranstaltung' : 'Back to event'}
      </a>
    </section>
  );
}
export function Registration({
  organizationId,
  eventSlug,
  defaultLocale,
  initialDraft,
}: {
  organizationId: string;
  eventSlug: string;
  defaultLocale: string;
  initialDraft?: RegistrationDraft;
}) {
  const state = useRegistrationState({
    organizationId,
    eventSlug,
    defaultLocale,
    ...(initialDraft ? { initialDraft } : {}),
  });
  const { payload, loadError, t, submitted, locale } = state;
  if (!payload && !loadError)
    return (
      <section aria-busy="true">
        <p role="status">{t.loading}</p>
      </section>
    );
  if (loadError || !payload)
    return (
      <section>
        <h2>{t.loadError}</h2>
        <p role="alert">{t.loadError}</p>
      </section>
    );
  const model = { ...state, ...deriveRegistration(state, payload), payload };
  const paymentReturn = new URLSearchParams(window.location.search).get(
    'payment',
  );
  if (paymentReturn === 'success' || paymentReturn === 'cancelled')
    return (
      <section className="registration" style={registrationBrandStyle(model)}>
        <RegistrationHeader
          model={model}
          organizationId={organizationId}
          eventSlug={eventSlug}
        />
        <main className="registration-container">
          <PaymentReturn
            organizationId={organizationId}
            eventSlug={eventSlug}
            payload={payload}
            locale={locale}
          />
        </main>
      </section>
    );
  const actions = createRegistrationActions(model, organizationId, eventSlug);
  if (submitted)
    return (
      <RegistrationConfirmation
        model={model}
        actions={actions}
        eventSlug={eventSlug}
      />
    );

  if (!payload.consents.some((item) => item.language === locale))
    return (
      <section>
        <h2>{payload.event.name}</h2>
        <p role="alert">{t.consentUnavailable}</p>
      </section>
    );

  return (
    <RegistrationView
      model={model}
      actions={actions}
      organizationId={organizationId}
      eventSlug={eventSlug}
    />
  );
}
