import { registrationFieldDefaultState } from '@nennbox/contracts';
import { formatDay } from '../../../format.js';
import { brandStyle, Flash, PreviewHero, type PreviewProps } from './Pieces.js';

type Row = { key: string; label: string; sample: string };
const driverRows: Row[] = [
  { key: 'dateOfBirth', label: 'Geburtsdatum', sample: 'TT.MM.JJJJ' },
  { key: 'phone', label: 'Telefon', sample: '+49 …' },
  { key: 'licenseNumber', label: 'Lizenznummer', sample: 'DMSB-…' },
  {
    key: 'emergencyContact',
    label: 'Notfallkontakt',
    sample: 'Name und Telefon',
  },
];
const vehicleRows: Row[] = [
  { key: 'year', label: 'Baujahr', sample: '1958' },
  { key: 'displacement', label: 'Hubraum in cm³', sample: '1600' },
  { key: 'requestedStartNumber', label: 'Wunschstartnummer', sample: '42' },
  {
    key: 'vehiclePassNumber',
    label: 'Nummer des Fahrzeugpasses',
    sample: 'FP-…',
  },
  { key: 'transponderNumber', label: 'Transpondernummer', sample: 'optional' },
];

function Field({
  label,
  sample,
  status,
}: {
  label: string;
  sample: string;
  status: string;
}) {
  return (
    <div className="nb-pv-field">
      <span className="nb-pv-label">
        {label}
        {status === 'required' && ' *'}
      </span>
      <span className="nb-pv-input">{sample}</span>
    </div>
  );
}

export function FormPreview({ proposal, logoUrl }: PreviewProps) {
  const { formConfig, event, documents, classes } = proposal;
  const state = (key: string) =>
    (formConfig.fields?.[key as 'phone']?.state ??
      registrationFieldDefaultState(key)) as 'required' | 'optional' | 'hidden';
  const rows = (list: Row[]) =>
    list
      .filter((row) => state(row.key) !== 'hidden')
      .map((row) => (
        <Flash key={row.key} value={state(row.key)}>
          <Field
            label={row.label}
            sample={row.sample}
            status={state(row.key)}
          />
        </Flash>
      ));
  return (
    <div className="nb-pv" style={brandStyle(proposal)} aria-hidden="true">
      <PreviewHero proposal={proposal} logoUrl={logoUrl} />
      <ol className="nb-pv-stepbar">
        <li className="is-current">
          <i />
          <span>01 Fahrer</span>
        </li>
        <li>
          <i />
          <span>02 Startmeldung</span>
        </li>
        <li>
          <i />
          <span>03 Prüfen</span>
        </li>
      </ol>
      <section className="nb-pv-card">
        <h3>Fahrer</h3>
        <div className="nb-pv-fields">
          <Field label="Vorname" sample="Tom" status="required" />
          <Field label="Nachname" sample="Probe" status="required" />
          <Field label="E-Mail" sample="tom@example.org" status="required" />
          {rows(driverRows)}
        </div>
      </section>
      <section className="nb-pv-card">
        <h3>Startmeldung</h3>
        <div className="nb-pv-fields">
          <Field
            label="Klasse"
            sample={classes[0]?.name || 'Klasse wählen'}
            status="required"
          />
          <Field
            label="Marke und Modell"
            sample="Honda RS 250"
            status="required"
          />
          {rows(vehicleRows)}
        </div>
        {formConfig.features?.passenger && (
          <Flash value="passenger">
            <p className="nb-pv-extra">Beifahrer hinzufügen</p>
          </Flash>
        )}
        {formConfig.features?.multipleEntries && (
          <Flash value="multiple">
            <p className="nb-pv-extra">Weitere Startmeldung hinzufügen</p>
          </Flash>
        )}
      </section>
      <section className="nb-pv-card">
        <h3>Unterlagen</h3>
        <ul className="nb-pv-list">
          {documents.map((item) => (
            <li key={item.key}>
              <Flash value={`${item.key}${item.required}`}>{item.name}</Flash>
              <span>{item.required ? 'Pflicht' : 'freiwillig'}</span>
            </li>
          ))}
        </ul>
        <p className="nb-pv-note">
          Nennschluss: {formatDay(event.entryDeadline)}
        </p>
      </section>
    </div>
  );
}
