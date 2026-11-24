import { expect, test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

test.use({
  launchOptions: {
    args: [
      '--disable-gpu',
      '--renderer-process-limit=1',
      '--single-process',
      '--no-zygote',
    ],
  },
});

for (const width of [1440, 1024, 390]) {
  test(`workbasket is usable at ${width}px`, async ({ browser }) => {
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
      await expect(
        basket.getByRole('combobox', { name: 'Aufgaben filtern' }),
      ).toBeVisible({ timeout: 60_000 });
      const filter = basket.getByRole('combobox', { name: 'Aufgaben filtern' });
      await filter.selectOption('missingDocuments');
      await expect(filter).toHaveValue('missingDocuments');
      await filter.selectOption('');
      await expect(basket.locator('.nb-workbasket-task').first()).toBeVisible();
      await expect(basket.locator('.nb-workbasket-task').first()).toContainText(
        'Betroffene Datenfelder:',
      );
      const measurements = await page.evaluate(() => ({
        innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: document.documentElement.clientWidth,
        touch: navigator.maxTouchPoints,
      }));
      expect(measurements.innerWidth).toBe(width);
      expect(measurements.documentWidth).toBeLessThanOrEqual(width);
      const evidence = process.env.WORKBASKET_EVIDENCE;
      if (evidence) {
        mkdirSync(evidence, { recursive: true });
        await page.screenshot({
          path: `${evidence}/overview-${width}.png`,
          fullPage: true,
        });
        writeFileSync(
          `${evidence}/metrics-${width}.json`,
          JSON.stringify(measurements, null, 2),
        );
      }
      const open = basket
        .getByRole('button', { name: 'Nennung öffnen', exact: true })
        .first();
      await open.focus();
      await page.keyboard.press('Enter');
      await expect(
        page.getByRole('region', { name: 'Nennung im Detail', exact: true }),
      ).toBeVisible();
      if (evidence)
        await page.screenshot({
          path: `${evidence}/detail-${width}.png`,
          fullPage: true,
        });
      expect(errors).toEqual([]);
      expect(responses).toEqual([]);
    } finally {
      await context.close();
    }
  });
}
