import { Checkbox, Field, Steps } from '@nennbox/ui';
import { RegistrationPayment } from './RegistrationPayment.js';
import { Fragment } from 'react';
import type { RegistrationModel } from './RegistrationModel.js';
import type { RegistrationActions } from './RegistrationActions.js';
import {
  RegistrationHeader,
  registrationBrandStyle,
  RegistrationSummary,
} from './RegistrationChrome.js';
import { RegistrationVehicleFields } from './RegistrationVehicleFields.js';
import { RegistrationAboutFields } from './RegistrationAboutFields.js';
import {
  RegistrationContactFields,
  RegistrationPhoneField,
} from './RegistrationContactFields.js';
import { RegistrationReview } from './RegistrationReview.js';
import { RegistrationFooter } from './RegistrationFooter.js';
import {
  RegistrationDriverField,
  driverFieldValue,
  updateDriverField,
} from './RegistrationDriverField.js';

const DRIVER_FIELD_RANK: Record<string, number> = {
  firstName: 0,
  lastName: 1,
  dateOfBirth: 2,
  email: 3,
};

function stepLabel(id: string, locale: 'de' | 'en') {
  if (id === 'driver') return locale === 'de' ? 'Fahrer' : 'Driver';
  if (id === 'vehicles') return locale === 'de' ? 'Startmeldungen' : 'Entries';
  if (id === 'payment') return locale === 'de' ? 'Bezahlen' : 'Pay';
  return locale === 'de' ? 'Prüfen' : 'Review';
}

export function RegistrationView({
  model,
  actions,
  organizationId,
  eventSlug,
}: {
  model: RegistrationModel;
  actions: RegistrationActions;
  organizationId: string;
  eventSlug: string;
}) {
  const {
    contrastColors,
    payload,
    formRef,
    currentStep,
    locale,
    vehicles,
    setVehicle,
    setVehicles,
    t,
    numberLookup,
    numberAvailability,
    setNumberAvailability,
    accepted,
    setAccepted,
    values,
    setValues,
    guardianRequired,
    error,
    step,
    setStep,
    steps,
    draftMessage,
    paymentStepEnabled,
  } = model;
  const { submit } = actions;
  const displayFields =
    currentStep?.id === 'driver'
      ? [...currentStep.fields].sort(
          (left, right) =>
            (DRIVER_FIELD_RANK[left.key] ?? 99) -
            (DRIVER_FIELD_RANK[right.key] ?? 99),
        )
      : currentStep?.fields;
  const brandStyle = registrationBrandStyle(model);
  return (
    <section
      className="registration"
      aria-labelledby="registration-title"
      style={brandStyle}
    >
      <RegistrationHeader
        model={model}
        organizationId={organizationId}
        eventSlug={eventSlug}
      />
      {contrastColors.contrastNotice && (
        <p className="registration-contrast-note" role="note">
          {locale === 'de'
            ? 'Schriftfarben werden automatisch für gute Lesbarkeit angepasst.'
            : 'Text colors are automatically adjusted for readability.'}
        </p>
      )}
      <main className="registration-container">
        <Steps
          steps={steps.map((item) => stepLabel(item.id, locale))}
          current={step}
          label={locale === 'de' ? 'Anmeldeschritte' : 'Registration steps'}
          completedLabel={locale === 'de' ? 'Abgeschlossen' : 'Completed'}
          variant="registration"
          compactLabel={`${locale === 'de' ? 'Schritt' : 'Step'} ${step + 1} ${locale === 'de' ? 'von' : 'of'} ${steps.length} · ${currentStep ? stepLabel(currentStep.id, locale) : ''}`}
        />
        <div className="registration-layout">
          <form
            className="registration-form"
            id="registration-form"
            ref={formRef}
            onSubmit={submit}
            noValidate={false}
          >
            <fieldset>
              <legend>
                {step === steps.length - 1 && paymentStepEnabled
                  ? locale === 'de'
                    ? 'Bezahlen'
                    : 'Pay'
                  : step === steps.length - 1 ||
                      (paymentStepEnabled && step === steps.length - 2)
                    ? locale === 'de'
                      ? 'Bitte prüfen'
                      : 'Please review'
                    : currentStep?.id === 'driver'
                      ? locale === 'de'
                        ? 'Fahrer'
                        : 'Driver'
                      : currentStep?.id === 'vehicles'
                        ? locale === 'de'
                          ? 'Startmeldungen'
                          : 'Entries'
                        : currentStep?.title[locale]}
              </legend>
              {step !== steps.length - 1 && currentStep?.id === 'vehicles' && (
                <p className="registration-step-description">
                  {locale === 'de'
                    ? 'Lege für jedes Fahrzeug eine Startmeldung an. Mehrere Starts sind möglich.'
                    : 'Create an entry for each vehicle. You can add multiple entries.'}
                </p>
              )}
              {paymentStepEnabled && step === steps.length - 1 ? (
                <RegistrationPayment model={model} />
              ) : step === steps.length - 1 ||
                (paymentStepEnabled && step === steps.length - 2) ? (
                <RegistrationReview
                  model={model}
                  onEditDriver={() => setStep(0)}
                  onEditEntries={() => setStep(1)}
                />
              ) : (
                displayFields?.map((field) => {
                  if (field.key === 'entries')
                    return (
                      <RegistrationVehicleFields
                        key={field.key}
                        field={field}
                        locale={locale}
                        vehicles={vehicles}
                        setVehicle={setVehicle}
                        setVehicles={setVehicles}
                        payload={payload}
                        t={t}
                        numberLookupRef={numberLookup}
                        numberAvailability={numberAvailability}
                        setNumberAvailability={setNumberAvailability}
                        organizationId={organizationId}
                        eventSlug={eventSlug}
                        validateCurrent={() =>
                          formRef.current?.reportValidity() ?? true
                        }
                      />
                    );
                  if (field.key === 'consent')
                    return (
                      <div key={field.key} className="consent-list">
                        {payload.consents
                          .filter((item) => item.language === locale)
                          .map((term) => (
                            <Checkbox
                              key={`${term.key}:${term.version}:${term.language}`}
                              label={`${term.required === false ? (locale === 'de' ? 'Freiwillig · ' : 'Optional · ') : locale === 'de' ? 'Erforderlich · ' : 'Required · '}${term.text} (${t.consent})`}
                              aria-required={term.required !== false}
                              checked={
                                accepted[
                                  `${term.key}:${term.version}:${term.language}`
                                ] ?? false
                              }
                              onChange={(e) =>
                                setAccepted((old) => ({
                                  ...old,
                                  [`${term.key}:${term.version}:${term.language}`]:
                                    e.target.checked,
                                }))
                              }
                            />
                          ))}
                      </div>
                    );
                  const key = field.key;
                  return (
                    <Fragment key={field.key}>
                      <RegistrationDriverField
                        field={field}
                        locale={locale}
                        value={driverFieldValue(values, key)}
                        onChange={(value) =>
                          setValues((old) => updateDriverField(old, key, value))
                        }
                      />
                    </Fragment>
                  );
                })
              )}
              {currentStep?.id === 'driver' && (
                <RegistrationPhoneField
                  config={payload.registrationFormConfig}
                  values={values}
                  onChange={(patch) =>
                    setValues((old) => ({ ...old, ...patch }))
                  }
                  t={t}
                />
              )}
              {currentStep?.id === 'driver' && (
                <RegistrationContactFields
                  config={payload.registrationFormConfig}
                  values={values}
                  onChange={(patch) =>
                    setValues((old) => ({ ...old, ...patch }))
                  }
                  t={t}
                />
              )}
              {currentStep?.id === 'driver' && (
                <RegistrationAboutFields model={model} actions={actions} />
              )}
              {currentStep?.id === 'driver' && guardianRequired && (
                <div className="guardian-fields">
                  <>
                    <Field
                      label={t.guardianName}
                      required
                      value={values.guardianName}
                      onChange={(e) =>
                        setValues((old) => ({
                          ...old,
                          guardianName: e.target.value,
                        }))
                      }
                    />
                    <Field
                      label={t.guardianEmail}
                      type="email"
                      required
                      value={values.guardianEmail}
                      onChange={(e) =>
                        setValues((old) => ({
                          ...old,
                          guardianEmail: e.target.value,
                        }))
                      }
                    />
                  </>
                </div>
              )}
            </fieldset>
            {error && <p role="alert">{error}</p>}
            {draftMessage && <p role="status">{draftMessage}</p>}
            <RegistrationFooter model={model} actions={actions} />
          </form>
          <RegistrationSummary model={model} />
        </div>
      </main>
      <footer className="registration-site-footer">
        <span>{payload.organization.name}</span>
        <span>Nennung mit NENNBOX</span>
      </footer>
    </section>
  );
}
