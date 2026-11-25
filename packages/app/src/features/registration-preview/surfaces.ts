export type Locale = 'de' | 'en';
export type Bilingual = Record<Locale, string>;
const text = (de: string, en: string): Bilingual => ({ de, en });

export const sideSurfaceOptions = [
  {
    value: 'confirmation',
    label: text('Nennung eingegangen', 'Registration received'),
  },
  { value: 'waitlist', label: text('Warteliste', 'Waiting list') },
  {
    value: 'admitted',
    label: text('Zugelassen / Überweisung', 'Admitted / bank transfer'),
  },
  {
    value: 'payment-success',
    label: text('Zahlung erfolgreich', 'Payment successful'),
  },
  {
    value: 'payment-cancelled',
    label: text('Zahlung abgebrochen', 'Payment cancelled'),
  },
  {
    value: 'payment-failed',
    label: text('Zahlung fehlgeschlagen', 'Payment failed'),
  },
  {
    value: 'payment-pending',
    label: text('Zahlung in Bearbeitung', 'Payment pending'),
  },
  {
    value: 'verify-loading',
    label: text('E-Mail-Link wird geprüft', 'Checking email link'),
  },
  {
    value: 'verify-success',
    label: text('E-Mail bestätigt', 'Email verified'),
  },
  {
    value: 'verify-expired',
    label: text('E-Mail-Link abgelaufen', 'Email link expired'),
  },
  {
    value: 'verify-error',
    label: text('Verifikation gestört', 'Verification unavailable'),
  },
  {
    value: 'resume-loading',
    label: text('Entwurf wird geladen', 'Loading draft'),
  },
  {
    value: 'resume-expired',
    label: text('Fortsetzungslink ungültig', 'Resume link invalid'),
  },
  {
    value: 'deadline',
    label: text('Nennungsschluss vorbei', 'Registration closed'),
  },
  {
    value: 'cancelled',
    label: text('Veranstaltung abgesagt', 'Event cancelled'),
  },
  { value: 'locked', label: text('Formular gesperrt', 'Form unavailable') },
  { value: 'sending', label: text('Wird gesendet', 'Sending') },
  { value: 'loading', label: text('Formular wird geladen', 'Loading form') },
] as const;

export type Surface = 'form' | (typeof sideSurfaceOptions)[number]['value'];

export const surfaceCopy: Partial<
  Record<Surface, { title: Bilingual; body: Bilingual }>
> = {
  confirmation: {
    title: text(
      'Deine Nennung ist eingegangen.',
      'Your entry has been received.',
    ),
    body: text(
      'Der MSC Hohenstein prüft deine Unterlagen und meldet sich, sobald du zugelassen bist. Das dauert meist zwei bis drei Tage. Bezahlen musst du erst danach.',
      'MSC Hohenstein checks your documents and notifies you when admitted, usually within two to three days. Payment is only due afterwards.',
    ),
  },
  waitlist: {
    title: text(
      'Du stehst auf der Warteliste.',
      'You are on the waiting list.',
    ),
    body: text(
      'Die Klasse Rennwagen war schon voll, als deine Nennung kam. Du rückst nach, sobald jemand absagt, und bekommst dann eine Mail.',
      'The racing car class was full when your entry arrived. You move up when someone cancels and will receive an email.',
    ),
  },
  admitted: {
    title: text(
      'Du bist zugelassen. Jetzt wird das Startgeld fällig.',
      'You are admitted. Your entry fee is now due.',
    ),
    body: text(
      'Der MSC Hohenstein hat deine Nennung angenommen. Bitte überweise bis zum 19. April, sonst geht dein Platz an die Warteliste.',
      'MSC Hohenstein has accepted your entry. Transfer the fee by 19 April or your place goes to the waiting list.',
    ),
  },
  'payment-success': {
    title: text('Zahlung erhalten', 'Payment received'),
    body: text(
      'Deine Nennung ist bezahlt. Der Beleg liegt in deiner Nennung.',
      'Your entry is paid. The receipt is available in your entry.',
    ),
  },
  'payment-cancelled': {
    title: text('Zahlung abgebrochen', 'Payment cancelled'),
    body: text(
      'Du hast die Zahlung abgebrochen. Deine Nennung ist eingegangen und bleibt erhalten, sie ist nur noch nicht bezahlt.',
      'You cancelled payment. Your entry has been received and is safe; it is just not paid yet.',
    ),
  },
  'payment-failed': {
    title: text('Zahlung fehlgeschlagen', 'Payment failed'),
    body: text(
      'Die Bank hat die Zahlung abgelehnt. Es wurde nichts abgebucht. Deine Nennung bleibt bestehen. Versuch es noch einmal oder überweise.',
      'The bank declined payment. Nothing was charged. Your entry remains valid. Try again or pay by bank transfer.',
    ),
  },
  'payment-pending': {
    title: text('Zahlung wird noch geprüft', 'Payment is still being checked'),
    body: text(
      'Deine Nennung bleibt bestehen. Bei SEPA dauert das bis zu zwei Werktage. Du musst nichts tun, wir schreiben dir, sobald die Zahlung da ist.',
      'Your entry is safe. SEPA may take up to two working days. You do not need to do anything; we will email you when payment arrives.',
    ),
  },
  'verify-loading': {
    title: text('Wir prüfen deinen Link', 'Checking your link'),
    body: text(
      'Einen Moment, das dauert nur Sekunden.',
      'One moment, this only takes a few seconds.',
    ),
  },
  'verify-success': {
    title: text(
      'E-Mail bestätigt. Die Nennung ist verifiziert.',
      'Email confirmed. Your entry is verified.',
    ),
    body: text(
      'Du kannst deine Nennung ab jetzt jederzeit über den Link in deiner Mail einsehen und ändern.',
      'You can now view and edit your entry at any time using the link in your email.',
    ),
  },
  'verify-expired': {
    title: text('Dieser Link gilt nicht mehr', 'This link is no longer valid'),
    body: text(
      'Bestätigungslinks sind 7 Tage gültig und können nur einmal verwendet werden. Wir schicken dir einen neuen.',
      'Verification links are valid for 7 days and can only be used once. Request a new one below.',
    ),
  },
  'verify-error': {
    title: text(
      'Verifikation momentan nicht möglich',
      'Verification temporarily unavailable',
    ),
    body: text(
      'Das liegt an uns, nicht an dir. Deine Nennung ist gespeichert. Versuch es in ein paar Minuten noch einmal.',
      'This is our fault, not yours. Your entry is saved. Please try again in a few minutes.',
    ),
  },
  'resume-loading': {
    title: text('Nennung wird geladen …', 'Loading your entry …'),
    body: text(
      'Wir holen deinen Entwurf. Deine Angaben von zuletzt sind alle noch da.',
      'We are fetching your draft. All your previous details are still there.',
    ),
  },
  'resume-expired': {
    title: text(
      'Dieser Fortsetzungslink ist ungültig, abgelaufen oder bereits verwendet',
      'This resume link is invalid, expired or has already been used',
    ),
    body: text(
      'Trag deine E-Mail-Adresse ein, dann schicken wir dir einen neuen Link zu deinem Entwurf.',
      'Enter your email address to request a new link to your draft.',
    ),
  },
  deadline: {
    title: text('Der Nennungsschluss ist vorbei', 'Registration has closed'),
    body: text(
      'Seit dem 12. April 23:59 nimmt der MSC Hohenstein keine Nennungen mehr an. Frag im Nennbüro, ob noch etwas geht.',
      'MSC Hohenstein has not accepted entries since 12 April at 23:59. Contact the registration office to ask about availability.',
    ),
  },
  cancelled: {
    title: text(
      'Diese Veranstaltung wurde abgesagt',
      'This event has been cancelled',
    ),
    body: text(
      'Der MSC Hohenstein hat den Historischen Bergpreis 2027 abgesagt. Bereits gezahlte Startgelder werden erstattet.',
      'MSC Hohenstein has cancelled the Historic Hill Climb 2027. Entry fees already paid will be refunded.',
    ),
  },
  locked: {
    title: text(
      'Das Formular ist momentan nicht verfügbar',
      'This form is temporarily unavailable',
    ),
    body: text(
      'Der Veranstalter arbeitet gerade daran. Versuch es in einer Stunde noch einmal, deine Angaben gehen nicht verloren.',
      'The organiser is working on the form. Try again in an hour; your details will not be lost.',
    ),
  },
  sending: {
    title: text('Wird gesendet …', 'Sending …'),
    body: text(
      'Schließe das Fenster nicht. Wenn es länger als eine Minute dauert, ist deine Nennung trotzdem gespeichert.',
      'Do not close this window. Even if this takes longer than a minute, your entry is still saved.',
    ),
  },
  loading: {
    title: text('Formular wird geladen', 'Loading form'),
    body: text(
      'Die Formularfelder werden vorbereitet.',
      'Preparing the form fields.',
    ),
  },
};

/** Generate a real, local PDF containing explicitly fictional preview data. */
export function downloadPreviewConfirmation(
  locale: Locale,
  email: string,
  amount: string,
  waitlist: boolean,
) {
  const lines = [
    'NENNBOX - LOCAL PREVIEW / LOKALE SIMULATION',
    'Not a real registration or payment receipt.',
    waitlist
      ? 'BP27-4419 - Waiting list / Warteliste: 4 / 4'
      : 'BP27-4417 - Registration received / Nennung eingegangen',
    `Email: ${email}`,
    `Amount / Betrag: ${amount}`,
    'No payment due before admission / Zahlung erst nach Zulassung.',
    locale === 'de' ? 'Bitte E-Mail bestaetigen.' : 'Please verify your email.',
  ].map((line) =>
    line.replace(/[^\x20-\x7E]/g, '?').replace(/[\\()]/g, '\\$&'),
  );
  const stream = `BT /F1 12 Tf 50 780 Td ${lines.map((line, index) => `${index ? '0 -24 Td ' : ''}(${line}) Tj`).join('\n')} ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const start = pdf.length;
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
  const url = URL.createObjectURL(new Blob([pdf], { type: 'application/pdf' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'nennbox-bestaetigung-simulation.pdf';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function confirmationNotice(
  locale: Locale,
  waitlist: boolean,
  email: string,
) {
  const message = waitlist
    ? text(
        'Ohne bestätigte E-Mail können wir dich nicht benachrichtigen, wenn ein Platz frei wird.',
        'Without a verified email we cannot notify you when a place becomes available.',
      )
    : text(
        'Nach Bestätigung deiner E-Mail kannst du deine Nennung jederzeit einsehen.',
        'Once your email is verified, you can view your entry at any time.',
      );
  return (
    message[locale] +
    ' ' +
    text(
      'Im echten Ablauf geht die Bestätigung an ',
      'In the real flow, confirmation goes to ',
    )[locale] +
    email
  );
}
