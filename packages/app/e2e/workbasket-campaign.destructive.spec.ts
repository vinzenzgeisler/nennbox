import { expect, test } from '@playwright/test';

test.use({
  launchOptions: {
    args: ['--disable-gpu', '--renderer-process-limit=1'],
  },
});

// Confirms a campaign against shared demo entries; run after read-only specs.
for (const width of [1440]) {
  test(`workbasket campaign sends and reports at ${width}px`, async ({
    browser,
  }) => {
    test.setTimeout(180_000);
    const context = await browser.newContext({
      viewport: { width, height: 900 },
      isMobile: width === 390,
      hasTouch: width === 390,
    });
    const page = await context.newPage();
    const errors: string[] = [];
    const responses: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('response', (response) => {
      if (response.status() >= 400)
        responses.push(
          `${response.status()} ${new URL(response.url()).pathname}`,
        );
    });
    try {
      await page.goto(`${process.env.NENNBOX_APP_URL}/app`);
      await page.getByRole('button', { name: 'Anmelden' }).click();
      await page
        .locator('#username')
        .fill(process.env.COMMUNITY_ADMIN_EMAIL ?? 'admin@nennbox.local');
      await page
        .locator('#password')
        .fill(process.env.COMMUNITY_ADMIN_PASSWORD!);
      await page.locator('#kc-login').click();
      await expect(
        page.getByRole('heading', { level: 1, name: 'Nennungen' }),
      ).toBeVisible({ timeout: 60_000 });
      await page
        .getByRole('combobox', { name: 'Veranstaltung' })
        .selectOption({ label: 'Historischer Bergpreis 2027' });
      await page
        .getByRole('button', { name: 'Übersicht', exact: true })
        .click();
      const basket = page.getByRole('region', {
        name: 'Heute zu tun',
        exact: true,
      });
      await expect(basket).toBeVisible();
      const filters = basket.getByRole('navigation', {
        name: 'Aufgaben nach Regel filtern',
      });
      await expect(filters).toBeVisible({ timeout: 60_000 });
      const evidence = process.env.WORKBASKET_EVIDENCE;
      const documentsFilter = filters.getByRole('button', {
        name: /^Fehlende Unterlagen/,
      });
      await documentsFilter.click();
      await expect(documentsFilter).toHaveAttribute('aria-pressed', 'true');
      await filters.getByRole('button', { name: /^Alle Aufgaben/ }).click();
      const firstTask = basket.locator('.nb-workbasket-task').first();
      await expect(firstTask).toBeVisible();
      await expect(
        firstTask.locator('.nb-workbasket-identity strong'),
      ).not.toBeEmpty();
      await expect(firstTask.locator('.nb-workbasket-detail')).toContainText(
        'Doppelt mit Nennung',
      );
      const campaigns: string[] = [];
      page.on('request', (request) => {
        if (request.method() === 'POST' && request.url().endsWith('/campaigns'))
          campaigns.push(request.url());
      });
      await basket
        .getByRole('button', { name: /^Unterlagen anfordern \(\d+\)$/ })
        .click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      await dialog
        .getByRole('textbox', { name: 'Betreff' })
        .fill(`Arbeitskorb-Smoke ${width}`);
      await expect(
        dialog.getByRole('button', { name: /^Jetzt an/ }),
      ).toHaveCount(0);
      await dialog.getByRole('button', { name: 'Vorschau erstellen' }).click();
      await expect(
        dialog.getByRole('heading', { name: /Verbindliche Empfängervorschau/ }),
      ).toBeVisible();
      expect(campaigns).toEqual([]);
      expect(
        await dialog.evaluate(
          (element) => element.scrollWidth <= element.clientWidth,
        ),
      ).toBe(true);
      if (evidence)
        await page.screenshot({ path: `${evidence}/reminder-${width}.png` });
      await page.keyboard.press('Escape');
      await expect(dialog).not.toBeVisible();
      if (width === 1440) {
        await basket
          .getByRole('button', { name: /^Unterlagen anfordern \(\d+\)$/ })
          .click();
        await dialog.getByRole('button', { name: /^Jetzt an/ }).click();
        await expect(
          dialog.getByRole('heading', { name: 'Versandergebnis', exact: true }),
        ).toBeVisible();
        expect(campaigns).toHaveLength(1);
        await expect(
          dialog.getByRole('group', { name: 'Versand je Empfänger' }),
        ).toBeVisible();
        await dialog
          .getByRole('button', { name: 'Versandstatus aktualisieren' })
          .click();
        if (evidence)
          await page.screenshot({ path: `${evidence}/result-${width}.png` });
        await page.keyboard.press('Escape');
        await expect(dialog).not.toBeVisible();
      }
      expect(errors).toEqual([]);
      expect(responses).toEqual([]);
    } finally {
      await context.close();
    }
  });
}
