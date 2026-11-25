import {
  AppButton,
  Checkbox,
  RegistrationField,
  SelectField,
  registrationThemes,
} from '@nennbox/ui';
import {
  createDraft,
  createEntry,
  emptyVehicle,
  type Draft,
  type PreviewConfig,
  type Step,
} from './model.js';
import { sideSurfaceOptions, type Surface } from './surfaces.js';
import { type Locale } from './text.js';

export type ControlsProps = {
  locale: Locale;
  draft: Draft;
  onDraft: (draft: Draft) => void;
  config: PreviewConfig;
  onConfig: (config: PreviewConfig) => void;
  theme: string;
  onTheme: (theme: string) => void;
  accent: string;
  onAccent: (accent: string) => void;
  logo: boolean;
  onLogo: (logo: boolean) => void;
  go: (step: Step) => void;
  surface: Surface | null;
  onSurface: (surface: Surface | null) => void;
};
export function PrototypeControls(p: ControlsProps) {
  const t = (de: string, en: string) => (p.locale === 'de' ? de : en);
  const scenario = (kind: string) => {
    const d = createDraft();
    if (kind === 'minor') d.person.birthDate = '2011-03-14';
    if (kind === 'young') d.person.birthDate = '2020-03-14';
    if (kind === 'waitlist') {
      d.entries[0]!.classId = 'racing';
      d.entries[0]!.waitlist = true;
    }
    if (kind === 'two')
      d.entries.push({
        ...createEntry('entry-2'),
        classId: 'motorcycle',
        vehicle: {
          ...emptyVehicle,
          manufacturer: 'Honda',
          model: 'RS 250',
          year: '1988',
          displacement: '249',
          vehiclePass: 'FIVA 124',
        },
      });
    if (kind === 'spare')
      d.entries[0]!.replacement = {
        ...emptyVehicle,
        manufacturer: 'Porsche',
        model: '911 Carrera',
        year: '1984',
        plate: 'Z-MS 912H',
      };
    if (kind === 'uploads') {
      d.uploads = {
        license: {
          name: 'lizenz-2027.jpg',
          size: 1400000,
          type: 'image/jpeg',
          status: 'ready',
        },
        registration: {
          name: 'IMG_4471.jpg',
          size: 2800000,
          type: 'image/jpeg',
          status: 'uploading',
        },
        other: {
          name: 'nachweis.heic',
          size: 1800000,
          type: 'image/heic',
          status: 'error',
        },
      };
    }
    if (kind === 'large')
      d.uploads.other = {
        name: 'scan-hochaufloesung.tif',
        size: 48000000,
        type: 'image/tiff',
        status: 'error',
      };
    if (kind === 'review') {
      d.entries[0]!.passenger = {
        firstName: 'Lena',
        lastName: 'Muster',
        email: 'lena.muster@beispiel.de',
        pending: false,
      };
      d.answers.electricity = '230 V';
      for (const id of ['license', 'vehiclePass'])
        d.uploads[id] = {
          name: `${id}.jpg`,
          size: 1400000,
          type: 'image/jpeg',
          status: 'ready',
        };
    }
    p.onDraft(d);
    p.onSurface(null);
    p.go(
      ['minor', 'young', 'normal'].includes(kind)
        ? 'person'
        : ['uploads', 'large'].includes(kind)
          ? 'documents'
          : kind === 'review'
            ? 'review'
            : 'vehicle',
    );
  };
  return (
    <details className="nb-preview-tools">
      <summary>
        {t(
          'Prototyp-Werkzeuge · nur lokal, kein Versand oder Geldfluss',
          'Prototype tools · local only, no messages or payments',
        )}
      </summary>
      <div className="nb-preview-tool-grid">
        <SelectField
          label={t('Beispielthema', 'Example theme')}
          value={p.theme}
          onChange={(e) => p.onTheme(e.target.value)}
        >
          {registrationThemes.map((theme) => (
            <option key={theme.id} value={theme.id}>
              {theme.name}
            </option>
          ))}
        </SelectField>
        <RegistrationField
          label={t('Akzentton (#RRGGBB)', 'Accent (#RRGGBB)')}
          value={p.accent}
          onChange={(e) => p.onAccent(e.target.value)}
        />
        <Checkbox
          label={t(
            'Beispiellogo statt Initialen',
            'Example logo instead of initials',
          )}
          checked={p.logo}
          onChange={(e) => p.onLogo(e.target.checked)}
        />
        {(['questions', 'uploads', 'instantPayment'] as const).map((key, i) => (
          <Checkbox
            key={key}
            checked={p.config[key]}
            label={
              [
                t('Vereinsfragen', 'Club questions'),
                t('Nachweise', 'Documents'),
                t('Sofortzahlung', 'Immediate payment'),
              ][i]!
            }
            onChange={(e) =>
              p.onConfig({ ...p.config, [key]: e.target.checked })
            }
          />
        ))}
        <SelectField
          label={t('Nebenfläche', 'Side surface')}
          value={p.surface ?? ''}
          onChange={(e) => p.onSurface((e.target.value as Surface) || null)}
        >
          <option value="">{t('Formular', 'Form')}</option>
          {sideSurfaceOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label[p.locale]}
            </option>
          ))}
        </SelectField>
      </div>
      <div className="nb-preview-scenarios">
        {[
          ['normal', 'Erwachsen', 'Adult'],
          ['minor', 'Minderjährig', 'Minor'],
          ['young', 'Unter Mindestalter', 'Under minimum age'],
          ['waitlist', 'Ausgebucht', 'Full class'],
          ['two', 'Zwei Startmeldungen', 'Two entries'],
          ['spare', 'Ersatzfahrzeug', 'Spare vehicle'],
          ['uploads', 'Upload-Zustände', 'Upload states'],
          ['large', 'Datei zu groß', 'File too large'],
          ['review', 'Prüfen', 'Review'],
        ].map(([kind, de, en]) => (
          <AppButton key={kind} onClick={() => scenario(kind!)}>
            {t(de!, en!)}
          </AppButton>
        ))}
      </div>
    </details>
  );
}
