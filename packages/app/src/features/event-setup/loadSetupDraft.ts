import {
  listClasses,
  listPricing,
  loadEvent,
  loadTerms,
  type SetupDraft,
} from './eventSetupApi.js';
import { loadRecipient } from './eventRecipientApi.js';

export async function loadSetupDraft(
  id: string,
  signal: AbortSignal,
): Promise<{ draft: SetupDraft; step: number }> {
  const [event, classes, pricing, consents, payment] = await Promise.all([
    loadEvent(id, signal),
    listClasses(id, signal),
    listPricing(id, signal),
    loadTerms(id, signal),
    loadRecipient(signal).catch(() => ({ recipient: null })),
  ]);

  const step =
    classes.length === 0
      ? 1
      : pricing.length < classes.length
        ? 2
        : consents.terms?.length
          ? 4
          : 3;
  const draft: SetupDraft = {
    id: event.id,
    name: event.name,
    slug: event.slug,
    startsOn: event.startsOn.slice(0, 10),
    endsOn: event.endsOn.slice(0, 10),
    classes: classes.map((item) => {
      const rule = pricing.find((price) => price.classId === item.id);
      return {
        id: item.id,
        name: item.name,
        code: item.code,
        vehicleType: item.vehicleType,
        maxParticipants: item.maxParticipants,
        closed: item.closed,
        passengerMode: item.passengerMode,
        additionalEntryAdjustmentCents:
          rule?.additionalEntryAdjustmentCents ?? 0,
        earlyBirdDeadline: rule?.earlyBirdDeadline ?? null,
        earlyBirdDiscountCents: rule?.earlyBirdDiscountCents ?? 0,
        fee: ((rule?.baseCents ?? 0) / 100).toFixed(2),
      };
    }),
    terms:
      consents.terms?.find(
        (term) => term.key === 'participation' && term.language === 'de',
      )?.text ?? '',
    consentTerms: consents.terms ?? [],
    organizerName: event.organizerName ?? '',
    organizerAddress: event.organizerAddress ?? '',
    arrivalNotes: event.arrivalNotes ?? '',
    paddockNotes: event.paddockNotes ?? '',
    accountName: payment.recipient?.accountName ?? '',
    recipientAddress: payment.recipient?.address ?? '',
    iban: payment.recipient?.iban ?? '',
    bic: payment.recipient?.bic ?? '',
  };
  return { draft, step };
}
