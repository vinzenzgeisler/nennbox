import { expect, test } from '@playwright/test';

for (const width of [1440, 390]) {
  test(`provisional invitation requires explicit consent at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const token = 'a'.repeat(43);
    await page.addInitScript(() => {
      sessionStorage.setItem(
        'oidc.user:https://identity.example.test/realm:nennbox-app',
        JSON.stringify({
          access_token: 'browser-fixture',
          token_type: 'Bearer',
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          profile: { sub: 'invited', name: 'Eva Beispiel' },
        }),
      );
    });
    await page.route('**/auth/config', (route) =>
      route.fulfill({
        json: {
          oidc: {
            issuerUrl: 'https://identity.example.test/realm',
            clientId: 'nennbox-app',
            redirectUri: 'https://app.example.test/auth/callback',
          },
        },
      }),
    );
    const effects: string[] = [];
    await page.route('**/auth/invitations/redeem', async (route) => {
      expect(route.request().method()).toBe('POST');
      expect(route.request().postDataJSON()).toEqual({ token });
      expect(route.request().headers().authorization).toBe(
        'Bearer browser-fixture',
      );
      effects.push('redeem');
      await route.fulfill({ status: 204 });
    });
    await page.route('**/auth/session', async (route) => {
      effects.push('session');
      await route.fulfill({ status: 204 });
    });
    await page.goto(`/invitation#token=${token}`);
    await expect(page.getByText(/Angemeldet als Eva Beispiel/)).toBeVisible();
    expect(new URL(page.url()).hash).toBe('');
    expect(effects).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    if (process.env.TEAM_EVIDENCE)
      await page.screenshot({
        path: `${process.env.TEAM_EVIDENCE}/invitation-${width}.png`,
      });
    await page
      .getByRole('button', { name: 'Einladung annehmen', exact: true })
      .click();
    await expect(
      page.getByText('Die Einladung wurde angenommen.', { exact: true }),
    ).toBeVisible();
    expect(effects).toEqual(['redeem', 'session']);
    await expect(
      page.getByRole('link', { name: 'Zur Anwendung' }),
    ).toHaveAttribute('href', '/app');
  });
}
