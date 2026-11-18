import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from '@playwright/test';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';

const api = process.env.RACEPILOT_API_URL ?? 'http://127.0.0.1:3000';
const mailpit = process.env.RACEPILOT_MAILPIT_URL ?? 'http://127.0.0.1:8025';
const shots = process.env.PORTAL_SCREENSHOT_DIR;
async function shoot(page: Page, name: string) {
  if (!shots) return;
  mkdirSync(shots, { recursive: true });
  const original = page.viewportSize();
  for (const [width, height] of [
    [390, 844],
    [1440, 900],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.screenshot({
      path: `${shots}/${name}-${width}.png`,
      fullPage: false,
      animations: 'disabled',
      timeout: 30_000,
    });
  }
  if (original) await page.setViewportSize(original);
}
async function mailTo(
  request: APIRequestContext,
  address: string,
  marker: string,
) {
  let content = '';
  await expect
    .poll(
      async () => {
        const list = await request.get(`${mailpit}/api/v1/messages`);
        if (!list.ok()) return false;
        for (const message of (
          (await list.json()) as { messages?: Array<{ ID: string }> }
        ).messages ?? []) {
          if (!JSON.stringify(message).includes(address)) continue;
          const full = await request.get(
            `${mailpit}/api/v1/message/${message.ID}`,
          );
          const body = (await full.json()) as { Text?: string; HTML?: string };
          const candidate = `${body.Text ?? ''}\n${body.HTML ?? ''}`;
          if (candidate.includes(marker)) {
            content = candidate;
            return true;
          }
        }
        return false;
      },
      { timeout: 60_000 },
    )
    .toBe(true);
  return content;
}
const linkIn = (text: string, marker: string) =>
  text.match(new RegExp(`https?://[^\\s"<>]*${marker}[^\\s"<>]*`))?.[0] ?? '';

test('driver requests a Mailpit link, uploads a document, and the office sees it', async ({
  page,
  request,
  browser,
}) => {
  test.setTimeout(240_000);
  const password = process.env.COMMUNITY_ADMIN_PASSWORD;
  if (!password) throw new Error('COMMUNITY_ADMIN_PASSWORD is required');
  await page.goto('/app');
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await page
    .locator('#username')
    .fill(process.env.COMMUNITY_ADMIN_EMAIL ?? 'admin@nennbox.local');
  await page.locator('#password').fill(password);
  let bearer = '';
  page.on('request', (req) => {
    const auth = req.headers().authorization;
    if (auth?.startsWith('Bearer ')) bearer = auth.slice(7);
  });
  await page.locator('#kc-login').click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Nennungen' }),
  ).toBeVisible();
  await expect.poll(() => bearer).not.toBe('');
  const call = async (
    path: string,
    method: string,
    data?: unknown,
    status = 200,
  ) => {
    const response = await request.fetch(`${api}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${bearer}`,
        'content-type': 'application/json',
      },
      ...(data === undefined ? {} : { data }),
    });
    expect(
      response.status(),
      `${method} ${path}: ${await response.text()}`,
    ).toBe(status);
    return response.json();
  };
  await call('/admin/organization/payment-recipient', 'PUT', {
    accountName: 'Rallye Club',
    iban: 'DE89370400440532013000',
    bic: 'COBADEFFXXX',
  });
  const suffix = randomUUID().slice(0, 8);
  const slug = `portal-${suffix}`;
  const address = `portal-${suffix}@example.test`;
  const event = await call(
    '/admin/events',
    'POST',
    {
      slug,
      name: 'Portal Rallye',
      startsOn: '2027-06-01',
      endsOn: '2027-06-02',
    },
    201,
  );
  const klass = await call(
    `/admin/events/${event.id}/classes`,
    'POST',
    {
      name: 'Rallye',
      code: 'RAL',
      vehicleType: 'car',
      sortOrder: 0,
      maxParticipants: null,
      closed: false,
    },
    201,
  );
  await call(`/admin/events/${event.id}/pricing/${klass.id}`, 'PUT', {
    baseCents: 5000,
    additionalEntryAdjustmentCents: 0,
    earlyBirdDeadline: null,
    earlyBirdDiscountCents: 0,
  });
  const terms = 'Ich akzeptiere die Teilnahmebedingungen des Portal-Tests.';
  await call(`/admin/events/${event.id}/consents`, 'PUT', {
    terms: [
      {
        key: 'participation',
        version: '1',
        language: 'de',
        text: terms,
        hash: createHash('sha256').update(terms).digest('hex'),
        required: true,
      },
    ],
  });
  await call(`/admin/events/${event.id}/entry-document-types`, 'PUT', {
    types: [
      {
        key: 'vehicle-registration',
        name: 'Fahrzeugschein',
        required: true,
        hint: null,
      },
    ],
  });
  await call(`/admin/events/${event.id}/transitions`, 'POST', {
    status: 'open',
  });
  await page.goto(`/events/${slug}/register`);
  await page.getByLabel('Vorname', { exact: true }).fill('Fiona');
  await page.getByLabel('Nachname', { exact: true }).fill(`Fahrerin ${suffix}`);
  await page.getByLabel('Kontakt-E-Mail').fill(address);
  await page.getByLabel('Geburtsdatum').fill('1990-12-10');
  await page
    .getByRole('button', { name: 'Weiter zu Startmeldungen', exact: true })
    .click();
  await page.getByLabel('Klasse').selectOption(klass.id);
  await page.getByLabel('Hersteller', { exact: true }).fill('Lancia');
  await page.getByLabel('Modell', { exact: true }).fill('Stratos');
  await page
    .getByRole('button', { name: 'Weiter zur Prüfung', exact: true })
    .click();
  await page.getByRole('checkbox').check();
  const submitted = page.waitForResponse(
    (response) =>
      response.url().includes('/registration/submissions') &&
      response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Nennung absenden' }).click();
  expect((await submitted).status()).toBe(202);
  const verification = linkIn(
    await mailTo(request, address, '/registration/verify'),
    '/registration/verify',
  );
  await page.goto(verification);
  await expect(page.getByRole('status')).toContainText('E-Mail bestätigt');
  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  await guest.goto(`/events/${slug}/my-entry`);
  await expect(
    guest.getByRole('heading', { name: 'Meine Nennung' }),
  ).toBeVisible();
  await shoot(guest, 'request');
  await guest.getByLabel('E-Mail-Adresse').fill(address);
  await guest.getByRole('button', { name: 'Link per E-Mail erhalten' }).click();
  await expect(guest.getByText('Bitte prüfe dein Postfach')).toBeVisible();
  const link = linkIn(
    await mailTo(request, address, '/my-entry#token='),
    '/my-entry#token=',
  );
  expect(link).toBeTruthy();
  await guest.goto(link);
  await expect(
    guest.getByRole('heading', { name: 'Portal Rallye' }),
  ).toBeVisible();
  expect(guest.url()).not.toContain('token=');
  await expect(guest.getByText('Dir fehlt noch: Fahrzeugschein')).toBeVisible();
  await shoot(guest, 'portal-before-upload');
  await guest.getByLabel('Jetzt hochladen').setInputFiles({
    name: 'fahrzeugschein.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4 portal document'),
  });
  await expect(guest.getByText('Unterlage hochgeladen.')).toBeVisible();
  await expect(guest.getByText('Hochgeladen – wird geprüft')).toBeVisible();
  await shoot(guest, 'portal-uploaded');
  await page.goto('/app');
  await page
    .getByRole('combobox', { name: 'Veranstaltung' })
    .selectOption(event.id);
  const row = page.getByRole('row').filter({ hasText: `Fahrerin ${suffix}` });
  await row
    .getByRole('button', { name: new RegExp(`Fahrerin ${suffix}.*Lancia`) })
    .click();
  const detail = page.getByRole('region', {
    name: 'Nennung im Detail',
    exact: true,
  });
  if (!(await detail.isVisible()))
    await page
      .getByRole('complementary', { name: 'Nennungsvorschau' })
      .getByRole('button', { name: 'Vollständig öffnen' })
      .click();
  const documents = detail.getByRole('region', {
    name: 'Unterlagen und Zahlung',
  });
  await expect(documents.getByText('Fahrzeugschein')).toBeVisible();
  await expect(documents.getByText('Hochgeladen')).toBeVisible();
  await guestContext.close();
});
