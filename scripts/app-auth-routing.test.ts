import { createServer as createHttpServer } from 'node:http';
import { resolve } from 'node:path';
import { once } from 'node:events';
import { describe, expect, it } from 'vitest';
import { createServer } from 'vite';

describe('Community OIDC login-completion routing', () => {
  it('forwards the authenticated login POST but serves the OIDC callback as SPA HTML', async () => {
    const received: {
      method: string | undefined;
      url: string | undefined;
      authorization: string | undefined;
    }[] = [];
    const api = createHttpServer((request, response) => {
      received.push({
        method: request.method,
        url: request.url,
        authorization: request.headers.authorization,
      });
      response.writeHead(204).end();
    });
    api.listen(0, '127.0.0.1');
    await once(api, 'listening');
    const address = api.address();
    if (!address || typeof address === 'string') throw new Error('No API port');
    const previous = process.env.NENNBOX_API_URL;
    process.env.NENNBOX_API_URL = `http://127.0.0.1:${address.port}`;
    let app: Awaited<ReturnType<typeof createServer>> | undefined;
    try {
      app = await createServer({
        configFile: resolve('packages/app/vite.config.ts'),
        root: resolve('packages/app'),
        logLevel: 'silent',
        server: { host: '127.0.0.1', port: 0, open: false },
      });
      await app.listen();
      const port = (app.httpServer!.address() as { port: number }).port;
      const origin = `http://127.0.0.1:${port}`;
      const login = await fetch(`${origin}/auth/session`, {
        method: 'POST',
        headers: { Authorization: 'Bearer test-token' },
      });
      expect(login.status).toBe(204);
      expect(received).toEqual([
        {
          method: 'POST',
          url: '/auth/session',
          authorization: 'Bearer test-token',
        },
      ]);
      const redemption = await fetch(`${origin}/auth/invitations/redeem`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer invitation-user',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token: 'a'.repeat(43) }),
      });
      expect(redemption.status).toBe(204);
      expect(received[1]).toEqual({
        method: 'POST',
        url: '/auth/invitations/redeem',
        authorization: 'Bearer invitation-user',
      });
      const callback = await fetch(
        `${origin}/auth/callback?code=test&state=test`,
        { headers: { Accept: 'text/html' } },
      );
      expect(callback.status).toBe(200);
      expect(callback.headers.get('content-type')).toContain('text/html');
      expect(received).toHaveLength(2);
    } finally {
      await app?.close();
      api.closeAllConnections();
      await new Promise<void>((done, reject) =>
        api.close((error) => (error ? reject(error) : done())),
      );
      if (previous === undefined) delete process.env.NENNBOX_API_URL;
      else process.env.NENNBOX_API_URL = previous;
    }
  }, 20_000);
});
