import { prototypeStyle } from './prototypeStyle.js';
import { LanguageSwitch, PrototypeActions } from './PrototypeActions.js';
import {
  AccentHint,
  PrototypeBrand,
  PrototypeFooter,
  PrototypeBanner,
  themeClubs,
} from './PrototypeBrand.js';
import { RegistrationSummary } from './RegistrationSummary.js';
import { useRef, useState } from 'react';
import {
  RegistrationButton,
  RegistrationShell,
  RegistrationNotice,
  deriveRegistrationPalette,
  registrationAccentNotice,
  registrationClubs,
  registrationThemes,
} from '@nennbox/ui';
import {
  defaultConfig,
  stepsFor,
  stepForPath,
  validateStep,
  isWaitlisted,
  totalPrice,
  type Step,
  type Draft,
  type ValidationErrors,
} from './model.js';
import { PersonFields, type FormProps } from './PersonFields.js';
import { VehicleFields } from './VehicleFields.js';
import { PassengerFields, DocumentFields } from './AdditionalFields.js';
import { Review, Payment } from './Review.js';
import { SideSurfaces } from './SideSurfaces.js';
import { type Surface } from './surfaces.js';
import { PrototypeControls } from './PrototypeControls.js';
import { useDraft } from './useDraft.js';
import { money, words, stepTitles, type Locale } from './text.js';
import '@nennbox/ui/registration-preview.css';

export default function RegistrationPreview() {
  const [locale, setLocale] = useState<Locale>('de');
  const [config, setConfig] = useState(defaultConfig);
  const { draft, setDraft, savedAt, storageFailed } = useDraft();
  const [requestedStep, setStep] = useState<Step>('person');
  const [completed, setCompleted] = useState<Step[]>([]);
  const [surface, setSurface] = useState<Surface | null>(null);
  const [themeId, setTheme] = useState('standard');
  const [clubId, setClubId] = useState('msc');
  const [accent, setAccent] = useState('#1F4E79');
  const [logo, setLogo] = useState(false);
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [submitted, setSubmitted] = useState(false);
  const summary = useRef<HTMLDivElement>(null);
  const steps = stepsFor(draft, config);
  const step = steps.includes(requestedStep) ? requestedStep : steps[0]!;
  const index = steps.indexOf(step);
  const w = words(locale),
    t = (de: string, en: string) => (locale === 'de' ? de : en);
  const titles = stepTitles(locale);
  const theme = registrationThemes.find((theme) => theme.id === themeId)!;
  const palette = deriveRegistrationPalette(
    /^#[0-9a-f]{6}$/i.test(accent) ? accent : theme.accent,
  );
  const style = prototypeStyle(theme, palette);
  const club = registrationClubs.find((item) => item.id === clubId)!;
  const accentNotice = registrationAccentNotice(palette);
  const go = (next: Step) => {
    setStep(next);
    setSubmitted(false);
    setErrors({});
  };
  const update = (next: Draft) => {
    setDraft(next);
    // Existing errors disappear only once corrected; untouched fields stay quiet.
    setErrors((previous) => {
      const current = validateStep(step, next, locale, config);
      return Object.fromEntries(
        Object.keys(previous)
          .filter((key) => current[key])
          .map((key) => [key, current[key]!]),
      );
    });
  };
  const onBlur = (path: string) => {
    const current = validateStep(step, draft, locale, config);
    setErrors((previous) => {
      const next = { ...previous };
      if (current[path]) next[path] = current[path];
      else delete next[path];
      return next;
    });
  };
  const focusError = (validation: ValidationErrors) => {
    const path = Object.keys(validation)[0];
    if (!path) return;
    setStep(stepForPath(path) ?? step);
    requestAnimationFrame(() => {
      const target = document.getElementById(path);
      target?.focus();
      target?.scrollIntoView?.({ block: 'center' });
    });
  };
  const advance = () => {
    const validation = validateStep(step, draft, locale, config);
    setErrors(validation);
    setSubmitted(true);
    if (Object.keys(validation).length) {
      requestAnimationFrame(() => summary.current?.focus());
      return;
    }
    setCompleted((previous) => [...new Set([...previous, step])]);
    if (index < steps.length - 1) go(steps[index + 1]!);
    else
      setSurface(
        step === 'payment'
          ? draft.paymentMethod === 'online'
            ? 'payment-success'
            : 'admitted'
          : draft.entries.some(isWaitlisted)
            ? 'waitlist'
            : 'confirmation',
      );
  };
  const props: FormProps = { draft, locale, errors, onDraft: update, onBlur };
  const costHint = config.instantPayment
    ? t(
        'Sofortzahlung · Warteliste erst beim Nachrücken.',
        'Immediate payment · waiting list only when admitted.',
      )
    : t(
        'Fällig erst, wenn der Verein deine Nennung zulässt.',
        'Due only once the organiser admits your entry.',
      );
  return (
    <RegistrationShell
      className={`nb-preview nb-preview-${theme.header === 'grossesLogo' ? 'grosses-logo' : theme.header}`}
      style={style}
      brand={<PrototypeBrand logo={logo} club={club} />}
      banner={<PrototypeBanner header={theme.header} locale={locale} />}
      title={t('Nennformular', 'Registration')}
      headerEnd={<LanguageSwitch locale={locale} onLocale={setLocale} />}
      steps={
        surface
          ? []
          : steps.map((id) => ({
              id,
              label: titles[id],
              completed: completed.includes(id),
            }))
      }
      currentStep={step}
      onStepChange={(id) => go(id as Step)}
      stepLabel={`${t('Schritt', 'Step')} ${index + 1} ${t('von', 'of')} ${steps.length} · ${titles[step]}`}
      stepsLabel={t('Schritte', 'Steps')}
      sidebarNote={t(
        'Du brauchst kein Konto. Deine Angaben bleiben auf diesem Gerät gespeichert, auch wenn du das Fenster schließt.',
        'You do not need an account. Your details remain saved on this device when you close the window.',
      )}
      summaryTitle={t('Deine Nennung', 'Your registration')}
      summaryCount={`${draft.entries.length} ${t('Startmeldungen', 'entries')}`}
      summary={
        surface ? undefined : (
          <RegistrationSummary
            draft={draft}
            locale={locale}
            costHint={costHint}
            savedAt={savedAt}
            storageFailed={storageFailed}
          />
        )
      }
      actions={
        surface ? undefined : (
          <PrototypeActions
            locale={locale}
            step={step}
            first={index === 0}
            submitStep={step === 'review' && !config.instantPayment}
            onBack={() => go(steps[index - 1]!)}
            onNext={advance}
          />
        )
      }
      surface={Boolean(surface)}
      footer={
        <PrototypeFooter
          locale={locale}
          club={club}
          sponsors={theme.sponsors}
        />
      }
    >
      <PrototypeControls
        locale={locale}
        draft={draft}
        onDraft={update}
        config={config}
        onConfig={setConfig}
        theme={themeId}
        onTheme={(id) => {
          setTheme(id);
          setAccent(
            registrationThemes.find((theme) => theme.id === id)!.accent,
          );
          setClubId(themeClubs[id] ?? 'msc');
        }}
        club={clubId}
        onClub={(id) => {
          setClubId(id);
          setAccent(registrationClubs.find((item) => item.id === id)!.accent);
        }}
        accent={accent}
        onAccent={setAccent}
        logo={logo}
        onLogo={setLogo}
        go={go}
        surface={surface}
        onSurface={setSurface}
      />
      <AccentHint notice={accentNotice} locale={locale} />
      {surface ? (
        <SideSurfaces
          surface={surface}
          locale={locale}
          email={draft.person.email}
          amount={money(totalPrice(draft), locale)}
          onSurface={setSurface}
          onResume={() => {
            setSurface(null);
            go('person');
          }}
          waitlist={draft.entries.some(isWaitlisted)}
        />
      ) : (
        <>
          <div className="nb-reg-head">
            <p className="nb-preview-position">
              {t('Schritt', 'Step')} {index + 1} {t('von', 'of')} {steps.length}
            </p>
            <h1>{titles[step]}</h1>
          </div>
          {step === 'person' && <PersonFields {...props} />}
          {step === 'vehicle' && <VehicleFields {...props} />}
          {step === 'passenger' && <PassengerFields {...props} />}
          {step === 'documents' && (
            <DocumentFields
              {...props}
              questions={config.questions}
              uploads={config.uploads}
            />
          )}
          {step === 'review' && <Review {...props} go={go} config={config} />}
          {step === 'payment' && <Payment {...props} config={config} />}
          {submitted && Object.keys(errors).length > 0 && (
            <div ref={summary} tabIndex={-1} role="alert">
              <RegistrationNotice tone="error" title={w.retry}>
                <p>
                  {Object.keys(errors).length}{' '}
                  {t(
                    'Angaben fehlen oder brauchen eine Korrektur.',
                    'details need attention.',
                  )}
                </p>
                <RegistrationButton
                  tone="ghost"
                  onClick={() => focusError(errors)}
                >
                  {t(
                    'Zum ersten fehlenden Feld springen',
                    'Jump to the first missing field',
                  )}
                </RegistrationButton>
              </RegistrationNotice>
            </div>
          )}
        </>
      )}
    </RegistrationShell>
  );
}
