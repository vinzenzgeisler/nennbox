import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AdminPassengerLinkResponse,
  EntryResponse,
  type AdminPassengerCreateRequest,
  type AdminPassengerLinkRequest,
  type EntryDriverUpdateRequest,
  type EntryVehicleUpdateRequest,
} from '@nennbox/contracts';
import type { EntryResponse as Entry } from '@nennbox/contracts';
import { request, type Outcome } from '../AdminEntriesModel.js';
import { refundConflictText } from './refundConflictText.js';

const failure = (
  status: number,
  action: string,
  code?: string,
  reason?: string,
) =>
  (status === 409 ? refundConflictText(code, reason) : undefined) ??
  (status === 401
    ? 'Deine Anmeldung ist abgelaufen. Bitte melde dich erneut an.'
    : status === 403
      ? `Du darfst ${action} nicht.`
      : status === 404
        ? 'Die Nennung wurde nicht gefunden.'
        : status === 503 && code === 'Refund unavailable'
          ? 'Die Erstattung konnte nicht abgeschlossen werden. Versuche es mit derselben Eingabe erneut; eine schon ausgelöste Erstattung wird dabei nicht doppelt ausgeführt.'
          : status === 503 && code === 'Unavailable'
            ? 'Die Online-Zahlung ist auf diesem Server nicht eingerichtet.'
            : status === 409 && code === 'Refund could not be recorded'
              ? 'Die Erstattung wurde bei Stripe ausgelöst, aber nicht im Zahlungsprotokoll verbucht. Bitte versuche es erneut.'
              : status === 409
                ? code === 'Passenger exists'
                  ? 'Für diese Nennung ist bereits ein Beifahrer eingetragen. Bitte lade die Detailansicht neu.'
                  : code === 'Passenger completed'
                    ? 'Der Beifahrer hat seine Daten bereits abgeschlossen.'
                    : code === 'stale'
                      ? 'Die Nennung wurde inzwischen geändert. Bitte lade die Detailansicht neu.'
                      : code === 'document_not_uploaded'
                        ? 'Dieses Dokument wurde inzwischen entschieden. Bitte lade die Detailansicht neu.'
                        : code === 'capacity'
                          ? 'Die Zielklasse ist inzwischen voll.'
                          : code === 'class'
                            ? 'Die Zielklasse ist geschlossen oder gehört nicht zu dieser Veranstaltung.'
                            : 'Name, Geburtsdatum und Land gehören zur Person und gelten auch für ihre Nennungen in anderen Veranstaltungen. Sie lassen sich hier nicht ändern.'
                : status === 422
                  ? code === 'no_passenger'
                    ? 'Bitte gib Vor- und Nachname des Beifahrers an.'
                    : code === 'unavailable' || code === 'Passenger unavailable'
                      ? 'Für diese Nennung ist kein Beifahrer vorgesehen.'
                      : code === 'reason'
                        ? 'Bitte gib eine Begründung ein.'
                        : code === 'amount'
                          ? 'Bitte gib einen gültigen Betrag ein.'
                          : code === 'note'
                            ? 'Bitte gib einen Notiztext ein.'
                            : 'Die Eingaben wurden vom Server abgelehnt. Bitte prüfe sie.'
                  : status === 400
                    ? 'Die Eingaben wurden vom Server abgelehnt. Bitte prüfe sie.'
                    : 'Der Server konnte die Anfrage nicht ausführen.');

export type { Outcome };

/** An outcome that also hands back what the server answered with. */
type BodyOutcome = Outcome & { body?: unknown };

export type EntryAdminAction =
  | {
      kind: 'change_class';
      classId: string;
      reason: string;
      expectedVersion: number;
    }
  | {
      kind: 'adjust_amount';
      amountCents: number;
      reason: string;
      expectedVersion: number;
    }
  | { kind: 'note'; visibility: 'internal' | 'driver'; text: string }
  | { kind: 'delete'; reason: string; expectedVersion: number };

/**
 * Admin calls of the entry detail; every successful change hands the fresh entry back.
 * Requests belong to the entry shown when they started: leaving or switching the entry aborts
 * them, and a response that arrives late is dropped instead of selecting the old entry again.
 */
export function useEntryDetailApi(
  entry: Entry,
  onUpdated: (entry: Entry | null, refresh?: boolean) => void,
  onSaved?: () => void,
) {
  const [busy, setBusy] = useState(false);
  const entryId = entry.id;
  const entryPath = `/admin/entries/${encodeURIComponent(entryId)}`;
  const scope = useRef<AbortController | null>(null);
  const onUpdatedRef = useRef(onUpdated);
  useEffect(() => {
    onUpdatedRef.current = onUpdated;
  }, [onUpdated]);
  useEffect(() => {
    const controller = new AbortController();
    scope.current = controller;
    if (!entry.availableActions) {
      void request(entryPath, { signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) return;
          const fresh = EntryResponse.safeParse(
            await response.json().catch(() => null),
          );
          if (
            !controller.signal.aborted &&
            fresh.success &&
            fresh.data.id === entryId
          )
            onUpdatedRef.current(fresh.data, false);
        })
        .catch(() => undefined);
    }
    return () => {
      controller.abort();
      if (scope.current === controller) scope.current = null;
    };
  }, [entryId, entry.revision, entry.availableActions, entryPath]);
  const run = useCallback(
    async (
      path: string,
      init: RequestInit,
      action: string,
      readEntry: boolean | 'none',
    ): Promise<BodyOutcome> => {
      const controller = scope.current;
      const superseded: BodyOutcome = { ok: false, message: '' };
      if (!controller || controller.signal.aborted) return superseded;
      const { signal } = controller;
      setBusy(true);
      try {
        const response = await request(path, { ...init, signal });
        if (signal.aborted) return superseded;
        const body: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          const code =
            typeof body === 'object' &&
            body !== null &&
            'error' in body &&
            typeof body.error === 'string'
              ? body.error
              : undefined;
          const reason =
            typeof body === 'object' &&
            body !== null &&
            'reason' in body &&
            typeof body.reason === 'string'
              ? body.reason
              : undefined;
          return {
            ok: false,
            message: failure(response.status, action, code, reason),
          };
        }
        if (readEntry === 'none') return { ok: true, body };
        const fresh = EntryResponse.safeParse(
          readEntry
            ? body
            : await (
                await request(entryPath, { signal })
              )
                .json()
                .catch(() => null),
        );
        if (signal.aborted) return superseded;
        if (!fresh.success || fresh.data.id !== entryId)
          return { ok: false, message: 'Die Antwort war unvollständig.' };
        onUpdated(fresh.data);
        onSaved?.();
        return { ok: true, body };
      } catch {
        return signal.aborted
          ? superseded
          : { ok: false, message: 'Keine Verbindung zum Server.' };
      } finally {
        if (!signal.aborted) setBusy(false);
      }
    },
    [entryId, entryPath, onUpdated, onSaved],
  );
  return {
    busy,
    performAdminAction: (action: EntryAdminAction) =>
      run(
        `${entryPath}/actions`,
        { method: 'POST', body: JSON.stringify(action) },
        'diese Nennung ändern',
        action.kind === 'delete' ? 'none' : false,
      ),
    saveDriver: (patch: EntryDriverUpdateRequest) =>
      run(
        `${entryPath}/driver`,
        { method: 'PATCH', body: JSON.stringify(patch) },
        'Fahrerdaten ändern',
        true,
      ),
    saveVehicle: (patch: EntryVehicleUpdateRequest) =>
      run(
        `${entryPath}/vehicle`,
        { method: 'PATCH', body: JSON.stringify(patch) },
        'Fahrzeugdaten ändern',
        true,
      ),
    addPassenger: (input: AdminPassengerCreateRequest) =>
      run(
        `${entryPath}/passenger`,
        { method: 'POST', body: JSON.stringify(input) },
        'einen Beifahrer eintragen',
        false,
      ),
    /** The created link is shown once; only its hash is stored. */
    createPassengerLink: async (
      input: AdminPassengerLinkRequest,
    ): Promise<
      | { ok: true; link: AdminPassengerLinkResponse }
      | { ok: false; message: string }
    > => {
      const result = await run(
        `${entryPath}/passenger/link`,
        { method: 'POST', body: JSON.stringify(input) },
        'einen persönlichen Link erstellen',
        false,
      );
      if (!result.ok) return result;
      const link = AdminPassengerLinkResponse.safeParse(result.body);
      return link.success
        ? { ok: true, link: link.data }
        : { ok: false, message: 'Die Antwort war unvollständig.' };
    },
    refundPayment: (
      invoiceId: string,
      providerPaymentId: string,
      amountCents: number,
      reason: string,
      idempotencyKey: string,
    ) =>
      run(
        `/admin/invoices/${encodeURIComponent(invoiceId)}/refunds`,
        {
          method: 'POST',
          body: JSON.stringify({
            providerPaymentId,
            amountCents,
            reason,
            idempotencyKey,
          }),
        },
        'Erstattungen auslösen',
        false,
      ),
    reconcileRefund: (invoiceId: string, key: string, reason: string) =>
      run(
        `/admin/invoices/${encodeURIComponent(invoiceId)}/refund-reservations/${encodeURIComponent(key)}/reconcile`,
        { method: 'POST', body: JSON.stringify({ reason }) },
        'Erstattung klären',
        false,
      ),
    abandonRefund: (invoiceId: string, key: string, reason: string) =>
      run(
        `/admin/invoices/${encodeURIComponent(invoiceId)}/refund-reservations/${encodeURIComponent(key)}/abandon`,
        { method: 'POST', body: JSON.stringify({ reason }) },
        'Erstattungen abbrechen',
        false,
      ),
    recordPayment: (invoiceId: string, amountCents: number, reason: string) =>
      run(
        `/admin/invoices/${encodeURIComponent(invoiceId)}/payments`,
        { method: 'POST', body: JSON.stringify({ amountCents, reason }) },
        'Zahlungen erfassen',
        false,
      ),
    reviewDocument: (documentId: string) =>
      run(
        `${entryPath}/documents/${encodeURIComponent(documentId)}/reviewed`,
        { method: 'POST', body: JSON.stringify({ reason: '' }) },
        'Dokumente prüfen',
        false,
      ),
    rejectDocument: (documentId: string, reason: string) =>
      run(
        `${entryPath}/documents/${encodeURIComponent(documentId)}/rejected`,
        { method: 'POST', body: JSON.stringify({ reason }) },
        'Dokumente prüfen',
        false,
      ),
    transitionDimension: (
      dimension: 'technical_inspection' | 'waiver',
      status: string,
      reason: string,
    ) =>
      run(
        `${entryPath}/status-dimensions/${dimension}/transitions`,
        { method: 'POST', body: JSON.stringify({ status, reason }) },
        'diesen Status ändern',
        false,
      ),
  };
}
