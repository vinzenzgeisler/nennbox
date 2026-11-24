import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';

test('admin creates a class, terms and opens its public registration in the UI', async ({
  page,
}) => {
  test.setTimeout(60_000);
  const email = process.env.COMMUNITY_ADMIN_EMAIL ?? 'admin@nennbox.local';
  const password = process.env.COMMUNITY_ADMIN_PASSWORD;
  if (!password) throw new Error('COMMUNITY_ADMIN_PASSWORD is required');

  await page.goto('/app');
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await page.locator('#username').fill(email);
  await page.locator('#password').fill(password);
  await page.locator('#kc-login').click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Nennungen' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Einrichten' }).click();
  // Einrichten preselects the active event; creating a new one is explicit.
  await page.waitForLoadState('networkidle');
  await page
    .getByRole('button', { name: 'Neue Veranstaltung einrichten' })
    .click();
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('');

  const suffix = randomUUID().slice(0, 8);
  const name = `UI Setup ${suffix}`;
  const terms = `Teilnahmebedingungen ${suffix}`;
  await page.getByLabel('Name', { exact: true }).fill(name);
  await page.getByLabel('Beginn').fill('2027-06-01');
  await page.getByLabel('Ende').fill('2027-06-02');
  await page.getByLabel('Klassenname').fill('Motorrad');
  await page.getByLabel('Kürzel', { exact: true }).fill('MOTO');
  await page.getByLabel('Fahrzeugtyp').selectOption('motorcycle');
  await page.getByLabel('Startgeld in Euro').fill('25,50');
  await page.getByLabel('Text der Bedingungen').fill(terms);
  await page.getByLabel('Veranstaltername').fill(`MSC ${suffix}`);
  await page
    .getByLabel('Veranstalteranschrift')
    .fill('Rennweg 1, 12345 Berlin');
  await page.getByLabel('Name des Zahlungsempfängers').fill(`MSC ${suffix}`);
  await page
    .getByLabel('Anschrift des Zahlungsempfängers')
    .fill('Rennweg 1, 12345 Berlin');
  await page.getByLabel('IBAN').fill('DE89370400440532013000');
  await page.getByLabel('BIC (optional)').fill('COBADEFFXXX');
  await page.getByLabel('Anreisehinweise').fill(`Anreise Tor ${suffix}`);
  await page.getByLabel('Fahrerlagerhinweise').fill(`Fahrerlager ${suffix}`);
  const verificationDir = process.env.DESIGN_VERIFICATION_DIR;
  if (verificationDir) {
    for (const [width, height] of [
      [1920, 1080],
      [1440, 900],
      [390, 844],
    ]) {
      if (!width || !height) continue;
      await page.setViewportSize({ width, height });
      await page.evaluate(() => {
        (document.activeElement as HTMLElement | null)?.blur();
        window.scrollTo(0, 0);
      });
      await page.screenshot({
        path: `${verificationDir}/setup-${width}x${height}.png`,
        fullPage: true,
      });
    }
    await page.setViewportSize({ width: 1280, height: 720 });
  }

  await page
    .getByRole('button', { name: 'Speichern und Nennung öffnen' })
    .click();

  await expect(
    page.getByRole('status').filter({
      hasText: 'Veranstaltung gespeichert und Nennung geöffnet.',
    }),
  ).toBeVisible();
  const setupNav = page.getByRole('navigation', {
    name: 'Abschnittsnavigation',
  });
  await setupNav
    .getByRole('link', { name: /Veranstalter und Zahlung/ })
    .click();
  const organizerSettings = page.locator('#event-setup-organizer');
  await expect(
    organizerSettings.getByText('Zahlungsarten für diese Veranstaltung', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    organizerSettings.getByLabel(
      'Online-Zahlungen bei Absage automatisch erstatten',
    ),
  ).toBeVisible();
  await organizerSettings.getByLabel('Karte', { exact: true }).check();
  await organizerSettings
    .getByRole('button', {
      name: 'Zahlungseinstellungen speichern',
      exact: true,
    })
    .click();
  await expect(
    organizerSettings.getByText('Zahlungseinstellungen gespeichert.', {
      exact: true,
    }),
  ).toBeVisible();
  if (verificationDir) {
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.screenshot({
        path: `${verificationDir}/payment-settings-${width}.png`,
        fullPage: true,
      });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
    }
    await page.setViewportSize({ width: 1280, height: 720 });
  }
  await setupNav.getByRole('link', { name: /Formularfelder/ }).click();
  await expect(page.locator('#event-setup-form-fields')).not.toContainText(
    'Zahlungsarten',
  );
  await expect(organizerSettings).not.toBeVisible();
  await setupNav
    .getByRole('link', { name: /Startnummern & Warteliste/ })
    .click();
  const numberSettings = page.getByRole('region', {
    name: 'Startnummern & Warteliste',
  });
  await expect(numberSettings).toBeVisible();
  await numberSettings
    .getByRole('button', { name: 'Nummernbereich hinzufügen' })
    .click();
  await numberSettings
    .getByLabel('Gilt für')
    .selectOption({ label: 'Motorrad' });
  await numberSettings.getByLabel('Von').fill('10');
  await numberSettings.getByLabel('Bis').fill('20');
  await numberSettings.getByLabel('Reserviert (Komma-getrennt)').fill('10');
  await numberSettings.getByLabel('Vergabe').selectOption('driver_choice');
  await numberSettings
    .getByLabel('Bei freiem Platz automatisch nachrücken lassen')
    .check();
  await numberSettings.getByLabel('Bestätigungsfrist (Stunden)').fill('24');
  await numberSettings
    .getByRole('button', { name: 'Speichern', exact: true })
    .click();
  await expect(numberSettings.getByRole('status')).toContainText(
    'Einstellungen gespeichert.',
  );
  await numberSettings
    .getByRole('button', { name: 'Alle offenen Nummern vergeben' })
    .click();
  await expect(numberSettings.getByRole('status')).toContainText(
    'keine offenen Nummern',
  );
  for (const [width, height] of [
    [1920, 1080],
    [1440, 900],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => {
      (document.activeElement as HTMLElement | null)?.blur();
      window.scrollTo(0, 0);
    });
    if (width === 390) {
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
      const activeLink = setupNav.locator('a[aria-current="true"]');
      const navBox = await setupNav.boundingBox();
      const linkBox = await activeLink.boundingBox();
      expect(navBox && linkBox && linkBox.x < navBox.x + navBox.width).toBe(
        true,
      );
    }
    if (verificationDir)
      await page.screenshot({
        path: `${verificationDir}/numbers-waitlist-${width}x${height}.png`,
        fullPage: true,
      });
  }
  await page.setViewportSize({ width: 1280, height: 720 });
  await setupNav.getByRole('link', { name: /Veranstaltung$/ }).click();
  const publicLink = page.getByRole('link', { name: /\/events\/.*\/register/ });
  await expect(publicLink).toBeVisible();
  const url = await publicLink.getAttribute('href');
  expect(url).toBeTruthy();
  if (!url) throw new Error('public registration link was not provided');

  await page
    .getByLabel('Gespeicherte Veranstaltung bearbeiten')
    .selectOption({ label: name });
  await expect(page.getByLabel('Veranstaltername')).toHaveValue(
    `MSC ${suffix}`,
  );
  await expect(page.getByLabel('IBAN')).toHaveValue('DE89370400440532013000');
  await expect(page.getByLabel('Anschrift des Zahlungsempfängers')).toHaveValue(
    'Rennweg 1, 12345 Berlin',
  );
  await expect(page.getByLabel('BIC (optional)')).toHaveValue('COBADEFFXXX');
  await expect(page.getByLabel('Veranstalteranschrift')).toHaveValue(
    'Rennweg 1, 12345 Berlin',
  );

  await expect(page.getByLabel('Anreisehinweise')).toHaveValue(
    `Anreise Tor ${suffix}`,
  );
  // Configure the standard field in Einrichten. The live preview uses the
  // same participant field component and updates before the change is saved.
  await page
    .getByRole('navigation', { name: 'Abschnittsnavigation' })
    .getByRole('link', { name: 'Formularfelder' })
    .click();
  await expect(
    page.getByRole('heading', { level: 2, name: 'Formularfelder' }),
  ).toBeVisible();
  await page
    .getByRole('radiogroup', { name: 'Blutgruppe' })
    .getByRole('radio', { name: 'Pflicht' })
    .check();
  await expect(
    page
      .getByRole('region', { name: 'Live-Vorschau · Nennformular' })
      .getByLabel('Blutgruppe'),
  ).toHaveAttribute('required', '');
  await page.getByRole('button', { name: 'Änderungen speichern' }).click();
  await expect(
    page
      .getByRole('region', { name: 'Veranstaltung einrichten' })
      .getByRole('status'),
  ).toContainText('Einstellungen gespeichert.');
  if (verificationDir) {
    for (const [width, height] of [
      [1920, 1080],
      [1440, 900],
      [390, 844],
    ]) {
      await page.setViewportSize({ width, height });
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({
        path: `${verificationDir}/fields-setup-${width}.png`,
        fullPage: true,
      });
    }
    await page.setViewportSize({ width: 1280, height: 720 });
  }
  await page.goto(url);
  await expect(page.getByRole('heading', { name })).toBeVisible();
  await expect(page.getByText(`Anreise Tor ${suffix}`)).toBeVisible();
  await expect(page.getByText('Rennweg 1, 12345 Berlin')).toBeVisible();
  await expect(page.getByText(`Fahrerlager ${suffix}`)).toBeVisible();
  await expect(page.getByText('DE89370400440532013000')).toHaveCount(0);
  if (verificationDir) {
    for (const [width, height] of [
      [1920, 1080],
      [1440, 900],
      [390, 844],
    ]) {
      if (!width || !height) continue;
      await page.setViewportSize({ width, height });
      await page.evaluate(() => {
        (document.activeElement as HTMLElement | null)?.blur();
        window.scrollTo(0, 0);
      });
      await page.screenshot({
        path: `${verificationDir}/public-${width}x${height}.png`,
        fullPage: true,
      });
    }
    await page.setViewportSize({ width: 1280, height: 720 });
  }

  await page.getByLabel('Vorname').fill(`UI${suffix}`);
  await page.getByLabel('Nachname').fill('Setup');
  await page
    .getByLabel('Kontakt-E-Mail')
    .fill(`participant-${suffix}@example.test`);
  await page.getByLabel('Geburtsdatum').fill('1990-12-10');
  await page.getByLabel('Telefon', { exact: true }).fill('+49 151 1234567');
  await expect(page.getByLabel('Blutgruppe')).toHaveAttribute('required', '');
  await page.getByRole('button', { name: 'Weiter zu Startmeldungen' }).click();
  await expect(page.getByLabel('Blutgruppe')).toBeVisible();
  await page.getByLabel('Blutgruppe').selectOption('0-');
  await page.getByRole('button', { name: 'Weiter zu Startmeldungen' }).click();
  await page.getByLabel('Klasse').selectOption({ label: 'Motorrad (MOTO)' });
  await expect(page.getByLabel('Wunsch-Startnummer')).toBeVisible();
  await page.getByLabel('Wunsch-Startnummer').fill('11');
  await page.getByLabel('Hersteller').fill('Honda');
  await page.getByLabel('Modell').fill('CB500');
  await page.getByRole('button', { name: 'Weiter zur Prüfung' }).click();
  await expect(page.getByText(terms)).toBeVisible();
  const consent = page.getByRole('checkbox');
  await expect(consent).toBeVisible();
  await consent.check();
  await page.getByRole('button', { name: 'Weiter zur Zahlung' }).click();
  await page.getByLabel('Später bezahlen').check();
  const submission = page.waitForResponse((response) =>
    response.url().includes('/registration/submissions'),
  );
  await page.getByRole('button', { name: 'Nennung absenden' }).click();
  const submissionResponse = await submission;
  expect(submissionResponse.status(), await submissionResponse.text()).toBe(
    202,
  );
  await expect(page.getByRole('status')).toContainText(
    'Nennung eingegangen. Bitte bestätige die E-Mail-Adresse über den zugesandten Link.',
  );
  await page.goto('/app');
  await page
    .getByRole('combobox', { name: 'Veranstaltung' })
    .selectOption({ label: name });
  const row = page.getByRole('row').filter({ hasText: `UI${suffix} Setup` });
  await expect(row).toBeVisible();
  await row.locator('button[data-entry-action]').dblclick();
  const detail = page.getByRole('region', {
    name: 'Nennung im Detail',
    exact: true,
  });
  await expect(detail).toBeVisible();
  await expect(detail).toContainText('0-');
  if (verificationDir) {
    for (const [width, height] of [
      [1920, 1080],
      [1440, 900],
      [390, 844],
    ]) {
      await page.setViewportSize({ width, height });
      // The shell closes an open detail while its layout settles, and docked
      // widths open the preview first; open the detail again until it stays.
      await expect(async () => {
        if (!(await detail.isVisible())) {
          const full = page.getByRole('button', { name: 'Nennung öffnen' });
          if (await full.isVisible()) await full.click();
          else await row.locator('button[data-entry-action]').dblclick();
        }
        await expect(detail).toContainText('0-', { timeout: 1_000 });
        await page.waitForTimeout(400);
        await expect(detail).toContainText('0-', { timeout: 1_000 });
      }).toPass();
      await page.screenshot({
        path: `${verificationDir}/fields-detail-${width}.png`,
        fullPage: true,
      });
    }
  }
});
