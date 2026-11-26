import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Reuse the Community stack's generated administrator and local-operator fixtures.
// COMMUNITY_STATE_DIR can point to a running checkout when testing a worktree.
const stateDir =
  process.env.COMMUNITY_STATE_DIR ??
  resolve(import.meta.dirname, '../../../.community-local');
function credentials() {
  const fromEnv = {
    email: process.env.COMMUNITY_ADMIN_EMAIL,
    password: process.env.COMMUNITY_ADMIN_PASSWORD,
    operatorPassword: process.env.KC_BOOTSTRAP_ADMIN_PASSWORD,
  };
  if (fromEnv.email && fromEnv.password && fromEnv.operatorPassword)
    return fromEnv as Record<keyof typeof fromEnv, string>;
  const config = JSON.parse(
    readFileSync(resolve(stateDir, 'config.json'), 'utf8'),
  ) as Record<keyof typeof fromEnv, string>;
  return {
    email: fromEnv.email ?? config.email,
    password: fromEnv.password ?? config.password,
    operatorPassword: fromEnv.operatorPassword ?? config.operatorPassword,
  };
}
async function login(page: Page, email: string, password: string) {
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
  await page.locator('#username').fill(email);
  await page.locator('#password').fill(password);
  await page.locator('#kc-login').click();
}
async function teamSettings(page: Page) {
  await page
    .getByRole('button', { name: 'Einstellungen', exact: true })
    .click();
  await page.getByRole('link', { name: 'Team', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Team', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Person einladen' }),
  ).toBeVisible();
}
async function invitationLink(request: APIRequestContext, email: string) {
  const base =
    process.env.NENNBOX_MAILPIT_URL ??
    process.env.COMMUNITY_MAILPIT_BASE_URL ??
    'http://127.0.0.1:8025';
  let link = '';
  await expect
    .poll(
      async () => {
        const response = await request.get(`${base}/api/v1/messages`);
        const list = (await response.json()) as { messages?: { ID: string }[] };
        for (const item of list.messages ?? []) {
          if (!JSON.stringify(item).includes(email)) continue;
          const message = await request.get(
            `${base}/api/v1/message/${item.ID}`,
          );
          const body = (await message.json()) as {
            Text?: string;
            HTML?: string;
          };
          link =
            `${body.Text ?? ''}\n${body.HTML ?? ''}`.match(
              /https?:\/\/[^\s"<>]*\/invitation#token=[A-Za-z0-9_-]{43}/,
            )?.[0] ?? '';
          if (link) return true;
        }
        return false;
      },
      { timeout: 60_000 },
    )
    .toBe(true);
  // Keep the fixture's token while targeting this test's app, not an old preview host.
  const url = new URL(link);
  return `${url.pathname}${url.hash}`;
}

test('team invitation requires explicit acceptance; role changes and deactivation revoke access', async ({
  page,
  browser,
  request,
}) => {
  test.setTimeout(180_000);
  const fixture = credentials();
  const email = `team-e2e-${Date.now()}@example.test`;
  const password = randomBytes(24).toString('base64url');
  const config = await request.get('/auth/config');
  const { oidc } = (await config.json()) as { oidc: { issuerUrl: string } };
  const issuer = new URL(oidc.issuerUrl);
  const realm = issuer.pathname.split('/realms/')[1]!;
  const operator = await request.post(
    `${issuer.origin}/realms/master/protocol/openid-connect/token`,
    {
      form: {
        grant_type: 'password',
        client_id: 'admin-cli',
        username: 'local-operator',
        password: fixture.operatorPassword,
      },
    },
  );
  expect(operator.ok()).toBe(true);
  const operatorToken = ((await operator.json()) as { access_token: string })
    .access_token;
  const users = `${issuer.origin}/admin/realms/${realm}/users`;
  const headers = { Authorization: `Bearer ${operatorToken}` };
  const created = await request.post(users, {
    headers,
    data: {
      username: email,
      email,
      emailVerified: true,
      enabled: true,
      firstName: 'Team',
      lastName: 'Browserprüfung',
      credentials: [{ type: 'password', value: password, temporary: false }],
    },
  });
  expect(created.status()).toBe(201);
  const userUrl = created.headers().location!;
  const invitee = await browser.newContext();
  const invited = await invitee.newPage();
  try {
    await page.goto('/app');
    await login(page, fixture.email, fixture.password);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Nennungen' }),
    ).toBeVisible({ timeout: 60_000 });
    await teamSettings(page);
    await page.getByRole('button', { name: 'Person einladen' }).click();
    let dialog = page.getByRole('dialog');
    await dialog.getByRole('textbox', { name: 'E-Mail-Adresse' }).fill(email);
    await expect(
      dialog.getByRole('radio', { name: /Nur lesen/ }),
    ).toBeChecked();
    await dialog
      .getByRole('button', { name: 'Einladung senden', exact: true })
      .click();
    await expect(
      page.getByText('Einladung wurde gesendet.', { exact: true }),
    ).toBeVisible();
    const link = await invitationLink(request, email);
    const effects: string[] = [];
    invited.on('request', (req) => {
      if (
        req.method() === 'POST' &&
        /\/auth\/(session|invitations\/redeem)$/.test(
          new URL(req.url()).pathname,
        )
      )
        effects.push(new URL(req.url()).pathname);
    });
    await invited.goto(new URL(link, page.url()).href);
    await expect(
      invited.getByText('NENNBOX · Vorläufige Einladungsseite'),
    ).toBeVisible();
    expect(new URL(invited.url()).hash).toBe('');
    expect(effects).toEqual([]);
    await login(invited, email, password);
    await expect(
      invited.getByRole('button', { name: 'Einladung annehmen', exact: true }),
    ).toBeVisible({ timeout: 60_000 });
    expect(effects).toEqual([]);
    await invited
      .getByRole('button', { name: 'Einladung annehmen', exact: true })
      .click();
    await expect(
      invited.getByText('Die Einladung wurde angenommen.', { exact: true }),
    ).toBeVisible();
    expect(effects).toEqual(['/auth/invitations/redeem', '/auth/session']);
    await invited.getByRole('link', { name: 'Zur Anwendung' }).click();
    await expect(
      invited.getByRole('heading', { level: 1, name: 'Nennungen' }),
    ).toBeVisible();
    await page.reload();
    await teamSettings(page);
    const member = page.getByRole('listitem').filter({ hasText: email });
    await expect(member).toContainText('Nur lesen');
    await member.getByRole('button', { name: /^Aktionen für/ }).click();
    await member.getByRole('menuitem', { name: 'Rolle ändern' }).click();
    dialog = page.getByRole('dialog');
    await dialog.getByRole('radio', { name: /Nennbüro/ }).check();
    await dialog.getByRole('button', { name: 'Rolle speichern' }).click();
    await expect(member).toContainText('Nennbüro');
    await member.getByRole('button', { name: /^Aktionen für/ }).click();
    await member.getByRole('menuitem', { name: 'Deaktivieren' }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Deaktivieren', exact: true })
      .click();
    await expect(member).toContainText('Deaktiviert');
    // Assert the disabled user's existing token loses API access immediately.
    const response = invited.waitForResponse(
      (res) =>
        new URL(res.url()).pathname.startsWith('/admin/') &&
        [401, 403].includes(res.status()),
    );
    await invited.reload();
    expect([401, 403]).toContain((await response).status());
  } finally {
    await invitee.close();
    const deleted = await request.delete(userUrl, { headers });
    expect(deleted.ok()).toBe(true);
  }
});
