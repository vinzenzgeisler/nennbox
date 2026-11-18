import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { requestBodyLimit } from './request-body-limit.js';

describe('request body limits', () => {
  const app = () => {
    const app = new Hono();
    app.use('*', requestBodyLimit);
    app.post('*', async (c) => c.json({ size: (await c.req.text()).length }));
    return app;
  };

  it('rejects API bodies above one megabyte before route parsing', async () => {
    const response = await app().request('/admin/events', {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: 'x'.repeat(1_000_001),
    });
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: 'Request body too large' });
  });

  it('allows upload multipart overhead within seven megabytes', async () => {
    const response = await app().request('/admin/entries/123/documents', {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: 'x'.repeat(1_000_001),
    });
    expect(response.status).toBe(200);
  });

  it('rejects upload bodies above seven megabytes', async () => {
    const response = await app().request('/admin/entries/123/documents', {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: 'x'.repeat(7_000_001),
    });
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: 'Upload too large' });
  });
});
