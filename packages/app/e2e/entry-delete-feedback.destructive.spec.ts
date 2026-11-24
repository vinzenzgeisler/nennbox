import { expect, test } from '@playwright/test';

// Destructive: really deletes the newest entry of the shared demo event. The Playwright project
// "destructive" runs this file only after every other spec has finished, because those specs read
// the same rows at the same time (a deleted row answers 404 while another spec has it open).
test('deleting an entry confirms and reports back at 390px', async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const context = await browser.newContext({
    viewport: { width: 390, height: 1000 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('response', (response) => {
    if (response.status() >= 400)
      errors.push(`${response.status()} ${response.url()}`);
  });
  await page.goto(process.env.NENNBOX_APP_URL! + '/app');
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
  await page.locator('#username').fill(process.env.COMMUNITY_ADMIN_EMAIL!);
  await page.locator('#password').fill(process.env.COMMUNITY_ADMIN_PASSWORD!);
  await page.locator('#kc-login').click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Nennungen', exact: true }),
  ).toBeVisible({ timeout: 15_000 });
  const row = page.locator('.nb-entry-list-row').first();
  await expect(row).toBeVisible();
  await row.locator('[data-entry-action]').dblclick();
  const detail = page.locator('.nb-entry-page');
  await expect(detail).toBeVisible();
  const destructive = detail
    .locator('.nb-entry-sidebar-actions')
    .locator('.nb-entry-danger-actions');
  await destructive.getByRole('button', { name: 'Nennung löschen …' }).click();
  const dialog = page.getByRole('dialog', {
    name: 'Nennung löschen',
    exact: true,
  });
  await dialog
    .getByRole('textbox')
    .fill('Isolierter UX-Smoke: Bestätigung und Rückmeldung');
  await dialog
    .getByRole('button', { name: 'Nennung löschen', exact: true })
    .click();
  await expect(detail).not.toBeVisible();
  await expect(page.getByRole('status')).toContainText('Nennung gelöscht');
  expect(errors).toEqual([]);
  await context.close();
});
