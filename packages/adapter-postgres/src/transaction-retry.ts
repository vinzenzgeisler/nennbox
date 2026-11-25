/** PostgreSQL aborted the transaction because of a lock cycle (40P01) or a serialization conflict (40001). */
export function isRetryableConflict(error: unknown): boolean {
  for (
    let current: unknown = error, depth = 0;
    current && typeof current === 'object' && depth < 5;
    current = (current as { cause?: unknown }).cause, depth += 1
  ) {
    const code = (current as { code?: unknown }).code;
    if (code === '40P01' || code === '40001') return true;
  }
  return false;
}

/** The change kept colliding with another one; nothing was changed, the caller may try again. */
export class ConcurrentUpdateError extends Error {
  constructor() {
    super('concurrent_update');
    this.name = 'ConcurrentUpdateError';
  }
}

/**
 * Runs a whole transaction again when PostgreSQL aborts it as a deadlock victim.
 * Everything the transaction did was rolled back, so repeating it is safe. The
 * lock order (see `lockInvoiceOfGroup`) keeps this from happening; this is the
 * safety net, and it reports `ConcurrentUpdateError` instead of a raw database
 * error when the collision persists.
 */
export async function retryOnConflict<T>(
  run: () => Promise<T>,
  attempts = 3,
): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      if (!isRetryableConflict(error)) throw error;
      if (attempt >= attempts) throw new ConcurrentUpdateError();
      await new Promise((resolve) =>
        setTimeout(resolve, 25 * attempt + Math.random() * 50),
      );
    }
  }
}
