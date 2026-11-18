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

  const multipartRoutes = [
    '/admin/entries/123/documents',
    '/admin/organization/registration-assets',
    '/public/organizations/org-1/events/summer/registration/custom-fields/photo/upload',
  ];

  it.each(multipartRoutes)('allows multipart upload overhead at %s', async (path) => {
    const response = await app().request(path, {
      method: 'POST',
      headers: { 'content-type': 'multipart/form-data; boundary=----test' },
      body: `------test\r\nContent-Disposition: form-data; name="file"\r\n\r\n${'x'.repeat(1_000_001)}\r\n------test--\r\n`,
    });
    expect(response.status).toBe(200);
  });

  it('allows JSON message attachments above the generic API body limit', async () => {
    const response = await app().request('/admin/events/123/messages/attachments', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ contentBase64: 'x'.repeat(1_000_001) }),
    });
    expect(response.status).toBe(200);
  });

  it('rejects non-upload API bodies above one megabyte', async () => {
    const response = await app().request('/admin/events/123/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'x'.repeat(1_000_001),
    });
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: 'Request body too large' });
  });

  it.each([
    '/admin/entries/123/documents',
    '/admin/organization/registration-assets',
    '/public/organizations/org-1/events/summer/registration/custom-fields/photo/upload',
    '/admin/events/123/messages/attachments',
  ])('rejects upload bodies above seven megabytes at %s', async (path) => {
    const response = await app().request(path, {
      method: 'POST',
      headers: { 'content-type': 'multipart/form-data; boundary=----test' },
      body: 'x'.repeat(7_000_001),
    });
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: 'Upload too large' });
  });
});
