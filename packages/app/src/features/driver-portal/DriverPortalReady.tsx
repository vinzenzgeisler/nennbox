import { useState } from 'react';
import { Banner, Button, Field, FileUpload, FormSection } from '@racepilot/ui';
import type { Entry, View } from './driverPortalTypes.js';
const labels: Record<string, string> = {
  phone: 'Telefon',
  street: 'Straße',
  postalCode: 'Postleitzahl',
  city: 'Ort',
  emergencyContactName: 'Notfallkontakt',
  emergencyContactPhone: 'Telefon Notfallkontakt',
  licenseNumber: 'Lizenznummer',
};
const statusLabels: Record<string, string> = {
  pending: 'In Prüfung',
  accepted: 'Angenommen',
  rejected: 'Abgelehnt',
  waitlisted: 'Warteliste',
  withdrawn: 'Zurückgezogen',
};
export function DriverPortalReady({
  view,
  working,
  upload,
  save,
  setWithdrawId,
  onLogout,
}: {
  view: View;
  working: boolean;
  upload: (entryId: string, typeKey: string, file: File) => Promise<void>;
  save: (entryId: string, fields: Record<string, string>) => Promise<void>;
  setWithdrawId: (id: string) => void;
  onLogout: () => void;
}) {
  const missing = view.entries.flatMap((entry) =>
    entry.documents
      .filter(
        (doc) =>
          doc.required &&
          (doc.status === 'missing' || doc.status === 'rejected'),
      )
      .map((doc) => ({ entry, doc })),
  );
  return (
    <>
      {missing.length > 0 ? (
        <Banner
          tone="warning"
          title={`Dir fehlt noch: ${missing[0]!.doc.name}`}
        >
          <span>
            Du kannst die Unterlage direkt unten bei deiner Nennung hochladen.
          </span>
          <a href={`#entry-${missing[0]!.entry.id}`}>Jetzt hochladen →</a>
        </Banner>
      ) : (
        <Banner
          tone="success"
          title="Deine Unterlagen sind auf dem aktuellen Stand"
        >
          Du siehst hier alle Änderungen zu deiner Nennung.
        </Banner>
      )}
      <div className="driver-portal-grid">
        <div className="driver-portal-main">
          {view.entries.map((entry) => (
            <section
              className="driver-portal-panel"
              id={`entry-${entry.id}`}
              key={entry.id}
              aria-labelledby={`entry-title-${entry.id}`}
            >
              <p className="driver-portal-eyebrow">NENNUNG</p>
              <div className="driver-portal-entry-heading">
                <h2 id={`entry-title-${entry.id}`}>{entry.driverName}</h2>
                <span className="driver-portal-status">
                  {statusLabels[entry.status] ?? entry.status}
                </span>
              </div>
              <p>
                {entry.className} · {entry.vehicle}
              </p>
              <p>
                <strong>Startnummer:</strong>{' '}
                {entry.startNumber ?? 'Noch nicht vergeben'}
              </p>
              <h3>Unterlagen</h3>
              {entry.documents.length ? (
                <ul className="driver-portal-docs">
                  {entry.documents.map((doc) => (
                    <li key={doc.key}>
                      <div>
                        <strong>{doc.name}</strong>
                        <span>
                          {doc.status === 'missing'
                            ? 'Fehlt noch'
                            : doc.status === 'rejected'
                              ? `Abgelehnt${doc.rejectionReason ? `: ${doc.rejectionReason}` : ''}`
                              : doc.status === 'reviewed'
                                ? 'Geprüft'
                                : 'Hochgeladen – wird geprüft'}
                        </span>
                      </div>
                      {entry.status !== 'withdrawn' && (
                        <FileUpload
                          label={
                            doc.status === 'missing' ||
                            doc.status === 'rejected'
                              ? 'Jetzt hochladen'
                              : 'Erneut hochladen'
                          }
                          accept="application/pdf,image/jpeg,image/png"
                          disabled={working}
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (file) void upload(entry.id, doc.key, file);
                            event.target.value = '';
                          }}
                        />
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>
                  Für diese Veranstaltung sind keine Unterlagen angefordert.
                </p>
              )}
              {view.editableFields.length > 0 &&
                entry.status !== 'withdrawn' && (
                  <CorrectionForm
                    entry={entry}
                    fields={view.editableFields}
                    contact={view.contact}
                    working={working}
                    onSave={save}
                  />
                )}
              {entry.status !== 'withdrawn' && (
                <Button variant="text" onClick={() => setWithdrawId(entry.id)}>
                  Nennung zurückziehen
                </Button>
              )}
            </section>
          ))}
        </div>
        <aside className="driver-portal-side">
          {view.payment && (
            <section className="driver-portal-panel">
              <p className="driver-portal-eyebrow">ZAHLUNG</p>
              <h2>
                {view.payment.status === 'paid'
                  ? 'Bezahlt'
                  : view.payment.status === 'partially_paid'
                    ? 'Teilweise bezahlt'
                    : 'Noch offen'}
              </h2>
              <p className="driver-portal-amount">
                {new Intl.NumberFormat('de-DE', {
                  style: 'currency',
                  currency: view.payment.currency,
                }).format(view.payment.totalCents / 100)}
              </p>
              <dl>
                <dt>Verwendungszweck</dt>
                <dd>{view.payment.paymentReference}</dd>
                {view.payment.accountName && (
                  <>
                    <dt>Empfänger</dt>
                    <dd>{view.payment.accountName}</dd>
                  </>
                )}
                {view.payment.iban && (
                  <>
                    <dt>IBAN</dt>
                    <dd>{view.payment.iban}</dd>
                  </>
                )}
                {view.payment.bic && (
                  <>
                    <dt>BIC</dt>
                    <dd>{view.payment.bic}</dd>
                  </>
                )}
              </dl>
            </section>
          )}
          <section className="driver-portal-panel">
            <p className="driver-portal-eyebrow">NACHRICHTEN</p>
            <h2>Vom Veranstalter</h2>
            {view.messages.length ? (
              <ul className="driver-portal-messages">
                {view.messages.map((message, index) => (
                  <li key={index}>
                    <strong>{message.subject}</strong>
                    <p>{message.body}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p>Noch keine Nachrichten.</p>
            )}
          </section>
        </aside>
      </div>
      <Button variant="text" onClick={onLogout}>
        Abmelden
      </Button>
    </>
  );
}
function CorrectionForm({
  entry,
  fields,
  contact,
  working,
  onSave,
}: {
  entry: Entry;
  fields: string[];
  contact: View['contact'];
  working: boolean;
  onSave: (entryId: string, fields: Record<string, string>) => Promise<void>;
}) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((key) => [key, contact?.[key] ?? ''])),
  );
  return (
    <FormSection
      title="Angaben korrigieren"
      description="Diese Felder hat der Veranstalter für Änderungen freigegeben."
      variant="registration"
    >
      <form
        className="driver-portal-correction"
        onSubmit={(event) => {
          event.preventDefault();
          void onSave(entry.id, values);
        }}
      >
        {fields.map((key) => (
          <Field
            key={key}
            label={labels[key] ?? key}
            value={values[key] ?? ''}
            onChange={(event) =>
              setValues({ ...values, [key]: event.target.value })
            }
          />
        ))}
        <Button type="submit" disabled={working}>
          Änderungen speichern
        </Button>
      </form>
    </FormSection>
  );
}
