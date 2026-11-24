import { expect, test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

for (const width of [1440, 1024, 390]) {
  test(`detail tabs and action rail at ${width}px`, async ({ browser }) => {
    test.setTimeout(90_000);
    const context = await browser.newContext({
      viewport: { width, height: 1000 },
      isMobile: width === 390,
      hasTouch: width === 390,
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
    let navigations = 0;
    page.on('framenavigated', () => navigations++);
    const tabs = detail.getByRole('tab');
    await expect(tabs).toHaveCount(4);
    await tabs.first().focus();
    for (const [key, index] of [
      ['ArrowLeft', 3],
      ['ArrowRight', 0],
      ['End', 3],
      ['Home', 0],
      ['ArrowRight', 1],
    ] as const) {
      await page.keyboard.press(key);
      await expect(tabs.nth(index)).toBeFocused();
      await expect(tabs.nth(index)).toHaveAttribute('aria-selected', 'true');
      const panel = detail.getByRole('tabpanel');
      await expect(panel).toHaveCount(1);
      await expect(panel).toHaveAttribute(
        'aria-labelledby',
        (await tabs.nth(index).getAttribute('id')) as string,
      );
    }
    await page.keyboard.press('Tab');
    await expect(detail.getByRole('tabpanel')).toBeFocused();
    await tabs.first().click();
    await expect(detail.getByRole('tabpanel')).toContainText('Fahrer');
    expect(navigations).toBe(0);
    const actions = detail.locator('.nb-entry-sidebar-actions');
    const destructive = actions.locator('.nb-entry-danger-actions');
    await expect(destructive).toBeVisible();
    expect(
      await actions
        .locator('button')
        .evaluateAll((buttons) =>
          buttons.every((button) =>
            button.querySelector('svg[aria-hidden=true]'),
          ),
        ),
    ).toBe(true);
    const reject = destructive.getByRole('button', {
      name: 'Ablehnen …',
      exact: true,
    });
    if (await reject.count()) {
      await reject.click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).not.toBeVisible();
      await expect(detail).toBeVisible();
    }
    await destructive
      .getByRole('button', { name: 'Nennung löschen …' })
      .click();
    await expect(
      page.getByRole('dialog', { name: 'Nennung löschen', exact: true }),
    ).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(detail).toBeVisible();
    const summary = detail.locator('.nb-entry-header-actions summary').first();
    await summary.click();
    await page.keyboard.press('Escape');
    await expect(summary.locator('..')).not.toHaveAttribute('open', '');
    await tabs.first().focus();
    const metrics = await page.evaluate(() => {
      const actions = document.querySelector('.nb-entry-sidebar-actions')!;
      const heading = actions.querySelector('h2')!.getBoundingClientRect();
      const group = actions
        .querySelector('.nb-action-group')!
        .getBoundingClientRect();
      return {
        innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        headingToGroup: group.top - heading.bottom,
      };
    });
    expect(metrics.innerWidth).toBe(width);
    expect(metrics.scrollWidth).toBeLessThanOrEqual(width);
    expect(metrics.headingToGroup).toBeLessThanOrEqual(16);
    expect(errors).toEqual([]);
    const evidence = process.env.NENNBOX_DESIGN_EVIDENCE;
    if (evidence) {
      mkdirSync(evidence, { recursive: true });
      await page.screenshot({
        path: `${evidence}/detail-${width}.png`,
        fullPage: true,
      });
      writeFileSync(
        `${evidence}/metrics-${width}.json`,
        JSON.stringify(metrics),
      );
    }
    if (width === 390) {
      await destructive
        .getByRole('button', { name: 'Nennung löschen …' })
        .click();
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
    }
    await context.close();
  });
}
