import { bodyLimit } from 'hono/body-limit';
import type { MiddlewareHandler } from 'hono';

const API_BODY_LIMIT_BYTES = 1_000_000;
const UPLOAD_BODY_LIMIT_BYTES = 7_000_000;

const apiBodyLimit = bodyLimit({
  maxSize: API_BODY_LIMIT_BYTES,
  onError: (c) => c.json({ error: 'Request body too large' }, 413),
});
const uploadBodyLimit = bodyLimit({
  maxSize: UPLOAD_BODY_LIMIT_BYTES,
  onError: (c) => c.json({ error: 'Upload too large' }, 413),
});

// Keep this list explicit: suffix checks miss valid routes such as message attachments.
const UPLOAD_ROUTES = [
  /^\/admin\/entries\/[^/]+\/documents$/,
  /^\/admin\/organization\/registration-assets$/,
  /^\/public\/organizations\/[^/]+\/events\/[^/]+\/registration\/custom-fields\/[^/]+\/upload$/,
  /^\/admin\/events\/[^/]+\/messages\/attachments$/,
];

/** Bounds buffered API bodies while allowing uploads up to 6 MB plus multipart overhead. */
export const requestBodyLimit: MiddlewareHandler = (c, next) => {
  const isUpload =
    c.req.method === 'POST' &&
    UPLOAD_ROUTES.some((route) => route.test(c.req.path));
  return (isUpload ? uploadBodyLimit : apiBodyLimit)(c, next);
};
