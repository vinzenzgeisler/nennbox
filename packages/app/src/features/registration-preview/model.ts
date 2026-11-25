/** Standalone demonstration state. No requests, payment processing or document uploads. */
export type Locale = 'de' | 'en';

export type Step =
  'person' | 'vehicle' | 'passenger' | 'documents' | 'review' | 'payment';

export type Localized = { de: string; en: string };

export type PassengerMode = 'none' | 'optional' | 'required';

// prettier-ignore
export type EventClass = { id: string; name: string; price: number; capacity: number; available: number; waitlistCount: number; passenger: PassengerMode; };

// prettier-ignore
export type Person = { firstName: string; lastName: string; birthDate: string; country: string; email: string; phone: string; street: string; postalCode: string; city: string; license: string; bloodGroup: string; emergencyName: string; emergencyPhone: string; guardianName: string; guardianEmail: string; publication: 'name' | 'initials' | 'anonymous'; };

// prettier-ignore
export type Vehicle = { manufacturer: string; model: string; year: string; plate: string; displacement: string; cylinders: string; transponder: string; vehiclePass: string; owner: string; history: string; };

// prettier-ignore
export type Passenger = { firstName: string; lastName: string; email: string; pending: boolean; };

// prettier-ignore
export type Entry = { id: string; classId: string; vehicle: Vehicle; replacement: Vehicle | null; waitlist: boolean; passenger: Passenger; };

// prettier-ignore
export type Upload = { name: string; size: number; type: string; status: 'ready' | 'uploading' | 'error'; };

// prettier-ignore
export type Question = { id: string; label: Localized; required: boolean; type: 'text' | 'select' | 'checkbox'; options?: string[]; };

// prettier-ignore
export type DocumentRequirement = { id: string; label: Localized; required: boolean; };

// prettier-ignore
export type PreviewConfig = { questions: boolean; uploads: boolean; instantPayment: boolean; minimumAge: number; personFields?: Partial<Record<keyof Person, boolean>>; };

// prettier-ignore
export type Draft = { person: Person; entries: Entry[]; answers: Record<string, string | boolean>; uploads: Record<string, Upload | null>; consents: { terms: boolean; privacy: boolean; organizer: boolean }; paymentMethod: '' | 'online' | 'transfer'; };

export type ValidationErrors = Record<string, string>;

// prettier-ignore
export const defaultConfig: PreviewConfig = { questions: true, uploads: true, instantPayment: false, minimumAge: 12, };

// prettier-ignore
export const sampleEvent = {
  name: 'Historischer Bergpreis 2027',
  organizer: 'MSC Hohenstein e. V.',
  date: '2027-04-26',
  endDate: '2027-04-27',
  deadline: '2027-04-12',
  minimumAge: 12,
  reference: 'BP27-4417',
  classes: [
    { id: 'touring-small', name: 'Serienwagen bis 1600 cm³', price: 90, capacity: 50, available: 22, waitlistCount: 0, passenger: 'optional', },
    { id: 'touring-large', name: 'Serienwagen über 1600 cm³', price: 110, capacity: 50, available: 8, waitlistCount: 0, passenger: 'required', },
    { id: 'racing', name: 'Rennwagen', price: 130, capacity: 30, available: 0, waitlistCount: 3, passenger: 'none', },
    { id: 'motorcycle', name: 'Motorräder', price: 80, capacity: 40, available: 14, waitlistCount: 0, passenger: 'none', },
  ] satisfies EventClass[],
  questions: [
    { id: 'discovery', label: { de: 'Wie bist du auf uns aufmerksam geworden?', en: 'How did you hear about us?', }, required: false, type: 'text', },
    { id: 'electricity', label: { de: 'Brauchst du Strom im Fahrerlager?', en: 'Do you need electricity in the paddock?', }, required: true, type: 'select', options: ['230 V', '400 V', 'Nein'], },
    { id: 'overnight', label: { de: 'Ich übernachte im Fahrerlager', en: 'I am staying overnight in the paddock', }, required: false, type: 'checkbox', },
    { id: 'helper', label: { de: 'Ich bringe einen Helfer mit', en: 'I am bringing a helper', }, required: false, type: 'checkbox', },
  ] satisfies Question[],
  documents: [
    { id: 'license', label: { de: 'Kopie der Lizenz', en: 'Licence copy' }, required: true, },
    { id: 'registration', label: { de: 'Fahrzeugschein', en: 'Vehicle registration' }, required: false, },
    { id: 'vehiclePass', label: { de: 'Fahrzeugpass', en: 'Vehicle passport' }, required: true, },
    { id: 'other', label: { de: 'Sonstiger Nachweis', en: 'Other document' }, required: false, },
  ] satisfies DocumentRequirement[],
};

// prettier-ignore
export const emptyVehicle: Vehicle = { manufacturer: '', model: '', year: '', plate: '', displacement: '', cylinders: '', transponder: '', vehiclePass: '', owner: '', history: '', };

// prettier-ignore
export const emptyPassenger: Passenger = { firstName: '', lastName: '', email: '', pending: false, };

export function createEntry(id = 'entry-1'): Entry {
  return {
    id,
    classId: '',
    vehicle: { ...emptyVehicle },
    replacement: null,
    waitlist: false,
    passenger: { ...emptyPassenger },
  };
}

// prettier-ignore
export const initialDraft: Draft = {
  person: { firstName: 'Tom', lastName: 'Probe', birthDate: '1994-03-14', country: 'DE', email: 'tom.probe@beispiel.de', phone: '+49 170 1234567', street: 'Bergstraße 14', postalCode: '09350', city: 'Lichtenstein', license: 'DMSB 4417', bloodGroup: '', emergencyName: 'Sabine Probe', emergencyPhone: '+49 170 7654321', guardianName: '', guardianEmail: '', publication: 'name', },
  entries: [
    { ...createEntry(), classId: 'touring-large', vehicle: { ...emptyVehicle, manufacturer: 'Porsche', model: '911 SC', year: '1981', plate: 'Z-MS 911H', displacement: '2994', cylinders: '6', vehiclePass: 'FIVA 118374', }, },
  ],
  answers: {},
  uploads: {},
  consents: { terms: false, privacy: false, organizer: false },
  paymentMethod: '',
};

export function createDraft(): Draft {
  return structuredClone(initialDraft);
}

export function classFor(entry: Entry): EventClass | undefined {
  return sampleEvent.classes.find((item) => item.id === entry.classId);
}

/** Prices are EUR, not cents. Replacement vehicles never create another fee. */
export function entryPrice(entry: Entry): number {
  return classFor(entry)?.price ?? 0;
}

export function totalPrice(draft: Draft): number {
  return draft.entries.reduce((sum, entry) => sum + entryPrice(entry), 0);
}

export function isWaitlisted(entry: Entry): boolean {
  return classFor(entry)?.available === 0 && entry.waitlist;
}

// prettier-ignore
export function payableNow(draft: Draft, config: PreviewConfig): number {
  return config.instantPayment ? draft.entries.filter((entry) => !isWaitlisted(entry)).reduce((sum, entry) => sum + entryPrice(entry), 0) : 0;
}

// prettier-ignore
export function stepsFor(draft: Draft, config: PreviewConfig = defaultConfig): Step[] {
  const steps: Step[] = ['person', 'vehicle'];
  if (
    draft.entries.some((entry) => {
      const cls = classFor(entry);
      return cls && cls.passenger !== 'none';
    })
  )
    steps.push('passenger');
  if ((config.questions && sampleEvent.questions.length) || (config.uploads && sampleEvent.documents.length)) steps.push('documents');
  steps.push('review');
  if (config.instantPayment && payableNow(draft, config) > 0) steps.push('payment');
  return steps;
}

// prettier-ignore
/** Calendar-day calculation independent of the host clock and timezone. */
export function ageOnEvent(birthDate: string, eventDate = sampleEvent.date): number | null {
  const parse = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? date : null;
  };
  const birth = parse(birthDate),
    event = parse(eventDate);
  if (!birth || !event || birth > event) return null;
  let age = event.getUTCFullYear() - birth.getUTCFullYear();
  if (event.getUTCMonth() < birth.getUTCMonth() || (event.getUTCMonth() === birth.getUTCMonth() && event.getUTCDate() < birth.getUTCDate())) age--;
  return age;
}

export const maxUploadBytes = 10 * 1024 * 1024;

// prettier-ignore
export function uploadError(upload: Upload, locale: Locale = 'de'): string | null {
  const message = (de: string, en: string) => (locale === 'de' ? de : en);
  if (upload.size > maxUploadBytes)
    return message('Diese Datei ist zu groß. Lade eine Datei bis 10 MB hoch.', 'This file is too large. Upload a file up to 10 MB.');
  if (upload.size <= 0 || !['application/pdf', 'image/jpeg', 'image/png'].includes(upload.type))
    return message('Lade eine Datei als PDF, JPG oder PNG hoch.', 'Upload a PDF, JPG or PNG file.');
  if (upload.status !== 'ready') return message('Warte, bis die Datei bereit ist, oder wähle sie erneut.', 'Wait until the file is ready or select it again.');
  return null;
}

// prettier-ignore
export function validateStep(step: Step, draft: Draft, locale: Locale = 'de', config: PreviewConfig = defaultConfig): ValidationErrors {
  const errors: ValidationErrors = {};
  const message = (de: string, en: string) => (locale === 'de' ? de : en);
  const required = (path: string, value: string | boolean | undefined) => {
    if (typeof value === 'string' ? !value.trim() : !value) errors[path] = message('Bitte fülle dieses Feld aus.', 'Please complete this field.');
  };
  const email = (path: string, value: string) => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) errors[path] = message('Bitte gib eine gültige E-Mail-Adresse ein.', 'Please enter a valid email address.');
  };
  if (step === 'person') {
    const person = draft.person;
    for (const key of ['firstName', 'lastName', 'country', 'email', 'street', 'postalCode', 'city', 'license', 'emergencyName', 'emergencyPhone'] as const) {
      if (config.personFields?.[key] !== false) required(`person.${key}`, person[key]);
    }
    email('person.email', person.email);
    const age = ageOnEvent(person.birthDate);
    if (age === null) errors['person.birthDate'] = message('Bitte gib ein gültiges Geburtsdatum ein.', 'Please enter a valid date of birth.');
    else if (age < config.minimumAge)
      errors['person.birthDate'] = message(
        `Das Mindestalter beträgt ${config.minimumAge} Jahre. Bitte prüfe das Datum oder kontaktiere das Nennbüro.`,
        `The minimum age is ${config.minimumAge}. Check the date or contact the organiser.`,
      );
    else if (age < 18) {
      required('person.guardianName', person.guardianName);
      email('person.guardianEmail', person.guardianEmail);
    }
  }
  if (step === 'vehicle') {
    if (!draft.entries.length) errors.entries = message('Füge mindestens eine Startmeldung hinzu.', 'Add at least one entry.');
    draft.entries.forEach((entry, index) => {
      const prefix = `entries.${index}`,
        cls = classFor(entry);
      if (!cls) errors[`${prefix}.classId`] = message('Bitte wähle eine Klasse.', 'Please select a class.');
      if (cls?.available === 0 && !entry.waitlist)
        errors[`${prefix}.waitlist`] = message('Bitte wähle die Warteliste oder eine andere Klasse.', 'Choose the waiting list or another class.');
      for (const key of ['manufacturer', 'model', 'year', 'displacement', 'vehiclePass'] as const) required(`${prefix}.vehicle.${key}`, entry.vehicle[key]);
      const year = Number(entry.vehicle.year);
      if (!/^\d{4}$/.test(entry.vehicle.year) || year < 1886 || year > Number(sampleEvent.date.slice(0, 4)))
        errors[`${prefix}.vehicle.year`] = message('Bitte gib ein gültiges Baujahr ein.', 'Please enter a valid manufacture year.');
      if (!Number.isFinite(Number(entry.vehicle.displacement)) || Number(entry.vehicle.displacement) <= 0)
        errors[`${prefix}.vehicle.displacement`] = message('Bitte gib den Hubraum größer als 0 an.', 'Enter a displacement greater than 0.');
      if (entry.replacement) for (const key of ['manufacturer', 'model', 'year'] as const) required(`${prefix}.replacement.${key}`, entry.replacement[key]);
    });
  }
  if (step === 'passenger')
    draft.entries.forEach((entry, index) => {
      const mode = classFor(entry)?.passenger,
        passenger = entry.passenger;
      if (!mode || mode === 'none' || passenger.pending) return;
      if (mode === 'optional' && ![passenger.firstName, passenger.lastName, passenger.email].some((value) => value.trim())) return;
      const prefix = `entries.${index}.passenger`;
      required(`${prefix}.firstName`, passenger.firstName);
      required(`${prefix}.lastName`, passenger.lastName);
      email(`${prefix}.email`, passenger.email);
    });
  if (step === 'documents') {
    if (config.questions)
      for (const question of sampleEvent.questions) {
        const answer = draft.answers[question.id];
        if (question.required) required(`answers.${question.id}`, answer);
        if (question.type === 'select' && answer && !question.options?.includes(String(answer)))
          errors[`answers.${question.id}`] = message('Bitte wähle eine der angebotenen Antworten.', 'Please select one of the available answers.');
      }
    if (config.uploads)
      for (const document of sampleEvent.documents) {
        const upload = draft.uploads[document.id];
        if (!upload && document.required) errors[`uploads.${document.id}`] = message('Bitte füge diesen Nachweis hinzu.', 'Please add this document.');
        if (upload) {
          const error = uploadError(upload, locale);
          if (error) errors[`uploads.${document.id}`] = error;
        }
      }
  }
  if (step === 'review') {
    for (const prior of stepsFor(draft, config).filter((item) => item !== 'review' && item !== 'payment'))
      Object.assign(errors, validateStep(prior, draft, locale, config));
    for (const key of ['terms', 'privacy', 'organizer'] as const)
      if (!draft.consents[key]) errors[`consents.${key}`] = message('Bitte bestätige diesen Punkt einzeln.', 'Please confirm this item separately.');
  }
  if (step === 'payment' && config.instantPayment && payableNow(draft, config) > 0 && !['online', 'transfer'].includes(draft.paymentMethod))
    errors.paymentMethod = message('Bitte wähle eine Zahlungsart.', 'Please select a payment method.');
  return errors;
}
