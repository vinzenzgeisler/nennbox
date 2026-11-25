import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';

test('reference entry list, embedded preview and selection interactions', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/app');
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await page
    .locator('#username')
    .fill(process.env.COMMUNITY_ADMIN_EMAIL ?? 'admin@nennbox.local');
  await page.locator('#password').fill(process.env.COMMUNITY_ADMIN_PASSWORD!);
  await page.locator('#kc-login').click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Nennungen' }),
  ).toBeVisible();
  // Other specs create one-entry events; the visual fixture needs the seeded multi-entry event.
  await page
    .getByRole('combobox', { name: 'Veranstaltung' })
    .selectOption({ label: 'Historischer Bergpreis 2027' });
  const rows = page.locator('.nb-entry-list-row');
  await expect(rows.first()).toBeVisible();
  // Switching events deliberately clears the old preview; select this fixture's first entry.
  await rows.first().locator('[data-entry-action]').click();
  const preview = page.locator('.nb-preview-panel');
  await expect(
    preview.getByRole('heading', { name: 'Bis zur Zulassung' }),
  ).toBeVisible();
  const target = rows.nth(1);
  await target.locator('[data-entry-action]').click();
  await expect(target).toHaveClass(/is-selected/);
  const status = target.locator('.nb-entry-status-menu');
  await status.locator('summary').click();
  await page.keyboard.press('Escape');
  await expect(status).not.toHaveAttribute('open', '');
  await expect(preview).toBeVisible();
  await target.hover();
  await target.getByRole('checkbox').check();
  await expect(
    page.getByRole('region', { name: 'Massenaktionen' }),
  ).toBeVisible();
  const evidence = process.env.NENNBOX_DESIGN_EVIDENCE;
  if (evidence) {
    mkdirSync(evidence, { recursive: true });
    await page.screenshot({ path: `${evidence}/selection-1440.png` });
  }
  await page
    .getByRole('button', { name: 'Auswahl aufheben', exact: true })
    .click();
  await target.locator('[data-entry-action]').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.nb-entry-page')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.nb-entry-page')).not.toBeVisible();
  await rows.first().locator('[data-entry-action]').click();
  if (evidence) await page.screenshot({ path: `${evidence}/preview-1440.png` });
  await page.keyboard.press('Control+k');
  await expect(
    page.getByRole('dialog', { name: 'Suchen und springen' }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(preview).toBeVisible();
});
