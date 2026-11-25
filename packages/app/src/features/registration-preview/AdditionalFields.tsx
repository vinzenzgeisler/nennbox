import {
  Checkbox,
  RegistrationButton,
  RegistrationCard,
  RegistrationField,
  RegistrationNotice,
  RegistrationOptionCard,
  RegistrationUpload,
} from '@nennbox/ui';
import {
  classFor,
  maxUploadBytes,
  sampleEvent,
  uploadError,
  type Entry,
} from './model.js';
import { type FormProps } from './PersonFields.js';
import { words } from './text.js';
export function PassengerFields({
  draft,
  locale,
  errors,
  onDraft,
  onBlur,
}: FormProps) {
  const w = words(locale),
    t = (de: string, en: string) => (locale === 'de' ? de : en);
  const patch = (id: string, passenger: Entry['passenger']) =>
    onDraft({
      ...draft,
      entries: draft.entries.map((e) =>
        e.id === id ? { ...e, passenger } : e,
      ),
    });
  return (
    <>
      <RegistrationNotice>
        {t(
          'Dein Beifahrer bekommt eine eigene E-Mail und ergänzt dort Geburtsdatum, Anschrift, Lizenz und Notfallkontakt. Du musst das nicht für ihn ausfüllen. (Im Prototyp simuliert.)',
          'Your co-driver receives their own email to add date of birth, address, licence and emergency contact. You do not need to fill these in. (Simulated in this prototype.)',
        )}
      </RegistrationNotice>
      {draft.entries.map((entry, i) =>
        classFor(entry)?.passenger === 'none' ? null : (
          <RegistrationCard key={entry.id} title={`${w.passenger} · ${i + 1}`}>
            <Checkbox
              label={t(
                'Der Beifahrer steht noch nicht fest',
                'The co-driver is not yet known',
              )}
              checked={entry.passenger.pending}
              onChange={(e) =>
                patch(entry.id, {
                  ...entry.passenger,
                  pending: e.target.checked,
                })
              }
            />
            <p className="nb-reg-hint">
              {t(
                'Du kannst ihn bis zum Nennungsschluss nachtragen. Ohne Beifahrer wird die Nennung nicht zugelassen.',
                'You can add them before the deadline. Admission requires a co-driver.',
              )}
            </p>
            {!entry.passenger.pending && (
              <div className="nb-reg-grid-2">
                {(['firstName', 'lastName', 'email'] as const).map((key) => (
                  <RegistrationField
                    key={key}
                    id={`entries.${i}.passenger.${key}`}
                    label={w[key]}
                    required={classFor(entry)?.passenger === 'required'}
                    requiredLabel={w.required}
                    optionalLabel={w.optional}
                    type={key === 'email' ? 'email' : 'text'}
                    value={entry.passenger[key]}
                    error={errors[`entries.${i}.passenger.${key}`]}
                    onChange={(e) =>
                      patch(entry.id, {
                        ...entry.passenger,
                        [key]: e.target.value,
                      })
                    }
                    onBlur={() => onBlur(`entries.${i}.passenger.${key}`)}
                  />
                ))}
              </div>
            )}
          </RegistrationCard>
        ),
      )}
    </>
  );
}
export function DocumentFields({
  draft,
  locale,
  errors,
  onDraft,
  onBlur,
  questions,
  uploads,
}: FormProps & { questions: boolean; uploads: boolean }) {
  const w = words(locale),
    t = (de: string, en: string) => (locale === 'de' ? de : en);
  return (
    <>
      <p className="nb-reg-lead">
        {t(
          'Diese Fragen stellt der MSC Hohenstein, nicht NENNBOX. Die Nachweise kannst du mit dem Handy abfotografieren, das reicht völlig.',
          'These questions come from MSC Hohenstein, not NENNBOX. A photo from your phone is enough for documents.',
        )}
      </p>
      {questions && (
        <fieldset>
          <legend>
            {t('Fragen des Veranstalters', 'Questions from the organiser')}
          </legend>
          {sampleEvent.questions.map((q) => {
            const set = (value: string | boolean) =>
              onDraft({
                ...draft,
                answers: { ...draft.answers, [q.id]: value },
              });
            if (q.type === 'checkbox')
              return (
                <Checkbox
                  key={q.id}
                  label={`${q.label[locale]} · ${w.optional}`}
                  checked={!!draft.answers[q.id]}
                  onChange={(e) => set(e.target.checked)}
                />
              );
            if (q.type === 'select')
              return (
                <fieldset key={q.id} id={`answers.${q.id}`} tabIndex={-1}>
                  <legend>
                    {q.label[locale]} · {w.required}
                  </legend>
                  <div className="nb-reg-options">
                    {q.options?.map((option) => (
                      <RegistrationOptionCard
                        key={option}
                        name={q.id}
                        label={option === 'Nein' ? t('Nein', 'No') : option}
                        checked={draft.answers[q.id] === option}
                        onChange={() => set(option)}
                      />
                    ))}
                  </div>
                  {errors[`answers.${q.id}`] && (
                    <p role="alert">{errors[`answers.${q.id}`]}</p>
                  )}
                </fieldset>
              );
            return (
              <RegistrationField
                key={q.id}
                id={`answers.${q.id}`}
                label={q.label[locale]}
                optionalLabel={w.optional}
                value={String(draft.answers[q.id] ?? '')}
                onChange={(e) => set(e.target.value)}
                onBlur={() => onBlur(`answers.${q.id}`)}
              />
            );
          })}
        </fieldset>
      )}
      {uploads && (
        <fieldset>
          <legend>{t('Nachweise', 'Documents')}</legend>
          <RegistrationNotice>
            {t(
              'Lokale Simulation: Dateien werden nicht versandt. Gespeichert werden nur Name und Status, keine Dateiinhalte.',
              'Local simulation: files are not sent. Only names and status are saved, not file contents.',
            )}
          </RegistrationNotice>
          {sampleEvent.documents.map((doc) => {
            const upload = draft.uploads[doc.id];
            const remove = () =>
              onDraft({
                ...draft,
                uploads: { ...draft.uploads, [doc.id]: null },
              });
            const error = upload
              ? uploadError(upload, locale)
              : errors[`uploads.${doc.id}`];
            return (
              <div key={doc.id} id={`uploads.${doc.id}`} tabIndex={-1}>
                <RegistrationUpload
                  label={doc.label[locale]}
                  required={doc.required}
                  state={
                    !upload
                      ? 'empty'
                      : upload.status === 'uploading'
                        ? 'uploading'
                        : error
                          ? 'error'
                          : 'success'
                  }
                  detail={
                    upload
                      ? `${upload.name} · ${(upload.size / 1024 / 1024).toFixed(1)} MB`
                      : undefined
                  }
                  error={error ?? undefined}
                  onRemove={remove}
                  onCancel={remove}
                  onSelect={(file) =>
                    onDraft({
                      ...draft,
                      uploads: {
                        ...draft.uploads,
                        [doc.id]: {
                          name: file.name,
                          size: file.size,
                          type: file.type,
                          status:
                            file.size <= maxUploadBytes &&
                            [
                              'image/jpeg',
                              'image/png',
                              'application/pdf',
                            ].includes(file.type)
                              ? 'ready'
                              : 'error',
                        },
                      },
                    })
                  }
                  labels={
                    locale === 'en'
                      ? {
                          choose: 'Choose file',
                          camera: 'Take photo',
                          replace: 'Choose another file',
                          remove: 'Remove',
                          cancel: 'Cancel',
                          required: 'Required',
                          optional: 'Optional',
                          uploading: 'simulated upload in progress',
                          success: 'available locally',
                        }
                      : { success: 'lokal bereit' }
                  }
                />
                {upload?.status === 'uploading' && (
                  <RegistrationButton
                    tone="ghost"
                    onClick={() =>
                      onDraft({
                        ...draft,
                        uploads: {
                          ...draft.uploads,
                          [doc.id]: { ...upload, status: 'ready' },
                        },
                      })
                    }
                  >
                    {t('Simulation abschließen', 'Finish simulation')}
                  </RegistrationButton>
                )}
              </div>
            );
          })}
        </fieldset>
      )}
    </>
  );
}
