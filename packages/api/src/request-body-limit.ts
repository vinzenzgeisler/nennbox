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

/** Bounds buffered API bodies while allowing the existing 6 MB upload cap plus multipart overhead. */
export const requestBodyLimit: MiddlewareHandler = (c, next) => {
  const path = c.req.path;
  const isUpload =
    path.endsWith('/upload') ||
    path.endsWith('/registration-assets') ||
    path.endsWith('/documents');
  return (isUpload ? uploadBodyLimit : apiBodyLimit)(c, next);
};
